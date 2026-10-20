import 'server-only';
import { eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { userProfiles, users } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { REPUTATION_RULES } from '@/config/business-rules';
import type { MessageKey, Translator } from '@/i18n';
import { formatPrice } from '@/ui/mercadito/format';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { isTwoStepEnabled } from '@/server/domains/identity/two-step';
import { getBalance } from '@/server/domains/tokens/service';
import { getScore } from '@/server/domains/reputation/service';
import { listNotifications, unreadCount } from '@/server/domains/notifications/service';
import { searchPlaces, placeById } from '@/server/domains/geography/places';
import { subtreeIds } from '@/server/domains/geography/service';
import { browseListings, getWhatsapp, openListingCount, pricingRules, sellerListings } from '@/server/domains/mercadito/service';
import { LISTING_CATEGORIES, type ListingCategory } from '@/server/domains/mercadito/rules';
import { browseStores } from '@/server/domains/go/service';
import { listPosts } from '@/server/domains/work/service';
import { listAnimals } from '@/server/domains/animals/service';
import { listChurches } from '@/server/domains/sanctuary/service';
import { listBoard } from '@/server/domains/services/service';
import { SERVICE_CATEGORY_KEYS, type ServiceCategoryKey } from '@/config/services';
import { GO_CATEGORIES } from '@/config/go';
import { SPECIES } from '@/config/animals';
import { WORK_FIELDS } from '@/config/work';

/**
 * Roxi, the assistant members talk to.
 *
 * Roxi itself runs at ElevenLabs (voice, the model, the knowledge of Yavaya).
 * What it does on the site happens through "client tools": functions in the
 * member's own browser that call these read-only look-ups with the member's
 * own session, or fill in a form the member then sends. Nothing here writes,
 * and nothing is visible to Roxi that the member could not open themselves.
 *
 * Answers are compact text, not pages: a model reads every byte, and a voice
 * conversation needs a few results it can talk about, not a catalogue.
 */

export const ROXI_SCOPES = ['mercadito', 'yavayago', 'work', 'animals', 'sanctuary', 'services'] as const;
export type RoxiScope = (typeof ROXI_SCOPES)[number];

/** How many results one look-up returns: what a person can take in by ear. */
const RESULTS = 6;

export type RoxiAvailability = { available: true; agentId: string; signed: boolean } | { available: false };

export function roxiAvailability(): RoxiAvailability {
  const env = serverEnv();
  if (!env.ROXI_AGENT_ID) return { available: false };
  return { available: true, agentId: env.ROXI_AGENT_ID, signed: Boolean(env.ELEVENLABS_API_KEY) };
}

/**
 * A signed link for one conversation, when an ElevenLabs API key is set: the
 * agent can then refuse anyone who did not get a link from a signed-in page.
 */
export async function signedConversationUrl(agentId: string): Promise<string | null> {
  const key = serverEnv().ELEVENLABS_API_KEY;
  if (!key) return null;
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { 'xi-api-key': key },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { signed_url?: string } | null;
  return body?.signed_url ?? null;
}

/** What Roxi is told about the member when a conversation opens. */
export type RoxiMember = { firstName: string; yayId: string; placeName: string | null; emailVerified: boolean };

export async function roxiMember(executor: Executor, userId: string, locale: string): Promise<RoxiMember | null> {
  const [row] = await executor
    .select({ displayName: users.displayName, yayId: users.yayId, emailVerifiedAt: users.emailVerifiedAt, locationId: userProfiles.locationId })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  const place = row.locationId ? await placeById(executor, row.locationId, locale) : null;
  return {
    // The first word of the name the member chose: what a person would call them.
    firstName: row.displayName.trim().split(/\s+/)[0] ?? '',
    yayId: formatYayId(row.yayId),
    placeName: place?.name ?? null,
    emailVerified: row.emailVerifiedAt !== null,
  };
}

/** A place name as said aloud ("Managua", "León") to the place code the district filters use. */
async function placeCode(executor: Executor, name: string | undefined, locale: string): Promise<{ code: string; name: string } | null> {
  const query = name?.trim();
  if (!query) return null;
  const [hit] = await searchPlaces(executor, query, { locale, limit: 1 });
  return hit ? { code: hit.code, name: hit.name } : null;
}

const pick = <T extends string>(allowed: readonly T[], value: string | undefined): T | undefined =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

export type RoxiSearchResult = {
  scope: RoxiScope;
  place: string | null;
  items: Array<{ title: string; detail: string; url: string }>;
  more: boolean;
};

/**
 * One look-up in one district, as the member would see it there: the same
 * functions the district pages use, with their visibility rules.
 */
export async function roxiSearch(
  executor: Executor,
  params: { userId: string; locale: string; t: Translator; scope: RoxiScope; query?: string; category?: string; place?: string },
): Promise<RoxiSearchResult> {
  const { locale, t } = params;
  const place = await placeCode(executor, params.place, locale);
  const query = params.query?.trim().slice(0, 80) || undefined;
  const matches = (text: string) => !query || text.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale));
  const done = (items: RoxiSearchResult['items'], more: boolean): RoxiSearchResult => ({
    scope: params.scope,
    place: place?.name ?? null,
    items: items.slice(0, RESULTS),
    more: more || items.length > RESULTS,
  });

  switch (params.scope) {
    case 'mercadito': {
      const result = await browseListings(executor, {
        query,
        category: pick<ListingCategory>(LISTING_CATEGORIES, params.category),
        placeCode: place?.code,
        locale,
      });
      return done(
        result.items.map((item) => ({
          title: item.title,
          detail: [formatPrice(item.priceMinor, item.currencyCode, locale), item.placeName, item.featured ? t('roxi.result.featured') : null]
            .filter(Boolean)
            .join(' · '),
          url: `/mercadito/${item.id}`,
        })),
        result.hasMore,
      );
    }
    case 'yavayago': {
      const stores = await browseStores(executor, {
        locationIds: place ? await subtreeIds(executor, place.code) : null,
        category: pick(GO_CATEGORIES, params.category) ?? null,
      });
      return done(
        stores
          .filter((store) => matches(`${store.name} ${store.about}`))
          .map((store) => ({
            title: store.name,
            detail: [t(`go.category.${store.category}` as MessageKey), store.placeName, t(store.isOpen ? 'roxi.result.open' : 'roxi.result.closed')].join(' · '),
            url: `/yavayago/stores/${store.id}`,
          })),
        false,
      );
    }
    case 'work': {
      const result = await listPosts(executor, { locale, field: pick(WORK_FIELDS, params.category), placeCode: place?.code });
      return done(
        result.items
          .filter((post) => matches(`${post.title} ${post.description}`))
          .map((post) => ({ title: post.title, detail: [post.payText, post.placeName, post.companyName ?? post.employerName].join(' · '), url: `/work/posts/${post.id}` })),
        result.hasMore,
      );
    }
    case 'animals': {
      const result = await listAnimals(executor, { locale, species: pick(SPECIES, params.category), placeCode: place?.code });
      return done(
        result.items
          .filter((animal) => matches(animal.name))
          .map((animal) => ({
            title: animal.name,
            detail: [t(`animals.species.${animal.species}` as MessageKey), animal.placeName, animal.rescuerName].join(' · '),
            url: `/animals/${animal.id}`,
          })),
        result.hasMore,
      );
    }
    case 'sanctuary': {
      const churches = await listChurches(executor, { locale, placeCode: place?.code, query });
      return done(
        churches.map((church) => ({
          title: church.name,
          detail: [church.denomination, church.placeName, church.next ? `${church.next.title} ${church.next.startTime}` : null].filter(Boolean).join(' · '),
          url: `/sanctuary/churches/${church.id}`,
        })),
        false,
      );
    }
    case 'services': {
      // Requests, not people: the board a member sees, with its privacy rules.
      const result = await listBoard(executor, {
        viewerId: params.userId,
        category: pick<ServiceCategoryKey>(SERVICE_CATEGORY_KEYS, params.category),
        locale,
      });
      return done(
        result.items
          .filter((request) => matches(`${request.title} ${request.body}`) && (!place || request.placeName === place.name))
          .map((request) => ({
            title: request.title,
            detail: [t(`services.category.${request.category}` as MessageKey), request.placeName, request.urgent ? t('roxi.result.urgent') : null]
              .filter(Boolean)
              .join(' · '),
            url: `/services/requests/${request.id}`,
          })),
        result.hasMore,
      );
    }
  }
}

/** The member's own standing, in a few lines Roxi can read out. */
export async function roxiAccount(executor: Executor, params: { userId: string; locale: string; t: Translator }) {
  const { userId, locale, t } = params;
  const [member, tokens, score, twoStep, unread, recent, open, pricing, listings, whatsapp] = await Promise.all([
    roxiMember(executor, userId, locale),
    getBalance(executor, userId),
    getScore(executor, userId),
    isTwoStepEnabled(executor, userId),
    unreadCount(executor, userId),
    listNotifications(executor, userId, 5),
    openListingCount(executor, userId),
    pricingRules(executor),
    sellerListings(executor, userId, locale, { publicOnly: true }),
    getWhatsapp(executor, userId),
  ]);
  return {
    name: member?.firstName ?? '',
    yayId: member?.yayId ?? '',
    place: member?.placeName,
    emailVerified: member?.emailVerified ?? false,
    twoStep,
    whatsappOnListings: Boolean(whatsapp),
    tokens,
    reputation: { score, max: REPUTATION_RULES.maximumScore },
    mercadito: {
      openListings: open,
      freeLeft: Math.max(0, pricing.freeOpenListings - open),
      freeAllowance: pricing.freeOpenListings,
      latest: listings.slice(0, 5).map((listing) => ({
        title: listing.title,
        price: formatPrice(listing.priceMinor, listing.currencyCode, locale),
        status: t(`mercadito.status.${listing.status}` as MessageKey),
        url: `/mercadito/${listing.id}`,
      })),
    },
    notifications: {
      unread,
      latest: recent.map((item) => ({
        text: t(item.titleKey as MessageKey, item.params),
        read: item.read,
        url: item.href,
      })),
    },
  };
}
