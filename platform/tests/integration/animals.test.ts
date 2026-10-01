import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { animalsApplications, auditEvents, locations, tokenLedger, users } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { getScore } from '@/server/domains/reputation/service';
import { listNotifications } from '@/server/domains/notifications/service';
import {
  animalsReviewQueue,
  applicationInputSchema,
  applyAsRescuer,
  applyToAdopt,
  completeAdoption,
  decideApplication,
  getAnimal,
  getCertificate,
  listAnimals,
  listingInputSchema,
  publishAnimal,
  reportAnimal,
  rescuerInputSchema,
  resolveAnimalsTicket,
  reviewRescuer,
  sendAdoptionFollowUps,
  submitQuiz,
  withdrawApplication,
} from '@/server/domains/animals/service';
import type { StoredImage } from '@/server/domains/media/service';
import { QUIZ, COMMITMENTS } from '@/config/animals';
import { ANIMALS_RULES, REPUTATION_RULE_DEFAULTS } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'animals-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;

async function member(name = 'Vecina') {
  const { userId } = await register(
    db(),
    { email: `an-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  return userId;
}

const rightAnswers = () => QUIZ.map((question) => question.correct);

async function certified(name = 'Adoptante') {
  const userId = await member(name);
  await db().transaction((tx) => submitQuiz(tx, { userId, answers: rightAnswers() }));
  return userId;
}

async function reviewer() {
  const userId = await member('Revisora');
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'district_reviewer', grantedBy: null }));
  return userId;
}

async function approvedRescuer() {
  const userId = await member('Rescate Patitas');
  await db().transaction((tx) =>
    applyAsRescuer(tx, {
      userId,
      input: rescuerInputSchema.parse({
        kind: 'organisation',
        name: 'Rescate Patitas León',
        about: 'Rescatamos perros y gatos de la calle desde 2019. Los esterilizamos y vacunamos antes de darlos en adopción.',
        locationId: placeId,
        whatsapp: '+505 8888 1234',
      }),
    }),
  );
  const rev = await reviewer();
  await db().transaction((tx) => reviewRescuer(tx, { actor: { userId: rev, status: 'active' }, rescuerUserId: userId, decision: 'approve', note: null }));
  return { userId, rev };
}

function fakeImages(count: number): StoredImage[] {
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    storageKey: `animal_photo/test/${crypto.randomUUID()}.webp`,
    contentType: 'image/webp',
    width: 800,
    height: 600,
    bytes: 1000,
    sourceSha256: crypto.randomUUID().replace(/-/g, ''),
  })) as StoredImage[];
}

const animal = (overrides: Record<string, unknown> = {}) =>
  listingInputSchema.parse({
    species: 'dog',
    name: 'Canela',
    sex: 'female',
    size: 'medium',
    ageMonths: 18,
    sterilised: true,
    vaccinated: true,
    dewormed: true,
    healthNotes: '',
    temperament: 'Tranquila, se lleva bien con niños.',
    description: 'La encontramos en el mercado, muy flaca. Hoy está sana, esterilizada y busca una familia que la quiera.',
    locationId: placeId,
    ...overrides,
  });

const application = (overrides: Record<string, unknown> = {}) =>
  applicationInputSchema.parse({
    answers: {
      homeType: 'house',
      tenure: 'own',
      landlordAllows: 'na',
      fencedYard: 'yes',
      household: 'Mi esposo, yo y dos hijos de 8 y 12 años.',
      allAgree: true,
      otherAnimals: 'Un gato de 5 años.',
      otherAnimalsSterilised: 'yes',
      experience: 'Tuvimos una perra 12 años.',
      hoursAlone: 4,
      sleepsWhere: 'inside',
      vetPlan: 'Veterinaria del barrio, chequeo cada año.',
      whyAdopt: 'Queremos darle un hogar a una perra rescatada.',
      ...(overrides.answers as object),
    },
    commitments: [...COMMITMENTS],
    ...overrides,
  });

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

describe('learning first', () => {
  it('grants the certificate only on a passing score, and never takes it away', async () => {
    const userId = await member();
    const failing = rightAnswers().map((answer, index) => (index < 3 ? ((answer + 1) % 3) : answer));
    const fail = await db().transaction((tx) => submitQuiz(tx, { userId, answers: failing }));
    expect(fail).toMatchObject({ score: QUIZ.length - 3, passed: false });
    expect(fail.wrong).toHaveLength(3);
    expect(await getCertificate(db(), userId)).toBeNull();

    const pass = await db().transaction((tx) => submitQuiz(tx, { userId, answers: rightAnswers() }));
    expect(pass).toMatchObject({ score: QUIZ.length, passed: true });
    await db().transaction((tx) => submitQuiz(tx, { userId, answers: failing }));
    expect((await getCertificate(db(), userId))?.score).toBe(QUIZ.length);
    expect(ANIMALS_RULES.quizPassMark).toBeLessThanOrEqual(QUIZ.length);
  });
});

describe('rescuers', () => {
  it('cannot publish until a reviewer approves them', async () => {
    const userId = await member();
    await db().transaction((tx) =>
      applyAsRescuer(tx, { userId, input: rescuerInputSchema.parse({ kind: 'person', name: 'Doña Marta', about: 'Rescato perritos abandonados en mi colonia y los cuido hasta encontrarles casa.', locationId: placeId, whatsapp: '+505 8888 4321' }) }),
    );
    await expect(db().transaction((tx) => publishAnimal(tx, { rescuerUserId: userId, input: animal(), images: fakeImages(1) }))).rejects.toMatchObject({ messageKey: 'animals.error.not_rescuer' });
    const rev = await reviewer();
    const queue = await animalsReviewQueue(db(), { userId: rev, status: 'active' }, 'es');
    expect(queue.rescuers.map((r) => r.userId)).toEqual([userId]);
  });
});

describe('adopting', () => {
  it('needs the certificate, a full application and the rescuer’s choice, and earns reputation', async () => {
    const { userId: rescuer } = await approvedRescuer();
    const listingId = await db().transaction((tx) => publishAnimal(tx, { rescuerUserId: rescuer, input: animal(), images: fakeImages(2) }));
    expect((await listAnimals(db(), { locale: 'es' })).items.map((a) => a.id)).toEqual([listingId]);

    const uncertified = await member();
    await expect(db().transaction((tx) => applyToAdopt(tx, { applicantUserId: uncertified, listingId, input: application() }))).rejects.toMatchObject({ messageKey: 'animals.error.need_certificate' });
    expect(applicationInputSchema.safeParse({ ...application(), commitments: ['no_chain'] }).success).toBe(false);

    const family = await certified('Familia López');
    const other = await certified('Otro');
    const appId = await db().transaction((tx) => applyToAdopt(tx, { applicantUserId: family, listingId, input: application() }));
    const otherId = await db().transaction((tx) => applyToAdopt(tx, { applicantUserId: other, listingId, input: application() }));
    expect((await listNotifications(db(), rescuer)).map((n) => n.titleKey)).toContain('notify.animals.application');

    const asRescuer = await getAnimal(db(), { listingId, viewerId: rescuer, viewerIsReviewer: false, locale: 'es' });
    expect(asRescuer?.applications.map((a) => a.id)).toEqual([appId, otherId]);
    const asFamilyBefore = await getAnimal(db(), { listingId, viewerId: family, viewerIsReviewer: false, locale: 'es' });
    expect(asFamilyBefore?.rescuerWhatsapp).toBeNull();

    await db().transaction((tx) => decideApplication(tx, { rescuerUserId: rescuer, applicationId: appId, decision: 'approve', note: null }));
    expect((await listAnimals(db(), { locale: 'es' })).items).toHaveLength(0);
    const asFamily = await getAnimal(db(), { listingId, viewerId: family, viewerIsReviewer: false, locale: 'es' });
    expect(asFamily?.rescuerWhatsapp).toBe('+50588881234');

    const before = await getScore(db(), family);
    await db().transaction((tx) => completeAdoption(tx, { rescuerUserId: rescuer, applicationId: appId }));
    const delta = REPUTATION_RULE_DEFAULTS.find((rule) => rule.key === 'approved_animal_adoption')!.delta;
    expect(await getScore(db(), family)).toBe(before + delta);
    const [loser] = await db().select({ status: animalsApplications.status }).from(animalsApplications).where(eq(animalsApplications.id, otherId));
    expect(loser?.status).toBe('rejected');
    expect((await listNotifications(db(), other)).map((n) => n.titleKey)).toContain('notify.animals.found_home');

    const charges = await db().select().from(tokenLedger).where(eq(tokenLedger.relatedId, listingId));
    expect(charges).toHaveLength(0);
  });

  it('puts the animal back when the chosen home withdraws, and declines need a reason', async () => {
    const { userId: rescuer } = await approvedRescuer();
    const listingId = await db().transaction((tx) => publishAnimal(tx, { rescuerUserId: rescuer, input: animal({ species: 'cat', name: 'Mishi', size: 'small' }), images: fakeImages(1) }));
    const family = await certified();
    const appId = await db().transaction((tx) => applyToAdopt(tx, { applicantUserId: family, listingId, input: application() }));
    await expect(db().transaction((tx) => decideApplication(tx, { rescuerUserId: rescuer, applicationId: appId, decision: 'reject', note: null }))).rejects.toMatchObject({ messageKey: 'animals.error.decision_note' });
    await db().transaction((tx) => decideApplication(tx, { rescuerUserId: rescuer, applicationId: appId, decision: 'approve', note: null }));
    await db().transaction((tx) => withdrawApplication(tx, { applicantUserId: family, applicationId: appId }));
    expect((await listAnimals(db(), { locale: 'es', species: 'cat' })).items.map((a) => a.id)).toEqual([listingId]);
  });

  it('asks how it is going a month later, once', async () => {
    const { userId: rescuer } = await approvedRescuer();
    const listingId = await db().transaction((tx) => publishAnimal(tx, { rescuerUserId: rescuer, input: animal(), images: fakeImages(1) }));
    const family = await certified();
    const appId = await db().transaction((tx) => applyToAdopt(tx, { applicantUserId: family, listingId, input: application() }));
    await db().transaction((tx) => decideApplication(tx, { rescuerUserId: rescuer, applicationId: appId, decision: 'approve', note: null }));
    const adoptedAt = new Date(Date.now() - (ANIMALS_RULES.followUpDays + 1) * 86_400_000);
    await db().transaction((tx) => completeAdoption(tx, { rescuerUserId: rescuer, applicationId: appId, now: adoptedAt }));
    expect(await sendAdoptionFollowUps(db())).toEqual({ sent: 1 });
    expect(await sendAdoptionFollowUps(db())).toEqual({ sent: 0 });
    expect((await listNotifications(db(), family)).map((n) => n.titleKey)).toContain('notify.animals.follow_up_adopter');
    expect((await listNotifications(db(), rescuer)).map((n) => n.titleKey)).toContain('notify.animals.follow_up_rescuer');
  });
});

describe('reports', () => {
  it('lets a reviewer remove a listing and suspend its rescuer', async () => {
    const { userId: rescuer, rev } = await approvedRescuer();
    const listingId = await db().transaction((tx) => publishAnimal(tx, { rescuerUserId: rescuer, input: animal(), images: fakeImages(1) }));
    const second = await db().transaction((tx) => publishAnimal(tx, { rescuerUserId: rescuer, input: animal({ name: 'Bruno' }), images: fakeImages(1) }));
    const reporter = await member();
    await db().transaction((tx) => reportAnimal(tx, { reporterUserId: reporter, listingId, category: 'scam', description: 'Me pidió dinero por el perro.' }));
    const queue = await animalsReviewQueue(db(), { userId: rev, status: 'active' }, 'es');
    await db().transaction((tx) => resolveAnimalsTicket(tx, { actor: { userId: rev, status: 'active' }, ticketId: queue.reports[0]!.ticketId, decision: 'suspend_rescuer', note: 'Cobraba por las adopciones.' }));
    expect((await listAnimals(db(), { locale: 'es' })).items).toHaveLength(0);
    expect(await getAnimal(db(), { listingId: second, viewerId: reporter, viewerIsReviewer: false, locale: 'es' })).toBeNull();
    const audits = await db().select().from(auditEvents).where(and(eq(auditEvents.action, 'moderation.animals_suspend_rescuer'), eq(auditEvents.subjectId, listingId)));
    expect(audits).toHaveLength(1);
  });
});
