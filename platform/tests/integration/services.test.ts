import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, locations, tokenLedger, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { getScore } from '@/server/domains/reputation/service';
import { listNotifications } from '@/server/domains/notifications/service';
import {
  acceptResponse,
  cancelRequest,
  completeRequest,
  createRequest,
  getRequest,
  listBoard,
  providerInputSchema,
  reportServices,
  requestInputSchema,
  resolveServicesTicket,
  respond,
  responseInputSchema,
  reviewLicence,
  reviewProvider,
  saveProvider,
  servicesReviewQueue,
  setAvailableToday,
} from '@/server/domains/services/service';
import { REPUTATION_RULE_DEFAULTS, SERVICES_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'services-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;

async function member(name = 'Vecina') {
  const { userId } = await register(
    db(),
    { email: `sv-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const ask = (overrides: Record<string, unknown> = {}) =>
  requestInputSchema.parse({
    category: 'home_repairs',
    title: 'Se me gotea el techo',
    body: 'Está lloviendo fuerte y entra agua por el techo de la cocina. Necesito a alguien hoy.',
    locationId: placeId,
    urgent: false,
    anonymous: false,
    ...overrides,
  });

const profile = (overrides: Record<string, unknown> = {}) =>
  providerInputSchema.parse({
    headline: 'Techos y plomería, 20 años de oficio',
    bio: 'Reparo techos de teja y lámina, goteras y tuberías. Atiendo emergencias de noche.',
    categories: ['home_repairs'],
    locationId: placeId,
    whatsapp: '+502 5555 1234',
    licenceClaim: '',
    ...overrides,
  });

const answer = (message = 'Puedo ir en una hora con lona y teja nueva.') => responseInputSchema.parse({ message, priceText: 'Q300 aprox.' });

async function provider(overrides: Record<string, unknown> = {}) {
  const userId = await member('Don Julio');
  await db().transaction((tx) => saveProvider(tx, { userId, input: profile(overrides) }));
  return userId;
}

async function reviewer() {
  const userId = await member('Revisora');
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'moderator', grantedBy: null }));
  return userId;
}

beforeAll(async () => {
  const [place] = await db().select({ id: locations.id }).from(locations).where(eq(locations.level, 'city')).limit(1);
  placeId = place!.id;
});
beforeEach(async () => {
  await resetTransactionalData();
});
afterAll(async () => {
  await closeDb();
});

describe('asking and answering', () => {
  it('is free, shows the provider’s contact to the asker only, and runs to a review', async () => {
    const asker = await member('Doña Rosa');
    const fixer = await provider();
    const requestId = await db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask() }));

    const board = await listBoard(db(), { viewerId: fixer, locale: 'es' });
    expect(board.items.map((item) => item.id)).toEqual([requestId]);

    const responseId = await db().transaction((tx) => respond(tx, { providerUserId: fixer, requestId, input: answer() }));
    await expect(db().transaction((tx) => respond(tx, { providerUserId: fixer, requestId, input: answer() }))).rejects.toMatchObject({ messageKey: 'services.error.already_responded' });

    const asAsker = await getRequest(db(), { requestId, viewerId: asker, viewerIsModerator: false, locale: 'es' });
    expect(asAsker?.responses[0]).toMatchObject({ id: responseId, whatsappE164: '+50255551234', priceText: 'Q300 aprox.' });
    const asFixer = await getRequest(db(), { requestId, viewerId: fixer, viewerIsModerator: false, locale: 'es' });
    expect(asFixer?.responses[0]?.whatsappE164).toBeNull();
    expect((await listNotifications(db(), asker))[0]).toMatchObject({ titleKey: 'notify.services.response' });

    await db().transaction((tx) => acceptResponse(tx, { requesterUserId: asker, requestId, responseId }));
    expect((await listNotifications(db(), fixer)).map((n) => n.titleKey)).toContain('notify.services.accepted');
    await db().transaction((tx) => completeRequest(tx, { requesterUserId: asker, requestId }));

    const before = await getScore(db(), fixer);
    await db().transaction((tx) => reviewProvider(tx, { reviewerUserId: asker, requestId, rating: 5, body: 'Llegó de madrugada y lo dejó perfecto.' }));
    const delta = REPUTATION_RULE_DEFAULTS.find((rule) => rule.key === 'verified_positive_review')!.delta;
    expect(await getScore(db(), fixer)).toBe(before + delta);
    await expect(db().transaction((tx) => reviewProvider(tx, { reviewerUserId: asker, requestId, rating: 5, body: null }))).rejects.toMatchObject({ messageKey: 'services.error.already_reviewed' });

    const charges = await db().select().from(tokenLedger).where(eq(tokenLedger.relatedId, requestId));
    expect(charges).toHaveLength(0);
    const audits = await db().select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.subjectId, requestId));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['services.request_created', 'services.response_sent', 'services.response_accepted', 'services.request_completed']));
  });

  it('only lets a provider answer in their own categories, and never their own request', async () => {
    const asker = await member();
    const cleaner = await provider({ categories: ['cleaning_garden'] });
    const requestId = await db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask() }));
    await expect(db().transaction((tx) => respond(tx, { providerUserId: cleaner, requestId, input: answer() }))).rejects.toMatchObject({ messageKey: 'services.error.not_your_category' });
    await expect(db().transaction((tx) => respond(tx, { providerUserId: asker, requestId, input: answer() }))).rejects.toMatchObject({ messageKey: 'services.error.own' });
  });

  it('caps open requests per member', async () => {
    const asker = await member();
    for (let i = 0; i < SERVICES_RULES.maxOpenRequestsPerMember; i += 1) {
      await db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask() }));
    }
    await expect(db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask() }))).rejects.toMatchObject({ messageKey: 'services.error.too_many_open' });
    const [first] = (await listBoard(db(), { viewerId: asker, locale: 'es' })).items;
    await db().transaction((tx) => cancelRequest(tx, { requesterUserId: asker, requestId: first!.id }));
    await db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask() }));
  });
});

describe('Lo necesito hoy', () => {
  it('goes first on the board and straight to providers available today', async () => {
    const asker = await member();
    const available = await provider();
    const asleep = await provider();
    await db().transaction((tx) => setAvailableToday(tx, { userId: available, available: true }));

    const calm = await db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask({ title: 'Pintar la fachada' }) }));
    const urgent = await db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask({ urgent: true, title: 'Se desborda el inodoro' }) }));

    expect((await listBoard(db(), { viewerId: available, locale: 'es' })).items.map((i) => i.id)).toEqual([urgent, calm]);
    const news = await listNotifications(db(), available);
    expect(news.map((n) => n.titleKey)).toEqual(expect.arrayContaining(['notify.services.urgent', 'notify.services.new_requests']));
    // Not available today: told once a day that there is work, not woken for the urgent one.
    expect((await listNotifications(db(), asleep)).map((n) => n.titleKey)).toEqual(['notify.services.new_requests']);
  });
});

describe('licences and sensitive requests', () => {
  it('requires a stated licence for a regulated profession, and shows it verified only after review', async () => {
    const psychologist = await member('Lic. Marta');
    await expect(db().transaction((tx) => saveProvider(tx, { userId: psychologist, input: profile({ categories: ['mental_health'] }) }))).rejects.toMatchObject({ messageKey: 'services.error.licence_required' });
    await db().transaction((tx) => saveProvider(tx, { userId: psychologist, input: profile({ categories: ['mental_health'], licenceClaim: 'Psicóloga clínica, colegiada 4512, Colegio de Psicólogos' }) }));

    const asker = await member();
    const requestId = await db().transaction((tx) =>
      createRequest(tx, { requesterUserId: asker, input: ask({ category: 'mental_health', title: 'Crisis con mi pareja', body: 'Llevamos semanas peleando y hoy fue muy fuerte. Necesito hablar con alguien.', anonymous: true }) }),
    );
    // Pending is not verified, but it is enough to answer: the badge says which it is.
    const detail = await getRequest(db(), { requestId, viewerId: psychologist, viewerIsModerator: false, locale: 'es' });
    expect(detail?.request.requesterName).toBeNull();
    await db().transaction((tx) => respond(tx, { providerUserId: psychologist, requestId, input: answer('Puedo atenderte hoy por videollamada a las 8 de la noche.') }));
    const asAsker = await getRequest(db(), { requestId, viewerId: asker, viewerIsModerator: false, locale: 'es' });
    expect(asAsker?.responses[0]?.provider?.licenceStatus).toBe('pending');

    const rev = await reviewer();
    const queue = await servicesReviewQueue(db(), { userId: rev, status: 'active' }, 'es');
    expect(queue.licences.map((p) => p.userId)).toEqual([psychologist]);
    await db().transaction((tx) => reviewLicence(tx, { actor: { userId: rev, status: 'active' }, providerUserId: psychologist, decision: 'verify', note: null }));
    const verified = await getRequest(db(), { requestId, viewerId: asker, viewerIsModerator: false, locale: 'es' });
    expect(verified?.responses[0]?.provider?.licenceStatus).toBe('verified');

    // Changing the licence text sends it back to review.
    await db().transaction((tx) => saveProvider(tx, { userId: psychologist, input: profile({ categories: ['mental_health'], licenceClaim: 'Psicóloga clínica, colegiada 9999' }) }));
    const again = await getRequest(db(), { requestId, viewerId: asker, viewerIsModerator: false, locale: 'es' });
    expect(again?.responses[0]?.provider?.licenceStatus).toBe('pending');
  });

  it('hides a sensitive request from everyone but the asker and providers of that category', async () => {
    const asker = await member();
    const plumber = await provider();
    const outsider = await member();
    const requestId = await db().transaction((tx) =>
      createRequest(tx, { requesterUserId: asker, input: ask({ category: 'mental_health', title: 'Necesito orientación', body: 'Mi hijo adolescente no quiere hablar con nadie desde hace un mes.' }) }),
    );
    expect((await listBoard(db(), { viewerId: plumber, locale: 'es' })).items).toHaveLength(0);
    expect((await listBoard(db(), { viewerId: outsider, locale: 'es' })).items).toHaveLength(0);
    expect(await getRequest(db(), { requestId, viewerId: outsider, viewerIsModerator: false, locale: 'es' })).toBeNull();
    expect((await listBoard(db(), { viewerId: asker, locale: 'es' })).items.map((i) => i.id)).toEqual([requestId]);
  });

  it('does not allow a hidden name on an ordinary request', async () => {
    const asker = await member();
    await expect(db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask({ anonymous: true }) }))).rejects.toMatchObject({ messageKey: 'services.error.anonymous' });
  });
});

describe('reports', () => {
  it('lets a member report a provider, and a reviewer suspend them', async () => {
    const asker = await member();
    const fixer = await provider();
    const rev = await reviewer();
    const { ticketCode } = await db().transaction((tx) => reportServices(tx, { reporterUserId: asker, subject: 'provider', subjectId: fixer, category: 'scam', description: 'Cobró por adelantado y no vino.' }));
    expect(ticketCode).toBeTruthy();
    const queue = await servicesReviewQueue(db(), { userId: rev, status: 'active' }, 'es');
    const ticket = queue.reports.find((r) => r.kind === 'provider');
    await db().transaction((tx) => resolveServicesTicket(tx, { actor: { userId: rev, status: 'active' }, ticketId: ticket!.ticketId, decision: 'suspend_provider', note: 'Varias denuncias de cobro sin trabajo.' }));

    const requestId = await db().transaction((tx) => createRequest(tx, { requesterUserId: asker, input: ask() }));
    await expect(db().transaction((tx) => respond(tx, { providerUserId: fixer, requestId, input: answer() }))).rejects.toMatchObject({ messageKey: 'services.error.provider_suspended' });
    const audits = await db().select().from(auditEvents).where(and(eq(auditEvents.action, 'moderation.services_suspend_provider'), eq(auditEvents.subjectId, fixer)));
    expect(audits).toHaveLength(1);
  });
});
