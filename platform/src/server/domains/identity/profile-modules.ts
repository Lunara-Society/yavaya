import 'server-only';
import { eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { userProfiles } from '@/server/db/schema';
import { sellerListings, type ListingCard } from '@/server/domains/mercadito/service';
import { profilePage as workProfilePage, type ProfileSummary } from '@/server/domains/work/service';
import { providerPage, type ProviderSummary } from '@/server/domains/services/service';
import { myStore } from '@/server/domains/go/service';
import type { IdentityConfig, ProfileModuleId } from '@/config/identity-studio';

/**
 * The real things a profile's modules show, read only for the modules the
 * viewer may see. A module whose source does not exist — no work profile, no
 * approved store — has nothing to show and is left out; nothing here is ever
 * made up to fill a gap.
 */

export type ProfileModuleData = {
  listings: ListingCard[];
  work: ProfileSummary | null;
  services: { summary: ProviderSummary; bio: string } | null;
  store: { id: string; name: string; category: string; isOpen: boolean } | null;
  /** The number the member declared for WhatsApp. Declared, not verified — the profile says so. */
  whatsapp: string | null;
};

export async function loadModuleData(
  executor: Executor,
  params: { userId: string; yayDigits: string; locale: string; modules: ProfileModuleId[] },
): Promise<ProfileModuleData> {
  const wants = new Set(params.modules);
  const [listings, work, services, store, contact] = await Promise.all([
    wants.has('listings') ? sellerListings(executor, params.userId, params.locale, { publicOnly: true }) : Promise.resolve([]),
    wants.has('work') ? workProfilePage(executor, { yayDigits: params.yayDigits, locale: params.locale }) : Promise.resolve(null),
    wants.has('services') ? providerPage(executor, { yayDigits: params.yayDigits, locale: params.locale }) : Promise.resolve(null),
    wants.has('store') ? myStore(executor, params.userId) : Promise.resolve(null),
    wants.has('contact')
      ? executor.select({ whatsapp: userProfiles.whatsappE164 }).from(userProfiles).where(eq(userProfiles.userId, params.userId)).limit(1)
      : Promise.resolve([]),
  ]);
  return {
    listings,
    work,
    services: services ? { summary: services.summary, bio: services.bio } : null,
    // A store shows only once approved: the same rule as its own page.
    store: store && store.status === 'approved' ? { id: store.id, name: store.name, category: store.category, isOpen: store.isOpen } : null,
    whatsapp: contact[0]?.whatsapp ?? null,
  };
}

/** Whether a module has anything to show, from the member's words or their real activity. */
export function moduleHasContent(id: ProfileModuleId, config: IdentityConfig, data: ProfileModuleData): boolean {
  switch (id) {
    case 'about':
      return config.content.about.length > 0;
    case 'links':
      return config.content.links.length > 0;
    case 'languages':
      return config.content.languages.length > 0;
    case 'contact':
      return data.whatsapp !== null;
    case 'listings':
      return data.listings.length > 0;
    case 'work':
      return data.work !== null;
    case 'services':
      return data.services !== null;
    case 'store':
      return data.store !== null;
  }
}
