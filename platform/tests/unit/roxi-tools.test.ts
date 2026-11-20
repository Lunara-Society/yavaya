import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LISTING_CATEGORIES as SERVER_LISTING_CATEGORIES } from '@/server/domains/mercadito/rules';
import { NEIGHBOUR_KINDS as SERVER_NEIGHBOUR_KINDS } from '@/server/domains/community/service';
import { SERVICE_CATEGORY_KEYS } from '@/config/services';
import { SPECIES as SERVER_SPECIES } from '@/config/animals';
import { ROXI_SCOPES } from '@/server/domains/roxi/service';
import { EMPLOYMENT_TYPES as SERVER_EMPLOYMENT_TYPES, WORK_FIELDS as SERVER_WORK_FIELDS } from '@/config/work';
import { BOARD_RULES, WORK_RULES } from '@/config/business-rules';
import { BOARD_DISTRICTS, BOARD_KINDS as SERVER_BOARD_KINDS } from '@/config/boards';
import { takeDraft } from '@/ui/roxi/drafts';
import { BOARD_KINDS, BOARD_LIMITS, BOARD_SUBDISTRICTS, EMPLOYMENT_TYPES, LISTING_CATEGORIES, MAX_PROFILE_FIELDS, NEIGHBOUR_KINDS, ROXI_PAGES, SERVICE_CATEGORIES, SPECIES, WORK_FIELDS, roxiTools } from '@/ui/roxi/tools';

/**
 * Roxi's tools exist three times: in the browser (src/ui/roxi/tools.ts), at
 * ElevenLabs (what the model is told, kept in docs/roxi/tools.json), and in
 * the server's own value lists. These hold the three together, so a new
 * category or page cannot reach one and not the others.
 */

type ToolDefinition = {
  name: string;
  parameters: { properties: Record<string, { enum?: string[] }> };
};

const root = join(__dirname, '..', '..');
const definitions = JSON.parse(readFileSync(join(root, 'docs', 'roxi', 'tools.json'), 'utf8')) as ToolDefinition[];
const definition = (name: string) => {
  const found = definitions.find((tool) => tool.name === name);
  if (!found) throw new Error(`docs/roxi/tools.json has no ${name}`);
  return found.parameters.properties;
};

describe('Roxi tools', () => {
  it('has a browser function for every tool the agent is told about, and no other', () => {
    const browser = Object.keys(
      roxiTools({
        navigate: () => undefined,
        pathname: () => '/',
        takePhotos: () => [],
        showResults: () => undefined,
        stepAside: () => undefined,
      }),
    ).sort();
    expect(browser).toEqual(definitions.map((tool) => tool.name).sort());
  });

  it('uses the server value lists', () => {
    expect(LISTING_CATEGORIES).toEqual([...SERVER_LISTING_CATEGORIES]);
    expect(NEIGHBOUR_KINDS).toEqual([...SERVER_NEIGHBOUR_KINDS]);
    expect(SERVICE_CATEGORIES).toEqual([...SERVICE_CATEGORY_KEYS]);
    expect(SPECIES).toEqual([...SERVER_SPECIES]);
    expect(WORK_FIELDS).toEqual([...SERVER_WORK_FIELDS]);
    expect(EMPLOYMENT_TYPES).toEqual([...SERVER_EMPLOYMENT_TYPES]);
    expect(MAX_PROFILE_FIELDS).toBe(WORK_RULES.maxFieldsPerProfile);
    expect(BOARD_SUBDISTRICTS).toEqual(Object.fromEntries(Object.entries(BOARD_DISTRICTS).map(([key, def]) => [key, [...def.subdistricts]])));
    expect(BOARD_KINDS).toEqual([...SERVER_BOARD_KINDS]);
    expect(BOARD_LIMITS).toEqual({ title: BOARD_RULES.titleMaxLength, body: BOARD_RULES.bodyMaxLength, price: BOARD_RULES.priceMaxLength });
  });

  it('tells the agent the same values the browser accepts', () => {
    expect(definition('prepare_listing').category?.enum).toEqual(LISTING_CATEGORIES);
    expect(definition('prepare_post').kind?.enum).toEqual(NEIGHBOUR_KINDS);
    expect(definition('prepare_post').category?.enum).toEqual(SERVICE_CATEGORIES);
    expect(definition('prepare_post').species?.enum).toEqual(SPECIES);
    expect(definition('prepare_work').field?.enum).toEqual(WORK_FIELDS);
    expect(definition('prepare_work').employment?.enum).toEqual(EMPLOYMENT_TYPES);
    expect(definition('search_yavaya').scope?.enum).toEqual([...ROXI_SCOPES]);
    expect(definition('prepare_board_post').district?.enum).toEqual(Object.keys(BOARD_SUBDISTRICTS));
    expect(definition('prepare_board_post').subdistrict?.enum).toEqual([...new Set(Object.values(BOARD_SUBDISTRICTS).flat())]);
    expect(definition('prepare_board_post').kind?.enum).toEqual(BOARD_KINDS);
    expect(definition('open_page').page?.enum).toEqual(Object.keys(ROXI_PAGES));
  });

  it('opens only pages that exist', () => {
    for (const [name, path] of Object.entries(ROXI_PAGES)) {
      const route = path.split(/[?#]/)[0]!;
      const page = route === '/' ? join(root, 'src', 'app', 'page.tsx') : join(root, 'src', 'app', ...route.slice(1).split('/'), 'page.tsx');
      expect(existsSync(page), `${name} → ${path}`).toBe(true);
    }
  });

  it('prepares a board post with the photos the member sent, on that board\'s own form', async () => {
    const opened: string[] = [];
    const photo = new File(['x'], 'corte.jpg', { type: 'image/jpeg' });
    const tools = roxiTools({ navigate: (path) => opened.push(path), pathname: () => '/barrio', takePhotos: () => [photo], showResults: () => undefined, stepAside: () => undefined });

    const refused = JSON.parse(await tools.prepare_board_post!({ district: 'mercadito', title: 'Algo', body: 'Algo más largo que veinte letras.' }));
    expect(refused).toMatchObject({ ok: false, error: 'unknown_district' });

    const answer = JSON.parse(
      await tools.prepare_board_post!({ district: 'barrio', subdistrict: 'utilities', kind: 'offer', title: 'Corte de agua mañana', body: 'Cortan el agua de ocho a doce en toda la colonia.', price: '' }),
    );
    expect(answer).toMatchObject({ ok: true, opened: '/barrio/new', photos_attached: 1 });
    expect(opened).toEqual(['/barrio/new?sub=utilities']);
    const draft = takeDraft('board_post');
    expect(draft?.fields).toEqual({ kind: 'offer', subdistrict: 'utilities', title: 'Corte de agua mañana', body: 'Cortan el agua de ocho a doce en toda la colonia.' });
    expect(draft?.files).toEqual([photo]);
  });

  it('leaves a section from another board for the member to choose', async () => {
    const tools = roxiTools({ navigate: () => undefined, pathname: () => '/', takePhotos: () => [], showResults: () => undefined, stepAside: () => undefined });
    const answer = JSON.parse(await tools.prepare_board_post!({ district: 'barrio', subdistrict: 'harvest', title: 'Cosecha de maíz', body: 'Tenemos maíz de la cosecha para quien lo necesite.' }));
    expect(answer).toMatchObject({ ok: true, member_must_choose: 'the section of the board' });
    expect(takeDraft('board_post')?.fields.subdistrict).toBeUndefined();
  });
});
