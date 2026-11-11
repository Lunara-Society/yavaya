import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { currentSession } from '@/server/auth/context';
import { hasPermission } from '@/server/domains/access/authorize';
import { listInbox, openConversation, whatsappAvailability } from '@/server/domains/whatsapp/service';
import { WHATSAPP_RULES } from '@/config/business-rules';
import { intlLocale } from '@/ui/mercadito/format';
import { signInPath } from '@/server/auth/sign-in-path';
import { viewerTimeZone, zonedFormat } from '@/server/time/viewer';
import { roxiWhatsappReady, roxiWhatsappSwitch } from '@/server/domains/whatsapp/roxi';
import { deleteConversationAction, replyAction, roxiConversationAction, roxiSwitchAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('whatsapp.inbox.title'), robots: { index: false } };
}

/** "+505 8888 1234"-style, for reading; the stored id is digits only. */
const phone = (waId: string) => `+${waId}`;

/**
 * The WhatsApp team inbox: what people wrote to Yavaya's number, and what the
 * team answered (from here or from the phone app). Staff with
 * `whatsapp.inbox` only; the service checks it again on every read and write.
 */
export default async function WhatsappInbox({ searchParams }: { searchParams: Promise<{ c?: string; error?: string; sent?: string; deleted?: string; roxi?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await hasPermission(db(), userId, 'whatsapp.inbox'))) notFound();
  const session = await currentSession();
  const actor = session ? { userId, status: session.user.status } : null;
  const availability = whatsappAvailability();
  const zone = await viewerTimeZone(userId);
  const when = zonedFormat(intlLocale(locale), zone, { dateStyle: 'medium', timeStyle: 'short' });
  const contacts = availability.receive ? await listInbox(db(), actor) : [];
  const selected = query.c && /^\d{6,20}$/.test(query.c) && availability.receive ? await openConversation(db(), actor, query.c) : null;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? (query.error as MessageKey) : null;
  const roxiReady = roxiWhatsappReady();
  const roxiOn = roxiReady.ready && (await roxiWhatsappSwitch(db()));
  const canSwitchRoxi = await hasPermission(db(), userId, 'whatsapp.roxi');

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="wrap cm-column">
        <p className="go-crumbs">
          <Link href="/admin">← {t('nav.ops')}</Link>
        </p>
        <h1 className="h-md">{t('whatsapp.inbox.title')}</h1>
        <p className="muted">{t('whatsapp.inbox.lead')}</p>
        {!availability.receive ? <p className="mk-error">{t('whatsapp.inbox.not_configured', { missing: availability.missing.join(', ') })}</p> : null}
        {query.sent ? <p className="mk-banner" role="status">{t('whatsapp.inbox.sent')}</p> : null}
        {query.deleted ? <p className="mk-banner" role="status">{t('whatsapp.inbox.deleted')}</p> : null}
        {error ? <p className="mk-error">{t(error)}</p> : null}
        {query.roxi === 'on' ? <p className="mk-banner" role="status">{t('whatsapp.roxi.turned_on')}</p> : null}
        {query.roxi === 'off' ? <p className="mk-banner" role="status">{t('whatsapp.roxi.turned_off')}</p> : null}

        {availability.receive ? (
          <section className="card mt">
            <h2>{t('whatsapp.roxi.title')}</h2>
            <p className="muted">{roxiOn ? t('whatsapp.roxi.on') : t('whatsapp.roxi.off')}</p>
            {!roxiReady.ready ? <p className="hint muted">{t('whatsapp.roxi.not_ready', { missing: roxiReady.missing.join(', ') })}</p> : null}
            {canSwitchRoxi && (roxiReady.ready || roxiOn) ? (
              <form action={roxiSwitchAction}>
                <input type="hidden" name="on" value={roxiOn ? '0' : '1'} />
                <button className={roxiOn ? 'btn btn-line' : 'btn btn-gold'} type="submit">
                  {t(roxiOn ? 'whatsapp.roxi.turn_off' : 'whatsapp.roxi.turn_on')}
                </button>
              </form>
            ) : null}
          </section>
        ) : null}

        {selected ? (
          <section className="card mt">
            <p className="go-crumbs">
              <Link href="/admin/whatsapp">← {t('whatsapp.inbox.all')}</Link>
            </p>
            <h2>{selected.contact.name ?? phone(selected.contact.waId)}</h2>
            <p className="muted">
              {phone(selected.contact.waId)} ·{' '}
              <a href={`https://wa.me/${selected.contact.waId}`} target="_blank" rel="noopener noreferrer">
                {t('whatsapp.inbox.open_in_whatsapp')}
              </a>
            </p>
            <ul className="wa-thread">
              {selected.messages.map((m) => (
                <li key={m.id} className={m.direction === 'out' ? 'wa-msg wa-out' : 'wa-msg wa-in'}>
                  <p>{m.text ?? t(`whatsapp.kind.${m.kind}` as MessageKey)}</p>
                  <p className="hint muted">
                    {when.format(m.sentAt)}
                    {m.direction === 'out' ? ` · ${t(m.byRoxi ? 'whatsapp.roxi.by_roxi' : m.fromInbox ? 'whatsapp.inbox.from_inbox' : 'whatsapp.inbox.from_phone')}` : ''}
                    {m.direction === 'out' && m.status ? ` · ${t(`whatsapp.status.${m.status}` as MessageKey)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            {availability.reply ? (
              selected.canReplyUntil ? (
                <form action={replyAction} className="mk-form">
                  <input type="hidden" name="waId" value={selected.contact.waId} />
                  <label>
                    <span>{t('whatsapp.inbox.reply')}</span>
                    <textarea name="text" required maxLength={WHATSAPP_RULES.replyMaxLength} rows={3} />
                  </label>
                  <p className="hint muted">{t('whatsapp.inbox.window', { time: when.format(selected.canReplyUntil) })}</p>
                  <button className="btn btn-gold" type="submit">
                    {t('whatsapp.inbox.send')}
                  </button>
                </form>
              ) : (
                <p className="muted">{t('whatsapp.inbox.window_closed', { hours: WHATSAPP_RULES.replyWindowHours })}</p>
              )
            ) : (
              <p className="muted">{t('whatsapp.inbox.reply_from_phone')}</p>
            )}
            {roxiOn ? (
              <form action={roxiConversationAction} className="mt">
                <input type="hidden" name="waId" value={selected.contact.waId} />
                <p className="hint muted">
                  {selected.contact.needsTeam
                    ? t('whatsapp.roxi.handed_over')
                    : selected.contact.roxiPausedUntil
                      ? t('whatsapp.roxi.paused_until', { time: when.format(selected.contact.roxiPausedUntil) })
                      : t('whatsapp.roxi.active_here')}
                </p>
                <input type="hidden" name="on" value={selected.contact.needsTeam || selected.contact.roxiPausedUntil ? '1' : '0'} />
                <button className="btn btn-line" type="submit">
                  {t(selected.contact.needsTeam || selected.contact.roxiPausedUntil ? 'whatsapp.roxi.resume' : 'whatsapp.roxi.pause')}
                </button>
              </form>
            ) : null}
            <form action={deleteConversationAction} className="mt">
              <input type="hidden" name="waId" value={selected.contact.waId} />
              <button className="btn btn-line" type="submit">
                {t('whatsapp.inbox.delete')}
              </button>
              <span className="hint muted"> {t('whatsapp.inbox.delete_note')}</span>
            </form>
          </section>
        ) : null}

        {availability.receive && !selected ? (
          contacts.length === 0 ? (
            <p className="muted mt">{t('whatsapp.inbox.empty')}</p>
          ) : (
            <ul className="wa-list mt">
              {contacts.map((contact) => (
                <li key={contact.waId}>
                  <Link href={`/admin/whatsapp?c=${contact.waId}`} className="card wa-row">
                    <strong>{contact.name ?? phone(contact.waId)}</strong>
                    <span className="muted"> · {phone(contact.waId)} · {when.format(contact.lastMessageAt)}</span>
                    {contact.unread > 0 ? <span className="wa-unread"> {t('whatsapp.inbox.unread', { n: contact.unread })}</span> : null}
                    {contact.needsTeam ? <span className="wa-unread"> · {t('whatsapp.roxi.needs_team')}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </SiteShell>
  );
}
