import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { demoContent, locations, users, workEmployers, workPosts } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { employerInputSchema, postInputSchema, publishPost, saveEmployer } from '@/server/domains/work/service';
import { recentOpportunities } from '@/server/domains/discovery/recent';
import { resetTransactionalData } from '../helpers/database';

/**
 * The home page's "Oportunidades recientes": real, public, newest first — and
 * nothing registered as demo, whatever type it was registered under.
 */

const context = { networkHash: null, addressHash: 'home-recent-test', deviceFingerprint: null, userAgent: 'vitest' };
let placeId: string;

async function employer(name: string) {
  const { userId } = await register(
    db(),
    { email: `hr-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  const input = employerInputSchema.parse({
    kind: 'business',
    name,
    registration: 'J0310000012345',
    about: 'Negocio familiar en el centro de León desde 1998. Contratamos vendedores y técnicos.',
    website: '',
    locationId: placeId,
    whatsapp: '+505 8888 3333',
  });
  await db().transaction((tx) => saveEmployer(tx, { userId, input }));
  await db().update(workEmployers).set({ status: 'approved' }).where(eq(workEmployers.userId, userId));
  return userId;
}

async function post(employerUserId: string, title: string, createdAt: Date) {
  const input = postInputSchema.parse({
    kind: 'job',
    employment: 'full_time',
    field: 'technology',
    title,
    description: 'Buscamos una persona para dar soporte a 30 computadoras de oficina, redes e impresoras. Horario de lunes a viernes.',
    requirements: 'Dos años de experiencia.',
    payText: 'C$18,000 al mes',
    companyName: 'Ferretería El Sol',
    locationId: placeId,
    placeMode: 'onsite',
    whatsapp: '+505 8888 2222',
    noFeePromise: true,
  });
  const id = await db().transaction((tx) => publishPost(tx, { employerUserId, input }));
  // Fixed times, so "newest first" is tested rather than the order the rows happened to be written in.
  await db().update(workPosts).set({ createdAt }).where(eq(workPosts.id, id));
  return id;
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

describe('recent opportunities on the home page', () => {
  it('is empty when nothing has been posted, rather than filled with examples', async () => {
    expect(await recentOpportunities(db(), { locale: 'es', limit: 8 })).toEqual([]);
  });

  it('lists real posts newest first, leaves out demo rows, and stops at the limit', async () => {
    const a = await employer('Ferretería El Sol');
    const b = await employer('Hotel La Plaza');
    const oldest = await post(a, 'Técnico de soporte', new Date('2026-10-01T12:00:00Z'));
    const demo = await post(a, 'Técnico de redes', new Date('2026-10-03T12:00:00Z'));
    const newest = await post(b, 'Recepcionista bilingüe', new Date('2026-10-05T12:00:00Z'));
    // Registered under a type name the home page does not look for: still excluded, because ids are what match.
    await db()
      .insert(demoContent)
      .values({ subjectType: 'some_other_name', subjectId: demo, expiresAt: new Date(Date.now() + 86_400_000) });

    const recent = await recentOpportunities(db(), { locale: 'es', limit: 8 });
    expect(recent.map((o) => o.id)).toEqual([newest, oldest]);
    expect(recent[0]).toMatchObject({ kind: 'job', href: `/work/posts/${newest}`, title: 'Recepcionista bilingüe', topic: 'technology', payText: 'C$18,000 al mes', price: null });

    expect((await recentOpportunities(db(), { locale: 'es', limit: 1 })).map((o) => o.id)).toEqual([newest]);
  });
});
