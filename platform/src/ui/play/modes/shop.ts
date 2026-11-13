import * as THREE from 'three';
import { ACHIEVEMENTS, earnedItems, lookOption } from '@/config/play-looks';
import { PLAY_RULES } from '@/config/business-rules';
import type { Mode } from '../engine/runtime';
import { menuStage } from '../engine/stage';
import { el, type PlayContext } from '../context';

/**
 * The shop and the achievements (docs/PLAY.md, "Shop and rewards"). Looks
 * are bought with Play Coins earned by playing, never with money; some are
 * not sold at all but won (an achievement) or worn by the first members.
 * Trying one on is free, in the Character Studio.
 */
export function createShop(play: PlayContext): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  controls.show(false);
  const stage = menuStage(play.look());

  const sheet = el('yp-sheet yp-dark yp-shop');
  const head = el('yp-sheet-head');
  const coins = el('yp-coins', '', 'span');
  head.append(el('yp-sheet-title', text('play.plaza.shop'), 'h2'), coins);
  const tabs = el('yp-tabs');
  const body = el('yp-cards');
  const note = el('yp-sheet-note', '', 'p');
  const foot = el('yp-sheet-foot');
  const back = el('yp-ghost', text('play.close'), 'button');
  const studio = el('yp-ghost', text('play.studio.open'), 'button');
  foot.append(back, studio);
  sheet.append(head, tabs, body, note, foot);
  host.append(sheet);
  back.addEventListener('click', () => play.go('plaza'));
  studio.addEventListener('click', () => play.go('studio'));

  const owned = () => new Set(play.account?.owned ?? []);
  const showCoins = () => {
    coins.textContent = play.account ? text('play.plaza.coins', { coins: play.account.progress.coins }) : '';
  };
  const swatch = (part: string, id: string) => {
    const dot = el('yp-dot');
    const option = lookOption(part as never, id);
    dot.style.background = `#${new THREE.Color(option.color ?? 0x888888).getHexString()}`;
    return dot;
  };

  const showShop = () => {
    const have = owned();
    const rows: HTMLElement[] = [el('yp-sheet-note', text('play.shop.lead'), 'p')];
    for (const item of earnedItems().filter((e) => e.unlock === 'shop')) {
      const price = PLAY_RULES.shop[item.item] ?? 0;
      const c = el('yp-card');
      const words = el('yp-card-words');
      words.append(el('yp-card-title', text(`play.look.${item.part}.${item.id}`), 'strong'), el('yp-card-line', text(`play.look.part.${item.part}`), 'span'));
      c.append(swatch(item.part, item.id), words);
      const button = el('yp-primary yp-small', '', 'button');
      if (have.has(item.item)) {
        button.textContent = text('play.shop.owned');
        button.disabled = true;
      } else if (!play.account) {
        button.textContent = text('play.shop.buy', { price });
        button.disabled = true;
      } else if (play.account.progress.coins < price) {
        button.textContent = text('play.shop.need', { coins: price - play.account.progress.coins });
        button.disabled = true;
      } else {
        button.textContent = text('play.shop.buy', { price });
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const response = await fetch('/api/play/shop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: item.item }) });
            const result = (await response.json()) as { ok?: boolean; progress?: NonNullable<PlayContext['account']>['progress'] };
            if (response.ok && result.ok && result.progress && play.account) {
              play.account.progress = result.progress;
              play.account.owned = [...play.account.owned, item.item];
              play.cue('success');
              note.textContent = text('play.shop.bought');
              showCoins();
              showShop();
              return;
            }
          } catch {
            // Said below.
          }
          note.textContent = text('play.shop.failed');
          button.disabled = false;
        });
      }
      c.append(button);
      rows.push(c);
    }
    if (!play.account) rows.push(el('yp-sheet-note', text('play.shop.signin'), 'p'));
    rows.push(el('yp-card-title yp-section', text('play.shop.earned'), 'strong'));
    for (const item of earnedItems().filter((e) => e.unlock !== 'shop')) {
      const c = el('yp-card');
      const words = el('yp-card-words');
      const how = item.unlock === 'founder' ? text('play.unlock.founder') : text('play.unlock.achievement', { name: text(`play.achievement.${item.unlock}`) });
      words.append(el('yp-card-title', text(`play.look.${item.part}.${item.id}`), 'strong'), el('yp-card-line', how, 'span'));
      c.append(swatch(item.part, item.id), words);
      if (have.has(item.item)) c.append(el('yp-card-done', text('play.shop.owned'), 'span'));
      rows.push(c);
    }
    body.replaceChildren(...rows);
  };

  const showAchievements = () => {
    const done = new Set(play.account?.achievements ?? []);
    body.replaceChildren(
      ...ACHIEVEMENTS.map((id) => {
        const c = el(`yp-card${done.has(id) ? ' is-done' : ''}`);
        const words = el('yp-card-words');
        words.append(el('yp-card-title', text(`play.achievement.${id}`), 'strong'), el('yp-card-line', text(`play.achievement.${id}.line`), 'span'));
        c.append(words);
        if (done.has(id)) c.append(el('yp-card-done', `✓ ${text('play.achievements.done')}`, 'span'));
        return c;
      }),
    );
    if (!play.account) body.append(el('yp-sheet-note', text('play.plaza.guest'), 'p'));
  };

  for (const [key, show] of [['play.plaza.shop', showShop], ['play.plaza.achievements', showAchievements]] as const) {
    const tab = el('yp-tab', text(key), 'button');
    tab.addEventListener('click', () => {
      for (const t of tabs.children) t.setAttribute('aria-pressed', String(t === tab));
      note.textContent = '';
      show();
    });
    tabs.append(tab);
  }
  tabs.firstElementChild?.setAttribute('aria-pressed', 'true');
  showCoins();
  showShop();

  return {
    scene: stage.scene,
    camera: stage.camera,
    fov: stage.fov,
    frame(dt) {
      stage.frame(dt, host, sheet);
    },
    state: () => ({ menu: 'shop' }),
    dispose() {
      sheet.remove();
      stage.dispose();
    },
  };
}
