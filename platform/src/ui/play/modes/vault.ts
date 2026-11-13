import type { Mode } from '../engine/runtime';
import { menuStage } from '../engine/stage';
import { el, type PlayContext } from '../context';

/**
 * The Vault (docs/PLAY.md, "The Vault"): Yavaya Play's premium looks and
 * collectibles, for gems. Every product says what it is today: available
 * now, collectible only (owned, not wearable yet), or waiting for a future
 * game mode. Stock counts are the real ones (copies sold of a numbered
 * edition, from the server). Nothing here hurries anyone: no timers, no
 * invented scarcity, and nothing that helps win.
 *
 * Before a product that cannot be used yet is bought, the disclosure is
 * shown and must be confirmed; such products are on sale only while the
 * owner's switch says so (`collectiblesOpen`).
 */

export type VaultProduct = {
  key: string;
  collection: string | null;
  category: string;
  name: string;
  line: string;
  image: string;
  price: number;
  status: 'available' | 'collectible' | 'future';
  mode: string | null;
  lookItem: string | null;
  editionSize: number | null;
  sold: number;
  onSale: boolean;
};
export type VaultData = {
  collections: Array<{ key: string; name: string; line: string; bundle: number | null; onSale: boolean }>;
  products: VaultProduct[];
  owned: Array<{ product: string; edition: number | null; price: number; via: string }>;
  collectiblesOpen: boolean;
};

const pad = (n: number) => String(n).padStart(3, '0');

export function createVault(play: PlayContext, data: VaultData): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  controls.show(false);
  const stage = menuStage(play.look());

  const sheet = el('yp-sheet yp-vault');
  const head = el('yp-vault-head');
  const brand = el('yp-vault-brand');
  brand.append(el('yp-vault-kicker', text('play.vault.kicker'), 'span'), el('yp-vault-title', text('play.vault.title'), 'h2'));
  const gems = el('yp-vault-gems', '', 'button');
  head.append(brand, gems);
  const headline = el('yp-vault-headline', text('play.vault.headline'), 'p');
  const soon = el('yp-vault-soon');
  soon.append(el('yp-vault-soon-title', text('play.vault.soon_title'), 'strong'), el('yp-vault-soon-line', text('play.vault.soon_line'), 'span'));
  const tabs = el('yp-tabs');
  const body = el('yp-vault-body');
  const note = el('yp-sheet-note', '', 'p');
  const foot = el('yp-sheet-foot');
  const back = el('yp-ghost', text('play.close'), 'button');
  foot.append(back);
  sheet.append(head, headline, soon, tabs, body, note, foot);
  host.append(sheet);
  back.addEventListener('click', () => play.go('plaza'));
  gems.addEventListener('click', () => play.go('shop', 'gems'));

  const owned = () => new Map(data.owned.map((o) => [o.product, o]));
  const showGems = () => {
    gems.textContent = play.account ? `◆ ${text('play.gems.balance', { gems: play.account.progress.gems })}` : text('play.plaza.signin');
  };

  const badge = (p: VaultProduct) => el(`yp-vault-badge is-${p.status}`, text(`play.vault.status.${p.status}`), 'span');
  const stock = (p: VaultProduct) => (p.editionSize ? text('play.vault.edition', { size: p.editionSize, left: Math.max(0, p.editionSize - p.sold) }) : '');

  // --- One product, close up -------------------------------------------------------------
  let overlay: HTMLElement | null = null;
  const closeDetail = () => {
    overlay?.remove();
    overlay = null;
  };
  const openDetail = (p: VaultProduct) => {
    closeDetail();
    const mine = owned().get(p.key);
    overlay = el('yp-vault-detail');
    const card = el('yp-vault-detail-card');
    const close = el('yp-icon', '✕', 'button');
    close.setAttribute('aria-label', text('play.close'));
    close.addEventListener('click', closeDetail);
    const img = document.createElement('img');
    img.className = 'yp-vault-detail-img';
    img.src = p.image;
    img.alt = '';
    const title = el('yp-vault-detail-title', p.name, 'h3');
    const meta = el('yp-vault-detail-meta');
    meta.append(badge(p));
    if (p.editionSize) meta.append(el('yp-vault-stock', stock(p), 'span'));
    const what = el(
      'yp-vault-detail-what',
      p.status === 'available' ? text('play.vault.what.available') : p.status === 'collectible' ? text('play.vault.what.collectible', { mode: text(`play.vault.mode.${p.mode ?? 'plaza'}`) }) : text('play.vault.what.future', { mode: text(`play.vault.mode.${p.mode ?? 'plaza'}`) }),
      'p',
    );
    card.append(close, img, title, meta);
    if (p.line) card.append(el('yp-vault-detail-line', p.line, 'p'));
    card.append(what);

    if (mine) {
      card.append(el('yp-vault-mine', mine.edition ? text('play.vault.yours_numbered', { n: pad(mine.edition), size: p.editionSize ?? mine.edition }) : text('play.vault.yours'), 'p'));
      if (p.status === 'available' && p.lookItem) {
        const wear = el('yp-primary', text('play.vault.wear'), 'button');
        wear.addEventListener('click', () => play.go('studio'));
        card.append(wear);
      }
    } else {
      const price = el('yp-vault-price', text('play.gems.buy', { price: p.price }), 'button');
      const usableNow = p.status === 'available';
      let agree: HTMLInputElement | null = null;
      if (!usableNow) {
        // The disclosure, before anything not usable yet can be bought (the owner's words).
        const disclosure = el('yp-vault-disclosure');
        disclosure.append(el('yp-vault-disclosure-title', text('play.vault.disclosure_title'), 'strong'), el('', text('play.vault.disclosure'), 'p'), el('yp-vault-terms', text('play.vault.terms'), 'p'));
        const label = el('yp-check', '', 'label');
        agree = document.createElement('input');
        agree.type = 'checkbox';
        label.append(agree, el('', text('play.vault.acknowledge'), 'span'));
        disclosure.append(label);
        card.append(disclosure);
      }
      const reason = !play.account
        ? text('play.gems.signin')
        : !p.onSale
          ? text('play.vault.not_on_sale')
          : !usableNow && !data.collectiblesOpen
            ? text('play.vault.collectibles_closed')
            : p.editionSize && p.sold >= p.editionSize
              ? text('play.vault.sold_out')
              : play.account.progress.gems < p.price
                ? text('play.gems.need', { gems: p.price - play.account.progress.gems })
                : '';
      price.disabled = Boolean(reason) || Boolean(agree);
      agree?.addEventListener('change', () => (price.disabled = Boolean(reason) || !agree!.checked));
      const why = el('yp-sheet-note', reason, 'p');
      price.addEventListener('click', async () => {
        price.disabled = true;
        why.textContent = '';
        try {
          const response = await fetch('/api/play/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: p.key, acknowledged: agree?.checked === true }) });
          const result = (await response.json()) as { ok?: boolean; edition?: number | null; gems?: number; error?: string };
          if (response.ok && result.ok && play.account) {
            play.account.progress.gems = result.gems ?? play.account.progress.gems - p.price;
            data.owned.push({ product: p.key, edition: result.edition ?? null, price: p.price, via: 'item' });
            p.sold += 1;
            if (p.lookItem && usableNow) play.account.owned = [...play.account.owned, p.lookItem];
            play.cue('success');
            showGems();
            render();
            openDetail(p);
            return;
          }
          why.textContent = text(`play.vault.error.${result.error ?? 'failed'}`);
        } catch {
          why.textContent = text('play.vault.error.failed');
        }
        price.disabled = false;
      });
      card.append(price, why);
    }
    overlay.append(card);
    overlay.addEventListener('click', (event) => event.target === overlay && closeDetail());
    host.append(overlay);
  };

  // --- The collections ---------------------------------------------------------------------
  const productCard = (p: VaultProduct) => {
    const mine = owned().get(p.key);
    const c = el(`yp-vault-card${mine ? ' is-owned' : ''}`, '', 'button');
    const img = document.createElement('img');
    img.src = p.image;
    img.alt = '';
    img.loading = 'lazy';
    c.append(img, badge(p), el('yp-vault-card-name', p.name, 'span'));
    c.append(el('yp-vault-card-price', mine ? (mine.edition ? `Nº ${pad(mine.edition)}` : text('play.shop.owned')) : `◆ ${p.price}`, 'span'));
    if (p.editionSize && !mine) c.append(el('yp-vault-card-stock', stock(p), 'span'));
    c.addEventListener('click', () => openDetail(p));
    return c;
  };

  const showCollections = () => {
    const mine = owned();
    const blocks: HTMLElement[] = [];
    for (const collection of data.collections) {
      const items = data.products.filter((p) => p.collection === collection.key);
      if (!items.length) continue;
      const have = items.filter((p) => mine.has(p.key)).length;
      const block = el('yp-vault-collection');
      block.dataset.collection = collection.key;
      const top = el('yp-vault-collection-head');
      const words = el('yp-card-words');
      words.append(el('yp-vault-collection-name', collection.name, 'strong'), el('yp-card-line', collection.line, 'span'));
      top.append(words, el('yp-vault-progress', text('play.vault.progress', { have, total: items.length }), 'span'));
      const bar = el('yp-xp');
      const fill = el('yp-xp-fill');
      fill.style.width = `${Math.round((100 * have) / items.length)}%`;
      bar.append(fill);
      const grid = el('yp-vault-grid');
      grid.append(...items.map(productCard));
      block.append(top, bar, grid);
      if (collection.bundle && collection.onSale && have === 0) {
        const bundle = el('yp-vault-bundle', text('play.vault.bundle', { price: collection.bundle, count: items.length }), 'button');
        bundle.addEventListener('click', () => openBundle(collection, items));
        block.append(bundle);
      }
      blocks.push(block);
    }
    const loose = data.products.filter((p) => !p.collection);
    if (loose.length) {
      const block = el('yp-vault-collection');
      const grid = el('yp-vault-grid');
      grid.append(...loose.map(productCard));
      block.append(el('yp-vault-collection-name', text('play.vault.season'), 'strong'), grid);
      blocks.push(block);
    }
    body.replaceChildren(...blocks);
  };

  const openBundle = (collection: VaultData['collections'][number], items: VaultProduct[]) => {
    closeDetail();
    overlay = el('yp-vault-detail');
    const card = el('yp-vault-detail-card');
    const close = el('yp-icon', '✕', 'button');
    close.addEventListener('click', closeDetail);
    const worth = items.reduce((sum, p) => sum + p.price, 0);
    card.append(close, el('yp-vault-detail-title', collection.name, 'h3'), el('yp-vault-detail-line', text('play.vault.bundle_line', { count: items.length, worth, price: collection.bundle! }), 'p'));
    const strip = el('yp-vault-strip');
    for (const p of items) {
      const img = document.createElement('img');
      img.src = p.image;
      img.alt = p.name;
      strip.append(img);
    }
    card.append(strip);
    const needsAck = items.some((p) => p.status !== 'available');
    let agree: HTMLInputElement | null = null;
    if (needsAck) {
      const disclosure = el('yp-vault-disclosure');
      disclosure.append(el('yp-vault-disclosure-title', text('play.vault.disclosure_title'), 'strong'), el('', text('play.vault.disclosure'), 'p'), el('yp-vault-terms', text('play.vault.terms'), 'p'));
      const label = el('yp-check', '', 'label');
      agree = document.createElement('input');
      agree.type = 'checkbox';
      label.append(agree, el('', text('play.vault.acknowledge'), 'span'));
      disclosure.append(label);
      card.append(disclosure);
    }
    const reason = !play.account
      ? text('play.gems.signin')
      : needsAck && !data.collectiblesOpen
        ? text('play.vault.collectibles_closed')
        : play.account.progress.gems < collection.bundle!
          ? text('play.gems.need', { gems: collection.bundle! - play.account.progress.gems })
          : '';
    const buy = el('yp-vault-price', text('play.gems.buy', { price: collection.bundle! }), 'button');
    buy.disabled = Boolean(reason) || Boolean(agree);
    agree?.addEventListener('change', () => (buy.disabled = Boolean(reason) || !agree!.checked));
    const why = el('yp-sheet-note', reason, 'p');
    buy.addEventListener('click', async () => {
      buy.disabled = true;
      try {
        const response = await fetch('/api/play/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collection: collection.key, acknowledged: agree?.checked === true }) });
        const result = (await response.json()) as { ok?: boolean; gems?: number; owned?: VaultData['owned']; error?: string };
        if (response.ok && result.ok && play.account) {
          play.account.progress.gems = result.gems ?? play.account.progress.gems;
          if (result.owned) data.owned = result.owned;
          for (const p of items) {
            p.sold += 1;
            if (p.lookItem && p.status === 'available') play.account.owned = [...play.account.owned, p.lookItem];
          }
          play.cue('success');
          showGems();
          closeDetail();
          render();
          return;
        }
        why.textContent = text(`play.vault.error.${result.error ?? 'failed'}`);
      } catch {
        why.textContent = text('play.vault.error.failed');
      }
      buy.disabled = false;
    });
    card.append(buy, why);
    overlay.append(card);
    overlay.addEventListener('click', (event) => event.target === overlay && closeDetail());
    host.append(overlay);
  };

  // --- The player's inventory ------------------------------------------------------------
  const showInventory = () => {
    if (!play.account) return body.replaceChildren(el('yp-sheet-note', text('play.plaza.guest'), 'p'));
    const rows: HTMLElement[] = [];
    for (const o of data.owned) {
      const p = data.products.find((x) => x.key === o.product);
      if (!p) continue;
      const row = el('yp-card');
      const img = document.createElement('img');
      img.className = 'yp-thumb';
      img.src = p.image;
      img.alt = '';
      const words = el('yp-card-words');
      words.append(el('yp-card-title', p.name, 'strong'), el('yp-card-line', [text(`play.vault.status.${p.status}`), o.edition ? `Nº ${pad(o.edition)}/${pad(p.editionSize ?? o.edition)}` : ''].filter(Boolean).join(' · '), 'span'));
      row.append(img, words);
      if (p.status === 'available' && p.lookItem) {
        const wear = el('yp-ghost yp-small', text('play.vault.wear'), 'button');
        wear.addEventListener('click', () => play.go('studio'));
        row.append(wear);
      } else {
        // Not usable yet: it can go back for its gems (the terms shown before buying).
        const give = el('yp-ghost yp-small', text('play.vault.return', { gems: o.price }), 'button');
        give.addEventListener('click', async () => {
          if (!window.confirm(text('play.vault.return_confirm', { name: p.name, gems: o.price }))) return;
          give.disabled = true;
          const response = await fetch('/api/play/vault/return', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: p.key }) }).catch(() => null);
          const result = response ? ((await response.json()) as { ok?: boolean; gems?: number }) : null;
          if (response?.ok && result?.ok && play.account) {
            play.account.progress.gems = result.gems ?? play.account.progress.gems + o.price;
            data.owned = data.owned.filter((x) => x.product !== p.key);
            p.sold = Math.max(0, p.sold - 1);
            showGems();
            showInventory();
            return;
          }
          give.disabled = false;
          note.textContent = text('play.vault.error.failed');
        });
        row.append(give);
      }
      rows.push(row);
    }
    if (!rows.length) rows.push(el('yp-sheet-note', text('play.vault.empty'), 'p'));
    body.replaceChildren(...rows);
  };

  let view: 'collections' | 'inventory' = 'collections';
  const render = () => (view === 'collections' ? showCollections() : showInventory());
  for (const [key, which] of [['play.vault.tab_collections', 'collections'], ['play.vault.tab_inventory', 'inventory']] as const) {
    const tab = el('yp-tab', text(key), 'button');
    tab.setAttribute('aria-pressed', String(which === view));
    tab.addEventListener('click', () => {
      view = which;
      for (const t of tabs.children) t.setAttribute('aria-pressed', String(t === tab));
      closeDetail();
      render();
    });
    tabs.append(tab);
  }
  showGems();
  render();

  return {
    scene: stage.scene,
    camera: stage.camera,
    fov: stage.fov,
    frame(dt) {
      stage.frame(dt, host, sheet);
    },
    state: () => ({ menu: 'vault' }),
    dispose() {
      closeDetail();
      sheet.remove();
      stage.dispose();
    },
  };
}
