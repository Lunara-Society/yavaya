import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { findPublicMember } from '@/server/domains/identity/profile';
import { publishedIdentity } from '@/server/domains/identity/studio';
import { buildTrustShield } from '@/server/domains/trust/shield';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { TrustSlot } from '@/ui/identity/module-slots';
import { ShareOnWhatsApp } from '@/ui/site/share-whatsapp';
import { PrintButton } from '@/ui/identity/print-button';
import './tarjeta.css';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ yayId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { yayId } = await params;
  const member = await findPublicMember(db(), yayId);
  const { t } = await siteContext();
  return member ? { title: t('card.title', { name: member.displayName }) } : {};
}

/**
 * A member's card: the same public facts as their profile, on one small page
 * made to be passed on — a link for WhatsApp, a QR code to print on an invoice
 * or hang at a stall. It shows only what every visitor may see (the name, the
 * headline the member publishes to all, and the Trust Shield, which a member
 * cannot hide), so it is safe to hand to a stranger. The QR code holds the
 * address of the profile and nothing else.
 */
export default async function MemberCardPage({ params }: Params) {
  const { yayId } = await params;
  const { c, t, language, theme, member, userId } = await siteContext();
  const profile = await findPublicMember(db(), yayId);
  if (!profile) notFound();
  const [shield, identity] = await Promise.all([buildTrustShield(db(), profile.userId), publishedIdentity(db(), profile.userId)]);
  if (!shield) notFound();

  const id = formatYayId(profile.yayDigits);
  const base = serverEnv().APP_URL.replace(/\/+$/, '');
  const profileUrl = `${base}/members/${id}`;
  // Our own data, drawn by the qrcode library: an SVG with no script.
  const qr = await QRCode.toString(profileUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1526', light: '#ffffff' } });
  const isOwner = userId === profile.userId;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="wrap tj-wrap">
        <p className="tj-back">
          <Link href={`/members/${id}`}>← {t('card.back')}</Link>
        </p>
        <article className="tj-card">
          {/* The Trust Shield below carries the name, the YAY ID and the score; the card adds only the member's own headline. */}
          {identity.content.headline ? <p className="tj-headline">{identity.content.headline}</p> : null}
          <div className="tj-trust">
            <TrustSlot shield={shield} t={t} />
          </div>
          <div className="tj-qr">
            <div className="tj-qr-code" dangerouslySetInnerHTML={{ __html: qr }} />
            <p>{t('card.scan')}</p>
            <p className="tj-url">{profileUrl.replace(/^https?:\/\//, '')}</p>
          </div>
        </article>
        <div className="tj-actions">
          <ShareOnWhatsApp label={t('card.share')} text={t(isOwner ? 'card.share_text_own' : 'card.share_text', { name: profile.displayName, url: profileUrl })} />
          <PrintButton label={t('card.print')} />
        </div>
        {isOwner ? <p className="hint tj-hint">{t('card.owner_hint')}</p> : null}
      </div>
    </SiteShell>
  );
}
