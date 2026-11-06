import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { db } from '@/server/db/client';
import { AppShell } from '@/ui/components/app-shell';
import { CapabilityBadge } from '@/ui/components/capability-badge';
import { shellContext } from '@/ui/shell-context';
import { signInPath } from '@/server/auth/sign-in-path';
import { ROXI_PLANS } from '@/config/business-rules';
import { currentPlan } from '@/server/domains/roxi/credits';
import { connectorsAvailable, listConnections } from '@/server/domains/roxi/connectors/service';
import { googleConnectorAvailable } from '@/server/domains/roxi/connectors/google';
import { addApiAction, addMcpAction, refreshConnectionAction, removeConnectionAction } from '../actions';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('roxi.connect.title') };
}
export const dynamic = 'force-dynamic';

/**
 * The tools a member connects to Roxi: their Google account (Gmail and
 * Calendar), MCP servers, and APIs. What each plan allows is enforced by the
 * service; the page only shows it, and shows a kind the plan does not include
 * as such — never a form that would fail.
 */
export default async function RoxiConnectionsPage({ searchParams }: { searchParams: Promise<{ connected?: string; done?: string; error?: string; limit?: string }> }) {
  const { t, locale, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect(await signInPath());
  const query = await searchParams;
  const plan = (await currentPlan(db(), userId)).plan;
  const limits = ROXI_PLANS[plan];
  const connections = await listConnections(db(), userId);
  const available = connectorsAvailable();
  const room = connections.length < limits.connections;
  const may = (kind: 'google' | 'mcp' | 'api') => (limits.connectorKinds as readonly string[]).includes(kind);
  const googleReady = googleConnectorAvailable();
  const errorText = (() => {
    if (!query.error) return null;
    if (/^(roxi\.[a-z_.]+|error\.[a-z_.]+)$/.test(query.error)) return t(query.error as MessageKey, { limit: Number(query.limit) || 0 });
    // From the Google round trip, which can only pass a short word.
    const short = `roxi.connect.error.${query.error}`;
    return /^[a-z_]{2,30}$/.test(query.error) ? t(short as MessageKey, { limit: 0 }) : null;
  })();

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <section className="rx-hero">
        <p className="rx-eyebrow">
          <a href="/roxi">{t('roxi.plans.title')}</a>
        </p>
        <h1 className="rx-title">{t('roxi.connect.title')}</h1>
        <p className="rx-lead">{t('roxi.connect.lead')}</p>
        <p className="rx-small">
          {t('roxi.connect.count', { n: connections.length, limit: limits.connections, plan: t(`roxi.plan.${plan}` as MessageKey) })}
        </p>
      </section>

      {query.connected ? <p className="rx-banner is-good" role="status">{t('roxi.connect.connected')}</p> : null}
      {query.done === 'removed' ? <p className="rx-banner" role="status">{t('roxi.connect.removed')}</p> : null}
      {query.done === 'refreshed' ? <p className="rx-banner is-good" role="status">{t('roxi.connect.refreshed')}</p> : null}
      {errorText ? <p className="rx-banner is-warn" role="alert">{errorText}</p> : null}
      {!available ? <p className="rx-banner is-warn">{t('roxi.connect.unavailable')}</p> : null}

      <section className="rx-section">
        <h2>{t('roxi.connect.yours')}</h2>
        {connections.length === 0 ? (
          <p className="rx-small">{t('roxi.connect.none')}</p>
        ) : (
          <ul className="rx-conns">
            {connections.map((connection) => (
              <li key={connection.id} className="rx-conn">
                <div>
                  <p className="rx-conn-name">
                    {connection.label} <span className="rx-tag">{t(`roxi.connect.kind.${connection.kind}` as MessageKey)}</span>
                  </p>
                  <p className="rx-small">
                    {connection.detail ? `${connection.detail} · ` : ''}
                    {t('roxi.connect.tools', { n: connection.toolCount })}
                    {connection.lastUsedAt ? ` · ${t('roxi.connect.last_used', { date: connection.lastUsedAt.toLocaleDateString(locale) })}` : ''}
                  </p>
                  {!connection.allowed ? <p className="rx-small rx-warn">{t('roxi.connect.not_in_plan')}</p> : null}
                  {connection.status === 'error' ? <p className="rx-small rx-warn">{t('roxi.connect.failing')}</p> : null}
                </div>
                <div className="rx-conn-actions">
                  {connection.kind === 'mcp' ? (
                    <form action={refreshConnectionAction}>
                      <input type="hidden" name="id" value={connection.id} />
                      <button type="submit" className="rx-line">{t('roxi.connect.refresh')}</button>
                    </form>
                  ) : null}
                  <form action={removeConnectionAction}>
                    <input type="hidden" name="id" value={connection.id} />
                    <button type="submit" className="rx-line">{t('roxi.connect.remove')}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rx-section">
        <div className="flex items-center justify-between gap-3">
          <h2>{t('roxi.connect.google_title')}</h2>
          <CapabilityBadge state={googleReady ? 'REAL' : 'REQUIRES_CONFIGURATION'} t={t} />
        </div>
        <p className="rx-small">{t('roxi.connect.google_lead')}</p>
        {!googleReady ? (
          <p className="rx-small rx-warn">{t('roxi.connect.google_pending')}</p>
        ) : !may('google') ? (
          <p className="rx-small">
            {t('roxi.connect.needs_pro')} <a href="/roxi">{t('roxi.connect.see_plans')}</a>
          </p>
        ) : room && available ? (
          <a className="rx-cta" href="/api/roxi/connectors/google/start">
            {t('roxi.connect.google_button')}
          </a>
        ) : (
          <p className="rx-small">{t('roxi.connect.full')}</p>
        )}
      </section>

      <section className="rx-section">
        <h2>{t('roxi.connect.mcp_title')}</h2>
        <p className="rx-small">{t('roxi.connect.mcp_lead')}</p>
        {!may('mcp') ? (
          <p className="rx-small">
            {t('roxi.connect.needs_max')} <a href="/roxi">{t('roxi.connect.see_plans')}</a>
          </p>
        ) : room && available ? (
          <form action={addMcpAction} className="rx-form">
            <label>
              <span>{t('roxi.connect.field.label')}</span>
              <input name="label" maxLength={60} />
            </label>
            <label>
              <span>{t('roxi.connect.field.mcp_url')}</span>
              <input name="url" type="url" required placeholder="https://" inputMode="url" />
            </label>
            <label>
              <span>{t('roxi.connect.field.token')}</span>
              <input name="token" type="password" autoComplete="off" />
            </label>
            <label>
              <span>{t('roxi.connect.field.header')}</span>
              <input name="header" placeholder="Authorization" maxLength={40} />
            </label>
            <button type="submit" className="rx-cta">{t('roxi.connect.add_mcp')}</button>
          </form>
        ) : (
          <p className="rx-small">{t('roxi.connect.full')}</p>
        )}
      </section>

      <section className="rx-section">
        <h2>{t('roxi.connect.api_title')}</h2>
        <p className="rx-small">{t('roxi.connect.api_lead')}</p>
        {!may('api') ? (
          <p className="rx-small">
            {t('roxi.connect.needs_max')} <a href="/roxi">{t('roxi.connect.see_plans')}</a>
          </p>
        ) : room && available ? (
          <form action={addApiAction} className="rx-form">
            <label>
              <span>{t('roxi.connect.field.label')}</span>
              <input name="label" maxLength={60} />
            </label>
            <label>
              <span>{t('roxi.connect.field.api_url')}</span>
              <input name="url" type="url" required placeholder="https://api.example.com/v1/" inputMode="url" />
            </label>
            <label>
              <span>{t('roxi.connect.field.secret')}</span>
              <input name="secret" type="password" autoComplete="off" />
            </label>
            <div className="rx-form-row">
              <label>
                <span>{t('roxi.connect.field.header')}</span>
                <input name="header" placeholder="Authorization" maxLength={40} />
              </label>
              <label>
                <span>{t('roxi.connect.field.prefix')}</span>
                <input name="prefix" placeholder="Bearer" maxLength={20} />
              </label>
            </div>
            <label>
              <span>{t('roxi.connect.field.notes')}</span>
              <textarea name="notes" rows={3} maxLength={600} placeholder={t('roxi.connect.field.notes_hint')} />
            </label>
            <button type="submit" className="rx-cta">{t('roxi.connect.add_api')}</button>
          </form>
        ) : (
          <p className="rx-small">{t('roxi.connect.full')}</p>
        )}
      </section>

      <section className="rx-section">
        <h2>{t('roxi.connect.safety_title')}</h2>
        <ul className="rx-faq">
          <li>{t('roxi.connect.safety.confirm')}</li>
          <li>{t('roxi.connect.safety.sealed')}</li>
          <li>{t('roxi.connect.safety.data')}</li>
          <li>{t('roxi.connect.safety.private')}</li>
          <li>{t('roxi.connect.safety.remove')}</li>
        </ul>
      </section>
    </AppShell>
  );
}
