/**
 * Writes Roxi's knowledge base from the site's own sources, so what Roxi
 * knows is what the site says — nothing typed twice, nothing invented.
 *
 *   npx tsx scripts/roxi-knowledge.ts
 *
 * Output goes to docs/roxi/knowledge/; how Roxi behaves is in
 * docs/roxi/prompt.md. Run it after changing site texts, the dictionaries
 * or the business rules, then replace the documents on the agent
 * (docs/roxi/README.md says how).
 *
 * Spanish only, on purpose: it is the reference locale, the model answers in
 * the member's language anyway, and one copy keeps retrieval from returning
 * the same passage twice.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteEs } from '../src/i18n/site/es';
import { es } from '../src/i18n/dictionaries/es';
import * as rules from '../src/config/business-rules';
import { BILLABLE_ACTIONS } from '../src/config/billable-actions';
import { fillTokenRow, type TokenFacts } from '../src/ui/tokens/facts';

const OUT = join(__dirname, '..', 'docs', 'roxi', 'knowledge');

/**
 * The tokens tables quote live prices and settings ({listing_cost}, {work_free}…).
 * Here they are filled with the defaults the seed writes, so Roxi never reads a
 * placeholder; for a member's own situation she asks the my_account tool.
 */
const seededCost = (key: string): number | null => BILLABLE_ACTIONS.find((action) => action.key === key)?.cost ?? null;
const TOKEN_DEFAULTS: TokenFacts = {
  mercadito_free: rules.MERCADITO_RULES.freeOpenListings,
  listing_cost: seededCost('mercadito.publish_listing'),
  feature_listing_cost: seededCost('mercadito.feature_listing'),
  listing_days: rules.MERCADITO_RULES.featureDays,
  work_free: rules.WORK_RULES.freeOpenPosts,
  post_cost: seededCost('work.publish_post'),
  feature_post_cost: seededCost('work.feature_post'),
  post_days: rules.WORK_RULES.featureDays,
  feature_store_cost: seededCost('go.feature_store'),
  store_days: rules.GO_RULES.featureDays,
  starter_per_day: rules.TOKEN_RULES.starterGrantPerDay,
  starter_days: rules.TOKEN_RULES.starterGrantDays,
  inviter_reward: rules.REFERRAL_RULES.inviterReward,
  invitee_reward: rules.REFERRAL_RULES.inviteeReward,
  invite_month_cap: rules.REFERRAL_RULES.maxRewardedPerMonth,
};
const COST_WORDS = { one: siteEs.pages.tokens.costOne, many: siteEs.pages.tokens.costMany };

/**
 * Dictionary areas left out: staff and operations screens, email bodies and
 * the capability register (which reaches Roxi live, at the start of every
 * conversation, instead of as a snapshot that would go stale).
 */
const SKIPPED_AREAS = new Set(['ops', 'staff', 'admin', 'email', 'digest', 'capability']);

/**
 * The rules a member can run into, by name. Anything else stays out: the
 * duplicate-account weights, monitoring thresholds and similar would help
 * someone game them, and Roxi has no use for them.
 */
const MEMBER_RULES = [
  'TOKEN_RULES',
  'TOKEN_PACKAGES',
  'REPUTATION_RULES',
  'REPUTATION_RULE_DEFAULTS',
  'TRUST_BANDS',
  'SESSION_RULES',
  'SANCTION_RULES',
  'VERIFICATION_RULES',
  'MEDIA_RULES',
  'MERCADITO_RULES',
  'REFERRAL_RULES',
  'COMMUNITY_RULES',
  'WORK_RULES',
  'SAFE_SPACE_RULES',
  'ANIMALS_RULES',
  'SERVICES_RULES',
  'SANCTUARY_RULES',
  'GO_RULES',
  'GO_PLAN_RULES',
  'GO_TRIP_RULES',
] as const;

/** Fields inside those rules that are plumbing or anti-abuse limits, not something a member sees. */
const INTERNAL_FIELD =
  /pageSize|batch|utc|cooldown|perhour|notifylimit|alertdrivers|tracking|presence|refresh|online|quickexit|certificate|roughArea|counterMultiple|fallback|digestMin|lookback|interval|indexCache|cookie|treasury|publishcost|maxTokensPerPurchase|inputPixels|webp|dimension|attempts|challenges|touchAfter|rotateAfter|googleHint|launchPlaceCode|enabled|sortOrder|followUp|driverIdle/i;

function memberFacing(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(memberFacing);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !INTERNAL_FIELD.test(key)).map(([key, inner]) => [key, memberFacing(inner)]));
  }
  return value;
}

/** Keys in the site content that hold styling or wiring, not words. */
// costOne/costMany are the words a token price is written with, not text to read.
const SKIPPED_KEYS = new Set(['icon', 'color', 'href', 'whatsappHref', 'image', 'images', 'art', 'slug', 'costOne', 'costMany']);
/** Button and section labels: noise once the page is read as text. */
const LABEL_KEY = /^(eyebrow|cta|.*Cta|.*Eyebrow|.*Label)$/;

type Node = string | number | boolean | null | undefined | Node[] | { [key: string]: Node };

function isTable(node: Node): node is { head: string[]; rows: string[][] } {
  return typeof node === 'object' && node !== null && !Array.isArray(node) && Array.isArray(node.head) && Array.isArray(node.rows);
}

function cell(text: string): string {
  return text.replace(/\|/g, '/').replace(/\n/g, ' ');
}

/** Site content as headed prose: titles become headings, tables stay tables. */
function walk(node: Node, depth: number, out: string[], label?: string): void {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'number') return;
  if (typeof node === 'string') {
    // Prose can quote a token figure too ({mercadito_free}); other placeholders are left as they are.
    const text = fillTokenRow([node], TOKEN_DEFAULTS, COST_WORDS)?.[0] ?? node;
    if (text.trim()) out.push(label ? `- ${label}: ${text}` : `- ${text}`);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walk(item, depth, out);
    return;
  }
  if (isTable(node)) {
    out.push('', `| ${node.head.map(cell).join(' | ')} |`, `| ${node.head.map(() => '---').join(' | ')} |`);
    for (const raw of node.rows) {
      const row = fillTokenRow(raw, TOKEN_DEFAULTS, COST_WORDS);
      if (row) out.push(`| ${row.map(cell).join(' | ')} |`);
    }
    out.push('');
    return;
  }
  if (typeof node.q === 'string') {
    const answer = Array.isArray(node.a) ? node.a.join(' ') : String(node.a ?? '');
    out.push(`- **${node.q}** ${answer}`);
    return;
  }
  const title = typeof node.title === 'string' ? node.title : null;
  if (title) out.push('', `${'#'.repeat(Math.min(depth, 6))} ${title}`);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'title' || SKIPPED_KEYS.has(key) || LABEL_KEY.test(key)) continue;
    if (typeof value === 'string') {
      walk(value, depth + 1, out, key === 'text' || key === 'lead' || key === 'description' ? undefined : key);
    } else {
      walk(value, depth + 1, out);
    }
  }
}

function siteDocument(): string {
  const out = [
    '# Yavaya: el sitio, página por página',
    '',
    'Texto de las páginas públicas de yavaya.lat (Inicio, distritos, Confianza, Reputación, Tokens, Precios, Transparencia, Hoja de ruta, Nosotros, Ayuda, Términos, Privacidad).',
  ];
  out.push('', '## Distritos');
  for (const district of Object.values(siteEs.districts)) {
    out.push(`- **${district.name}**: ${district.tagline} ${district.purpose}`);
  }
  for (const [page, content] of Object.entries(siteEs.pages)) {
    const title = (content as { title?: string }).title ?? page;
    out.push('', `## Página: ${title}`);
    walk({ ...(content as object), title: undefined } as Node, 3, out);
  }
  out.push('', '## Pie de página', `- ${siteEs.ui.footer.about}`, `- ${siteEs.ui.footer.honest}`, `- ${siteEs.ui.footer.contact}: ${siteEs.ui.footer.whatsappLabel}`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/** Every member-facing text of the platform itself, grouped by area. */
function dictionaryDocument(): string {
  const groups = new Map<string, string[]>();
  for (const [key, value] of Object.entries(es)) {
    const area = key.split('.')[0]!;
    if (SKIPPED_AREAS.has(area)) continue;
    const lines = groups.get(area) ?? [];
    lines.push(`- \`${key}\`: ${String(value).replace(/\n/g, ' ')}`);
    groups.set(area, lines);
  }
  const out = [
    '# Textos de la plataforma',
    '',
    'Lo que la plataforma muestra a los miembros: botones, formularios, avisos y mensajes de error, agrupados por área. La clave dice dónde aparece cada texto (por ejemplo `mercadito.error.*` son los errores al publicar en Mercadito). Las palabras entre llaves, como {max}, se reemplazan por un número real cuando se muestran.',
  ];
  for (const [area, lines] of groups) out.push('', `## ${area}`, ...lines);
  return out.join('\n') + '\n';
}

/** The numbers, as the code holds them by default. */
function rulesDocument(): string {
  const out = [
    '# Reglas y números de Yavaya',
    '',
    'Valores por defecto de las reglas de negocio, tal como están en el código. Operaciones puede ajustar algunos sin publicar una versión nueva, así que para la situación de un miembro concreto (sus tokens, cuántas publicaciones gratis le quedan) vale lo que devuelve la herramienta my_account. Los montos de dinero están en centavos de dólar (499 = $4.99). Los tiempos van en segundos, minutos, horas o días según el nombre del campo.',
  ];
  for (const name of MEMBER_RULES) {
    out.push('', `## ${name}`, '```json', JSON.stringify(memberFacing(rules[name]), null, 2), '```');
  }
  return out.join('\n') + '\n';
}

/** The narration of the full video guide, without timings. */
function guideDocument(): string {
  const vtt = readFileSync(join(__dirname, '..', 'public', 'guide', 'guia-v1.vtt'), 'utf8');
  const lines = vtt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== 'WEBVTT' && !/^\d+$/.test(line) && !line.includes('-->'));
  const paragraphs: string[] = [];
  let current = '';
  for (const line of lines) {
    current = current ? `${current} ${line}` : line;
    if (/[.!?…]$/.test(line) && current.length > 280) {
      paragraphs.push(current);
      current = '';
    }
  }
  if (current) paragraphs.push(current);
  return [
    '# Guía en video: lo que cuenta la narración',
    '',
    'Narración completa de la guía en video de Yavaya (yavaya.lat/guia), un recorrido por todos los distritos. Útil para explicar cada distrito con palabras sencillas.',
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
  ].join('\n');
}

mkdirSync(OUT, { recursive: true });
const documents: Array<[string, string]> = [
  ['sitio.md', siteDocument()],
  ['textos-de-la-plataforma.md', dictionaryDocument()],
  ['reglas.md', rulesDocument()],
  ['guia-narrada.md', guideDocument()],
];
for (const [name, text] of documents) {
  writeFileSync(join(OUT, name), text);
  console.log(`${name}: ${text.length} characters`);
}
