import { putDraft, type RoxiForm } from './drafts';

/**
 * Roxi's hands on the site: the client tools the agent calls, run here in the
 * member's browser with the member's own session.
 *
 * Every tool either reads (through /api/roxi, which applies the member's
 * visibility) or prepares (a draft in a form, or a page opened). None of them
 * publishes, pays or sends anything to another person: the member does that
 * with their own tap, on the same form everyone uses.
 *
 * The names and parameters here must match the tools defined on the agent at
 * ElevenLabs (see docs/roxi/agent.md). Answers go back to the model as short
 * JSON text.
 */

export type RoxiResultCard = { title: string; detail: string; url: string };

export type ToolContext = {
  navigate: (path: string) => void;
  pathname: () => string;
  /** Photos the member sent in this conversation and no form has taken yet. */
  takePhotos: () => File[];
  showResults: (cards: RoxiResultCard[], more: boolean) => void;
  note: (text: string) => void;
  /** On a phone, gets the panel out of the way of the page it just opened. */
  stepAside: () => void;
  labels: { draft_opened: string; opened: string; no_results: string };
};

/*
 * The value lists below repeat the server's, because this file runs in the
 * browser and the server modules do not. tests/unit/roxi-tools.test.ts holds
 * them (and docs/roxi/tools.json, what the agent is told) to the server's.
 */
export const LISTING_CATEGORIES = ['vehicles', 'real_estate', 'electronics', 'services', 'fashion', 'home', 'sports', 'classifieds'];
export const LISTING_CONDITIONS = ['new', 'like_new', 'used', 'for_parts', 'not_applicable'];
export const NEIGHBOUR_KINDS = ['help_request', 'help_offer', 'family_support'];
export const SERVICE_CATEGORIES = [
  'home_repairs',
  'cleaning_garden',
  'vehicles',
  'technology',
  'mental_health',
  'health_care',
  'children_lessons',
  'legal_paperwork',
  'beauty',
  'events',
];
export const SPECIES = ['dog', 'cat', 'other'];

/** Places Roxi may open by name. A name, not a path, so the model cannot invent an address. */
export const ROXI_PAGES: Record<string, string> = {
  home: '/',
  districts: '/districts',
  mercadito: '/mercadito',
  mercadito_publish: '/mercadito/publish',
  my_listings: '/mercadito/mine',
  yavayago: '/yavayago',
  yavayago_trips: '/yavayago/viajes',
  services: '/services',
  services_new: '/services/new',
  work: '/work',
  community: '/community',
  community_new: '/community/new',
  sanctuary: '/sanctuary',
  prayer_wall: '/sanctuary/prayer',
  animals: '/animals',
  animals_learn: '/animals/learn',
  lost_and_found: '/animals/lost',
  services_mine: '/services/mine',
  services_provider: '/services/provider',
  work_new: '/work/posts/new',
  work_mine: '/work/mine',
  work_profile: '/work/profile',
  work_employer: '/work/employer',
  yavayago_orders: '/yavayago/orders',
  yavayago_store: '/yavayago/store',
  yavayago_driver: '/yavayago/driver',
  animals_mine: '/animals/mine',
  animals_rescuer: '/animals/rescuer',
  sanctuary_register: '/sanctuary/register',
  sanctuary_manage: '/sanctuary/manage',
  violeta: '/violeta',
  account: '/account',
  tokens: '/account/tokens',
  tokens_info: '/tokens',
  invite: '/account/invite',
  phone: '/account/phone',
  notifications: '/notifications',
  settings: '/settings',
  notification_settings: '/settings#notifications',
  security: '/settings#security',
  two_step: '/settings/dos-pasos',
  help: '/help',
  guide: '/guia',
  trust: '/trust',
  reputation: '/reputation',
  pricing: '/pricing',
  status: '/status',
  roadmap: '/roadmap',
  transparency: '/transparency',
  about: '/about',
  privacy: '/privacy',
  terms: '/terms',
};

/** Item pages Roxi may open from a search result: the ones /api/roxi/search returns. */
const RESULT_PATH = /^\/(mercadito|yavayago\/stores|work\/posts|animals|sanctuary\/churches|services\/requests)\/[0-9a-f-]{36}$/;

const reply = (value: unknown) => JSON.stringify(value);
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const oneOf = (allowed: string[], value: unknown) => (typeof value === 'string' && allowed.includes(value) ? value : '');

async function getJson(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

function prepare(ctx: ToolContext, form: RoxiForm, path: string, fields: Record<string, string | boolean>, withPhotos: boolean) {
  const files = withPhotos ? ctx.takePhotos() : [];
  putDraft({ form, fields, files });
  const [target] = path.split('?');
  if (ctx.pathname() !== target || path.includes('?')) ctx.navigate(path);
  ctx.note(ctx.labels.draft_opened);
  ctx.stepAside();
  return reply({ ok: true, opened: target, photos_attached: files.length, member_must: 'review the form, add what is missing, and tap the publish button themselves' });
}

export function roxiTools(ctx: ToolContext): Record<string, (parameters: Record<string, unknown>) => Promise<string>> {
  return {
    async search_yavaya(parameters) {
      const query = new URLSearchParams();
      query.set('scope', text(parameters.scope, 20));
      for (const name of ['query', 'category', 'place'] as const) {
        const value = text(parameters[name], 80);
        if (value) query.set(name === 'query' ? 'q' : name, value);
      }
      const { ok, status, body } = await getJson(`/api/roxi/search?${query}`);
      if (!ok) return reply({ ok: false, error: status === 429 ? 'too_many_lookups' : status === 401 ? 'signed_out' : 'failed' });
      const result = body as { items: RoxiResultCard[]; more: boolean; place: string | null };
      ctx.showResults(result.items, result.more);
      if (result.items.length === 0) ctx.note(ctx.labels.no_results);
      return reply({ ok: true, place: result.place, results: result.items, more: result.more });
    },

    async my_account() {
      const { ok, status, body } = await getJson('/api/roxi/me');
      if (!ok) return reply({ ok: false, error: status === 429 ? 'too_many_lookups' : status === 401 ? 'signed_out' : 'failed' });
      return reply({ ok: true, account: body });
    },

    async prepare_listing(parameters) {
      const fields: Record<string, string> = {
        title: text(parameters.title, 90),
        description: text(parameters.description, 4000),
        category: oneOf(LISTING_CATEGORIES, parameters.category),
        condition: oneOf(LISTING_CONDITIONS, parameters.condition),
      };
      const price = text(parameters.price, 20).replace(/[^\d.,]/g, '');
      if (price) fields.price = price;
      return prepare(ctx, 'mercadito_listing', '/mercadito/publish', fields, true);
    },

    async prepare_post(parameters) {
      const form = text(parameters.form, 30);
      const title = text(parameters.title, 120);
      const body = text(parameters.body, 4000);
      const anonymous = parameters.anonymous === true;
      switch (form) {
        case 'community_post': {
          const kind = oneOf(NEIGHBOUR_KINDS, parameters.kind) || 'help_request';
          return prepare(ctx, 'community_post', `/community/new?kind=${kind}`, { kind, title, body, anonymous }, false);
        }
        case 'prayer_request':
          return prepare(ctx, 'prayer_request', '/community/new?kind=prayer', { title, body, anonymous }, false);
        case 'service_request': {
          const category = oneOf(SERVICE_CATEGORIES, parameters.category);
          return prepare(ctx, 'service_request', `/services/new${category ? `?cat=${category}` : ''}`, { category, title, body, urgent: parameters.urgent === true, anonymous }, false);
        }
        case 'lost_pet':
        case 'found_pet': {
          const fields = { species: oneOf(SPECIES, parameters.species), name: text(parameters.name, 60), description: body };
          return prepare(ctx, form, `/animals/lost/new?kind=${form === 'lost_pet' ? 'lost' : 'found'}`, fields, true);
        }
        default:
          return reply({ ok: false, error: 'unknown_form' });
      }
    },

    async open_page(parameters) {
      const path = ROXI_PAGES[text(parameters.page, 40)];
      if (!path) return reply({ ok: false, error: 'unknown_page', pages: Object.keys(ROXI_PAGES) });
      ctx.navigate(path);
      ctx.note(ctx.labels.opened);
      return reply({ ok: true, opened: path });
    },

    async open_result(parameters) {
      const url = text(parameters.url, 120);
      if (!RESULT_PATH.test(url)) return reply({ ok: false, error: 'not_a_result_link' });
      ctx.navigate(url);
      ctx.stepAside();
      return reply({ ok: true, opened: url });
    },
  };
}
