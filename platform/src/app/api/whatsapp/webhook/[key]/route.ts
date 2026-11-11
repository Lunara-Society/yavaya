import { after } from 'next/server';
import { db } from '@/server/db/client';
import { answerWithRoxi } from '@/server/domains/whatsapp/roxi';
import { ingestDelivery, parseDelivery, sendSystemText, signatureAccepted, verifyHandshake, webhookKeyMatches, type ParsedDelivery } from '@/server/domains/whatsapp/service';
import { confirmWhatsappLink } from '@/server/domains/identity/phone/whatsapp-link';
import { createTranslator } from '@/i18n';

export const dynamic = 'force-dynamic';

/**
 * Where Meta delivers WhatsApp messages for Yavaya's number (through the
 * Dualhook connection). The address carries WHATSAPP_WEBHOOK_KEY: the path is
 * the first guard, since through Dualhook the Meta app and its signing secret
 * may not be Yavaya's; when WHATSAPP_APP_SECRET is set the signature is
 * checked as well. A wrong key gets the same 404 as an address that does not
 * exist, so the endpoint cannot be found by trying.
 *
 * Meta retries anything that is not a 200, and stores nothing on its side for
 * long, so a delivery that failed to store answers 500 and comes again; one
 * that was stored before is stored once (domains/whatsapp/service.ts).
 */

const MAX_BODY = 512 * 1024;
const notFound = () => new Response(null, { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!webhookKeyMatches((await params).key)) return notFound();
  const challenge = verifyHandshake(new URL(request.url).searchParams);
  return challenge ? new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } }) : new Response(null, { status: 403 });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!webhookKeyMatches((await params).key)) return notFound();
  const raw = await request.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY) return new Response(null, { status: 413 });
  if (!signatureAccepted(raw, request.headers.get('x-hub-signature-256'))) return new Response(null, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Not something Meta sends; answered 200 so it is not retried forever.
    return new Response(null, { status: 200 });
  }
  const delivery = parseDelivery(payload);
  const { newInbound } = await ingestDelivery(db(), delivery);
  // Roxi answers after Meta has its 200, never holding the delivery open while she thinks.
  if (newInbound.length > 0) {
    after(async () => {
      for (const waId of newInbound) {
        // A member sending their verification code is answered by Yavaya itself, not by Roxi.
        const linked = await confirmCodes(waId, delivery).catch((error: unknown) => {
          console.error('whatsapp.link', error instanceof Error ? error.message : 'failed');
          return false;
        });
        if (linked) continue;
        await answerWithRoxi(db(), waId).catch((error: unknown) => console.error('whatsapp.roxi', error instanceof Error ? error.message : 'failed'));
      }
    });
  }
  return new Response(null, { status: 200 });
}

/** Tries each new text from this number as a verification code; says so in the chat when one links the number. */
async function confirmCodes(waId: string, delivery: ParsedDelivery): Promise<boolean> {
  for (const message of delivery.messages) {
    if (message.waId !== waId || message.direction !== 'in' || !message.text) continue;
    const result = await confirmWhatsappLink(db(), { waId, text: message.text });
    if (result.linked) {
      await sendSystemText(db(), waId, createTranslator('es')('phone.whatsapp.linked'));
      return true;
    }
  }
  return false;
}
