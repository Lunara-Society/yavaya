import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { currentSession } from '@/server/auth/context';
import { revokeSession } from '@/server/auth/session';
import { roxiMember } from '@/server/domains/roxi/service';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store' };

/** Who the app's session belongs to, or `signedIn: false` once it has ended (expired, revoked, signed out elsewhere). */
export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ signedIn: false }, { headers: noStore });
  const { locale } = await getTranslator();
  const member = await roxiMember(db(), session.user.userId, locale);
  return NextResponse.json(
    { signedIn: true, member: member ? { firstName: member.firstName, yayId: member.yayId, placeName: member.placeName } : null },
    { headers: noStore },
  );
}

/** Signing out of the app ends its session on the server, and with it the app's website screens, which share it. */
export async function DELETE() {
  const session = await currentSession();
  if (session) await db().transaction((tx) => revokeSession(tx, session.sessionId, 'signed_out'));
  return NextResponse.json({ signedIn: false }, { headers: noStore });
}
