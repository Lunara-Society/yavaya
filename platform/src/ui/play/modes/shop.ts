import * as THREE from 'three';
import { ACHIEVEMENTS, earnedItems, lookImage, lookOption, withoutClash, type Look, type LookPart, type Unlock } from '@/config/play-looks';
import { PLAY_RULES } from '@/config/business-rules';
import { buildCharacter, type Emote } from '../character/build';
import { disposeScene, type Mode } from '../engine/runtime';
import { el, type PlayContext } from '../context';

/**
 * The shop as a boutique (docs/PLAY.md, "Shop and rewards"): the player's
 * character on a lit podium in the top of the screen, the looks below it.
 * Tapping a look puts it on the character at once, free, so it is seen on
 * the player before anything is bought; the one button says what can be
 * done with it (buy, wear, how many coins are missing, how it is won).
 *
 * Looks are bought with Play Coins earned by playing, or the exclusive ones
 * with gems; some are not sold at all but won. Nothing tried on is kept
 * until "Ponérmelo", and only what the player owns can be kept.
 */

type Category = 'all' | 'ropa' | 'cara' | 'pelo' | 'extras' | 'logros';
const CATEGORIES: Array<[Category, LookPart[] | null]> = [
  ['all', null],
  ['ropa', ['top', 'print', 'bottom', 'shoes']],
  ['cara', ['face', 'beard', 'paint']],
  ['pelo', ['hair', 'hairColor']],
  ['extras', ['glasses', 'accessory']],
  ['logros', []],
];
/** Looks worn on the head: the camera comes in close for them. */
const HEAD: LookPart[] = ['face', 'beard', 'paint', 'hair', 'hairColor', 'glasses'];

type Item = { item: string; part: LookPart; id: string; unlock: Unlock };

export function createShop(play: PlayContext, first: 'shop' | 'gems' = 'shop'): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  controls.show(false);

  // --- The boutique: a dark room, a podium under a warm light ---
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  scene.background = new THREE.Color(0x15111b);
  scene.fog = new THREE.Fog(0x15111b, 9, 22);
  scene.add(new THREE.HemisphereLight(0xffeedd, 0x2a2233, 1.1));
  const key = new THREE.SpotLight(0xffe2b0, 40, 14, 0.5, 0.6, 1.4);
  key.position.set(1.2, 6, 3.2);
  key.target.position.set(0, 0.8, 0);
  const rim = new THREE.DirectionalLight(0xb08cff, 1.4);
  rim.position.set(-3, 3, -4);
  const fill = new THREE.DirectionalLight(0xffd9a0, 0.6);
  fill.position.set(3, 2, 2);
  scene.add(key, key.target, rim, fill);
  const obsidian = new THREE.MeshStandardMaterial({ color: 0x1b1720, roughness: 0.35, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.3, metalness: 0.85 });
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.22, 56), obsidian);
  podium.position.y = -0.11;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.022, 8, 72), gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.0;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshStandardMaterial({ color: 0x1d1824, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.22;
  // A pool of light on the floor and a soft glow behind the character.
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.1, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -0.21;
  const halo = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshBasicMaterial({ color: 0x7a4fd0, transparent: true, opacity: 0.16, depthWrite: false }));
  halo.position.set(0, 1.3, -1.6);
  scene.add(podium, ring, floor, pool, halo);

  let wearing: Look = { ...play.look() };
  let preview: Look = { ...wearing };
  const turntable = new THREE.Group();
  turntable.rotation.y = -0.3;
  scene.add(turntable);
  const hero = buildCharacter(wearing);
  turntable.add(hero.group);

  // --- The page over it ---
  const root = el('yp-bq');
  const top = el('yp-bq-top');
  const title = el('yp-bq-title', text('play.plaza.shop'), 'h2');
  const wallet = el('yp-bq-wallet');
  const coins = el('yp-bq-coins', '', 'span');
  const gems = el('yp-bq-gems', '', 'button');
  gems.setAttribute('aria-label', text('play.shop.get_gems'));
  wallet.append(coins, gems);
  const close = el('yp-bq-close', '✕', 'button');
  close.setAttribute('aria-label', text('play.close'));
  top.append(title, wallet, close);
  const hint = el('yp-bq-hint', text('play.shop.try_hint'), 'p');

  const panel = el('yp-bq-panel');
  const tabs = el('yp-tabs yp-bq-tabs');
  const grid = el('yp-bq-grid');
  const bar = el('yp-bq-bar');
  const note = el('yp-bq-note', '', 'p');
  note.setAttribute('role', 'status');
  panel.append(tabs, grid, note, bar);
  root.append(top, hint, panel);
  host.append(root);
  close.addEventListener('click', () => play.go('plaza'));

  const owned = () => new Set(play.account?.owned ?? []);
  const items: Item[] = earnedItems().filter((e) => e.unlock !== 'vault');
  const priceOf = (item: Item): { coins: number } | { gems: number } | null => (item.unlock === 'shop' ? { coins: PLAY_RULES.shop[item.item] ?? 0 } : item.unlock === 'gems' ? { gems: PLAY_RULES.gems[item.item] ?? 0 } : null);
  const nameOf = (item: Item) => text(`play.look.${item.part}.${item.id}`);
  const howOf = (item: Item) => (item.unlock === 'founder' ? text('play.unlock.founder') : text('play.unlock.achievement', { name: text(`play.achievement.${item.unlock}`) }));

  const showWallet = () => {
    coins.textContent = play.account ? `◎ ${play.account.progress.coins}` : '';
    gems.textContent = play.account ? `◆ ${play.account.progress.gems ?? 0} ＋` : '';
    gems.hidden = !play.account;
  };

  // --- Picture of a look: its artwork, or its colours ---
  const picture = (item: Item) => {
    const url = lookImage(item.part, item.id);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      return img;
    }
    const option = lookOption(item.part, item.id);
    const swatch = el('yp-bq-swatch');
    const c = `#${new THREE.Color(option.color ?? 0x888888).getHexString()}`;
    const a = `#${new THREE.Color(option.accent ?? option.color ?? 0x888888).getHexString()}`;
    swatch.style.background = `radial-gradient(circle at 50% 44%, ${c} 0 30%, ${a} 31% 37%, transparent 38%)`;
    swatch.append(el('yp-bq-swatch-part', text(`play.look.part.${item.part}`), 'span'));
    return swatch;
  };

  // --- The grid ---
  let category: Category = 'all';
  let selected: Item | null = null;
  const renderTabs = () => {
    tabs.replaceChildren(
      ...CATEGORIES.map(([id]) => {
        const tab = el('yp-tab', text(`play.shop.cat.${id}`), 'button');
        tab.setAttribute('aria-pressed', String(id === category));
        tab.addEventListener('click', () => {
          category = id;
          renderTabs();
          renderGrid();
        });
        return tab;
      }),
    );
  };
  const renderGrid = () => {
    if (category === 'logros') return renderAchievements();
    grid.classList.remove('is-list');
    const have = owned();
    const parts = CATEGORIES.find(([id]) => id === category)![1];
    // What can be had first (coins, then gems), then what is won; what is owned at the end.
    const rank = (i: Item) => (have.has(i.item) ? 3 : i.unlock === 'shop' ? 0 : i.unlock === 'gems' ? 1 : 2);
    const shown = items.filter((i) => !parts || parts.includes(i.part)).sort((a, b) => rank(a) - rank(b));
    const tiles: HTMLElement[] = [];
    if (category === 'all') {
      // The Vault is next door: its collections are sold there, not here.
      const vault = el('yp-bq-tile yp-bq-vault', '', 'button');
      vault.append(el('yp-bq-vault-mark', '◆', 'span'), el('yp-bq-name', text('play.vault.title'), 'span'), el('yp-bq-badge', '→', 'span'));
      vault.addEventListener('click', () => play.go('vault'));
      tiles.push(vault);
    }
    for (const item of shown) {
      const tile = el('yp-bq-tile', '', 'button');
      tile.dataset.item = item.item;
      tile.setAttribute('aria-pressed', String(selected?.item === item.item));
      const price = priceOf(item);
      const badge = have.has(item.item) ? '✓' : price && 'coins' in price ? `◎ ${price.coins}` : price && 'gems' in price ? `◆ ${price.gems}` : '🏆';
      const kind = have.has(item.item) ? 'is-owned' : price && 'gems' in price ? 'is-gems' : price ? 'is-coins' : 'is-won';
      tile.append(picture(item), el(`yp-bq-badge ${kind}`, badge, 'span'), el('yp-bq-name', nameOf(item), 'span'));
      tile.addEventListener('click', () => select(item));
      tiles.push(tile);
    }
    grid.replaceChildren(...tiles);
  };
  const renderAchievements = () => {
    grid.classList.add('is-list');
    const done = new Set(play.account?.achievements ?? []);
    grid.replaceChildren(
      ...ACHIEVEMENTS.map((id) => {
        const c = el(`yp-card${done.has(id) ? ' is-done' : ''}`);
        const words = el('yp-card-words');
        words.append(el('yp-card-title', text(`play.achievement.${id}`), 'strong'), el('yp-card-line', text(`play.achievement.${id}.line`), 'span'));
        c.append(words);
        if (done.has(id)) c.append(el('yp-card-done', `✓ ${text('play.achievements.done')}`, 'span'));
        return c;
      }),
    );
    if (!play.account) grid.append(el('yp-bq-note', text('play.plaza.guest'), 'p'));
  };

  // --- Trying on, and the one button ---
  const select = (item: Item) => {
    if (selected?.item === item.item) return reset();
    selected = item;
    preview = withoutClash({ ...wearing, [item.part]: item.id }, item.part);
    hero.dress(preview);
    facing = 2.5;
    hint.classList.add('is-gone');
    note.textContent = '';
    for (const tile of grid.querySelectorAll<HTMLElement>('.yp-bq-tile')) tile.setAttribute('aria-pressed', String(tile.dataset.item === item.item));
    renderBar();
  };
  const reset = () => {
    selected = null;
    preview = { ...wearing };
    hero.dress(preview);
    for (const tile of grid.querySelectorAll<HTMLElement>('.yp-bq-tile')) tile.setAttribute('aria-pressed', 'false');
    renderBar();
  };
  const button = (label: string, kind = 'yp-primary', disabled = false) => {
    const b = el(`${kind} yp-bq-act`, label, 'button');
    b.disabled = disabled;
    return b;
  };
  const renderBar = () => {
    if (!selected) {
      bar.replaceChildren(el('yp-bq-bar-empty', text('play.shop.pick'), 'p'));
      return;
    }
    const item = selected;
    const words = el('yp-bq-bar-words');
    const price = priceOf(item);
    const have = owned().has(item.item);
    const line = have ? text('play.shop.owned') : price && 'coins' in price ? text('play.unlock.shop', { price: price.coins }) : price && 'gems' in price ? text('play.unlock.gems', { price: price.gems }) : howOf(item);
    words.append(el('yp-bq-bar-name', nameOf(item), 'strong'), el('yp-bq-bar-line', `${text(`play.look.part.${item.part}`)} · ${line}`, 'span'));
    const undo = el('yp-bq-undo', '↺', 'button');
    undo.setAttribute('aria-label', text('play.shop.mine'));
    undo.title = text('play.shop.mine');
    undo.addEventListener('click', reset);
    let act: HTMLButtonElement;
    if (have) {
      const on = JSON.stringify(preview) === JSON.stringify(wearing);
      act = button(on ? text('play.shop.worn') : text('play.shop.wear'), 'yp-primary', on);
      act.addEventListener('click', () => void wear(act));
    } else if (!play.account) {
      act = button(price ? text('play.shop.signin_short') : text('play.unlock.signin'));
      act.addEventListener('click', () => (window.location.href = play.signInHref));
    } else if (price && 'coins' in price) {
      const short = price.coins - play.account.progress.coins;
      act = short > 0 ? button(text('play.shop.short', { price: `◎ ${short}` }), 'yp-primary', true) : button(text('play.shop.buy', { price: `◎ ${price.coins}` }));
      if (short <= 0) act.addEventListener('click', () => void buy(item, act));
    } else if (price && 'gems' in price) {
      const short = price.gems - (play.account.progress.gems ?? 0);
      if (short <= 0) {
        act = button(text('play.shop.buy', { price: `◆ ${price.gems}` }));
        act.addEventListener('click', () => void buy(item, act));
      } else if (play.gemsOnSale) {
        act = button(text('play.shop.get_gems'));
        act.addEventListener('click', openPacks);
      } else act = button(text('play.shop.short', { price: `◆ ${short}` }), 'yp-primary', true);
    } else act = button(text('play.shop.won'), 'yp-primary', true);
    bar.replaceChildren(words, undo, act);
  };

  // A look bought (with coins or gems): the server's answer is the new balance.
  const buy = async (item: Item, act: HTMLButtonElement) => {
    act.disabled = true;
    try {
      const response = await fetch('/api/play/shop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: item.item }) });
      const result = (await response.json()) as { ok?: boolean; progress?: NonNullable<PlayContext['account']>['progress'] };
      if (response.ok && result.ok && result.progress && play.account) {
        play.account.progress = result.progress;
        play.account.owned = [...play.account.owned, item.item];
        play.cue('success');
        celebrate();
        note.textContent = text('play.shop.bought_try');
        showWallet();
        renderGrid();
        renderBar();
        return;
      }
    } catch {
      // Said below.
    }
    note.textContent = text('play.shop.failed');
    act.disabled = false;
  };
  const wear = async (act: HTMLButtonElement) => {
    act.disabled = true;
    if (await play.saveLook(preview)) {
      wearing = { ...preview };
      note.textContent = text('play.shop.worn_note');
      celebrate();
    } else note.textContent = text('play.shop.failed');
    renderBar();
  };

  // --- Gem packs, over the boutique ---
  let packs: HTMLElement | null = null;
  const closePacks = () => {
    packs?.remove();
    packs = null;
  };
  function openPacks() {
    closePacks();
    packs = el('yp-bq-packs');
    const card = el('yp-bq-packs-card');
    const x = el('yp-bq-close', '✕', 'button');
    x.setAttribute('aria-label', text('play.close'));
    x.addEventListener('click', closePacks);
    card.append(x, el('yp-bq-packs-title', text('play.gems.title'), 'h3'), el('yp-bq-packs-lead', text('play.gems.lead'), 'p'));
    const say = el('yp-bq-note', '', 'p');
    if (!play.account) say.textContent = text('play.gems.signin');
    else if (!play.gemsOnSale) say.textContent = text('play.gems.unavailable');
    else
      for (const pack of PLAY_RULES.gemPacks) {
        const b = el('yp-bq-pack', '', 'button');
        b.append(el('yp-bq-pack-gems', `◆ ${pack.gems}`, 'strong'), el('yp-bq-pack-price', `$${(pack.priceMinor / 100).toFixed(2)}`, 'span'));
        b.addEventListener('click', async () => {
          b.disabled = true;
          say.textContent = text('play.gems.going');
          try {
            const response = await fetch('/api/play/gems', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pack: pack.key }) });
            const result = (await response.json()) as { redirectUrl?: string };
            // Stripe's own page takes the card; the gems come when Stripe confirms, server to server.
            if (response.ok && result.redirectUrl) {
              window.location.href = result.redirectUrl;
              return;
            }
          } catch {
            // Said below.
          }
          say.textContent = text('play.gems.unavailable');
          b.disabled = false;
        });
        card.append(b);
      }
    card.append(say);
    packs.append(card);
    packs.addEventListener('click', (event) => event.target === packs && closePacks());
    root.append(packs);
    return say;
  }
  gems.addEventListener('click', () => void openPacks());

  renderTabs();
  renderGrid();
  renderBar();
  showWallet();
  // Back from Stripe: say what happened, once, where the packs are.
  if (first === 'gems') {
    const say = openPacks();
    if (play.gemsReturn) {
      say.textContent = text(play.gemsReturn === 'paid' ? 'play.gems.paid' : play.gemsReturn === 'cancelled' || play.gemsReturn === 'failed' ? 'play.gems.cancelled' : 'play.gems.pending');
      play.gemsReturn = null;
    }
  }

  // --- Turning it with a finger; a little joy when something is bought or worn ---
  let dragging = -1;
  let lastX = 0;
  let spin = 0.35;
  /** Seconds left of turning to face the player (a look just tried on), before the slow turn resumes. */
  let facing = 0;
  let emote: Emote | null = null;
  let emoteLeft = 0;
  let clock = 0;
  function celebrate() {
    emote = 'saludo';
    emoteLeft = 2.2;
  }
  const off: Array<() => void> = [];
  const listen = (type: string, handler: (event: Event) => void) => {
    host.addEventListener(type, handler);
    off.push(() => host.removeEventListener(type, handler));
  };
  listen('pointerdown', (event) => {
    const e = event as PointerEvent;
    if ((e.target as Element).closest('.yp-bq-panel, .yp-bq-top, .yp-bq-packs, button, a')) return;
    dragging = e.pointerId;
    lastX = e.clientX;
    hint.classList.add('is-gone');
  });
  listen('pointermove', (event) => {
    const e = event as PointerEvent;
    if (e.pointerId !== dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    turntable.rotation.y += dx * 0.012;
    spin = dx * 0.012 * 60;
  });
  const drop = (event: Event) => {
    if ((event as PointerEvent).pointerId === dragging) dragging = -1;
  };
  listen('pointerup', drop);
  listen('pointercancel', drop);

  // The camera frames the character in the part of the screen the panel leaves:
  // above it on a phone, to its left where the panel stands at the side.
  const target = new THREE.Vector3();
  let near = 0;

  return {
    scene,
    camera,
    fov: (aspect) => (aspect < 0.8 ? 34 : 28),
    frame(dt) {
      clock += dt;
      if (dragging !== -1) facing = 0;
      else if (facing > 0) {
        // A look just tried on: turn to show it, front on, then go on turning.
        facing -= dt;
        const front = Math.round((turntable.rotation.y + 0.25) / (Math.PI * 2)) * Math.PI * 2 - 0.25;
        turntable.rotation.y += (front - turntable.rotation.y) * (1 - Math.exp(-6 * dt));
        spin = 0;
      } else {
        // Back to a slow turn after a flick.
        spin += (0.35 - spin) * (1 - Math.exp(-1.5 * dt));
        turntable.rotation.y += spin * dt;
      }
      if (emote && (emoteLeft -= dt) <= 0) emote = null;
      hero.update(dt, { speed: 0, air: false, vy: 0, cheer: 0, emote });
      near += ((selected && HEAD.includes(selected.part) ? 1 : 0) - near) * (1 - Math.exp(-5 * dt));
      halo.material.opacity = 0.14 + Math.sin(clock * 1.3) * 0.03;
      // The free part of the screen: under the top bar, above the panel (or left of it).
      const W = Math.max(1, host.clientWidth);
      const H = Math.max(1, host.clientHeight);
      const side = W >= 760;
      const top0 = top.offsetTop + top.offsetHeight + 8;
      const bottom0 = side ? H - 16 : H - panel.offsetHeight;
      const right0 = side ? W - panel.offsetWidth - 32 : W;
      const cy = (top0 + bottom0) / 2 / H;
      const cx = right0 / 2 / W;
      const share = Math.max(0.2, (bottom0 - top0) / H);
      // What has to fit in it: the whole character, or the head for a look worn on the head.
      const subjectY = THREE.MathUtils.lerp(0.86, 1.36, near);
      const subjectHalf = THREE.MathUtils.lerp(1.02, 0.36, near);
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      let viewHalf = subjectHalf / share;
      if (side) viewHalf = Math.max(viewHalf, (subjectHalf * 1.1) / (camera.aspect * (right0 / W)));
      const distance = viewHalf / tan;
      target.set((0.5 - cx) * 2 * viewHalf * camera.aspect, subjectY + (cy - 0.5) * 2 * viewHalf, 0);
      camera.position.set(target.x, target.y + 0.12, distance);
      camera.lookAt(target);
    },
    state: () => ({ menu: 'shop', trying: selected?.item ?? null }),
    dispose() {
      off.forEach((undo) => undo());
      root.remove();
      hero.dispose();
      disposeScene(scene);
    },
  };
}
