import './vault-admin.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { hasPermission } from '@/server/domains/access/authorize';
import { lookEnabled } from '@/server/domains/platform/looks';
import { signInPath } from '@/server/auth/sign-in-path';
import { earnedItems } from '@/config/play-looks';
import { vaultCatalogue, VAULT_MODES, VAULT_STATUSES } from '@/server/domains/play/vault';
import { createVaultProductAction, saveVaultCollectionAction, saveVaultProductAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * The Vault's admin (docs/PLAY.md, "The Vault"): every product and
 * collection, its price, status, game mode, numbered edition and whether it
 * is on sale. flags.manage, checked here and again by each change.
 */
export default async function VaultAdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; key?: string }> }) {
  const { c, t, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await hasPermission(db(), userId, 'flags.manage'))) notFound();
  const query = await searchParams;
  const es = await vaultCatalogue(db(), 'es', null, { all: true });
  const en = await vaultCatalogue(db(), 'en', null, { all: true });
  const collectiblesOpen = await lookEnabled(db(), 'vault_collectibles');
  const looks = earnedItems().filter((e) => e.unlock === 'vault').map((e) => e.item);
  const nameEn = new Map(en.products.map((p) => [p.key, p]));
  const sold = es.products.reduce((sum, p) => sum + p.sold, 0);
  const error = query.error ? t(`ops.vault.error.${query.error}` as MessageKey) : null;

  const fields = (p?: (typeof es.products)[number]) => (
    <>
      <label>
        {t('ops.vault.price')}
        <input name="priceGems" type="number" min={1} max={100000} defaultValue={p?.price ?? ''} required />
      </label>
      <label>
        {t('ops.vault.status')}
        <select name="status" defaultValue={p?.status ?? 'future'}>
          {VAULT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`play.vault.status.${s}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('ops.vault.mode')}
        <select name="mode" defaultValue={p?.mode ?? ''}>
          <option value="">—</option>
          {VAULT_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`play.vault.mode.${m}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('ops.vault.edition')}
        <input name="editionSize" type="number" min={1} defaultValue={p?.editionSize ?? ''} placeholder={t('ops.vault.edition_none')} />
      </label>
      <label>
        {t('ops.vault.look')}
        <select name="lookItem" defaultValue={p?.lookItem ?? ''}>
          <option value="">—</option>
          {looks.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('ops.vault.collection')}
        <select name="collectionKey" defaultValue={p?.collection ?? ''}>
          <option value="">—</option>
          {es.collections.map((col) => (
            <option key={col.key} value={col.key}>
              {col.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('ops.vault.name_es')}
        <input name="nameEs" defaultValue={p?.name ?? ''} maxLength={80} required />
      </label>
      <label>
        {t('ops.vault.name_en')}
        <input name="nameEn" defaultValue={p ? (nameEn.get(p.key)?.name ?? '') : ''} maxLength={80} required />
      </label>
      <label className="va-wide">
        {t('ops.vault.line_es')}
        <input name="lineEs" defaultValue={p?.line ?? ''} maxLength={200} />
      </label>
      <label className="va-wide">
        {t('ops.vault.line_en')}
        <input name="lineEn" defaultValue={p ? (nameEn.get(p.key)?.line ?? '') : ''} maxLength={200} />
      </label>
      <label className="va-check">
        <input name="onSale" type="checkbox" defaultChecked={p?.onSale ?? false} />
        {t('ops.vault.on_sale')}
      </label>
    </>
  );

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap">
          <h1>{t('ops.vault.title')}</h1>
          <p className="lead mb0">{t('ops.vault.lead')}</p>
        </div>
      </section>
      <div className="wrap va" style={{ paddingBottom: 56 }}>
        <p className="mk-banner" role="note">
          {collectiblesOpen ? t('ops.vault.collectibles_open') : t('ops.vault.collectibles_closed')}{' '}
          <Link href="/admin#looks">{t('ops.vault.switch_link')}</Link>
        </p>
        <p className="muted">{t('ops.vault.summary', { products: es.products.length, sold })}</p>
        {query.saved ? <p className="va-ok">{t('ops.vault.saved', { key: query.saved })}</p> : null}
        {error ? (
          <p className="va-error" role="alert">
            {query.key}: {error}
          </p>
        ) : null}

        <section className="card va-section">
          <h2>{t('ops.vault.collections')}</h2>
          {es.collections.map((col) => (
            <form key={col.key} id={col.key} action={saveVaultCollectionAction} className="va-row">
              <input type="hidden" name="key" value={col.key} />
              <strong>{col.name}</strong>
              <label>
                {t('ops.vault.bundle')}
                <input name="bundleGems" type="number" min={1} defaultValue={col.bundle ?? ''} />
              </label>
              <label className="va-check">
                <input name="onSale" type="checkbox" defaultChecked={col.onSale} />
                {t('ops.vault.on_sale')}
              </label>
              <button className="btn btn-line" type="submit">
                {t('ops.vault.save')}
              </button>
            </form>
          ))}
        </section>

        <section className="card va-section">
          <h2>{t('ops.vault.products')}</h2>
          {es.products.map((p) => (
            <details key={p.key} id={p.key} className="va-product">
              <summary>
                {/* eslint-disable-next-line @next/next/no-img-element -- a 192px thumbnail */}
                <img src={p.image} alt="" width={48} height={48} loading="lazy" />
                <span className="va-name">{p.name}</span>
                <span className={`va-badge is-${p.status}`}>{t(`play.vault.status.${p.status}` as MessageKey)}</span>
                <span className="va-meta">
                  ◆ {p.price}
                  {p.editionSize ? ` · ${p.sold}/${p.editionSize}` : p.sold ? ` · ${p.sold}` : ''}
                  {p.onSale ? '' : ` · ${t('ops.vault.off_sale')}`}
                </span>
              </summary>
              <form action={saveVaultProductAction} className="va-form">
                <input type="hidden" name="key" value={p.key} />
                {fields(p)}
                <button className="btn btn-gold" type="submit">
                  {t('ops.vault.save')}
                </button>
              </form>
            </details>
          ))}
        </section>

        <section className="card va-section">
          <h2>{t('ops.vault.new')}</h2>
          <p className="muted">{t('ops.vault.new_note')}</p>
          <form action={createVaultProductAction} className="va-form">
            <label>
              {t('ops.vault.key')}
              <input name="key" pattern="[a-z0-9_]{2,40}" required />
            </label>
            {fields()}
            <button className="btn btn-gold" type="submit">
              {t('ops.vault.create')}
            </button>
          </form>
        </section>
      </div>
    </SiteShell>
  );
}
