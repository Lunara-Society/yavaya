import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { locations } from '@/server/db/schema';
import { PAYMENT_ROUTING, coversCountry } from '@/config/payments';
import { getProvider } from './service';
import type { PaymentProvider } from './provider';

/** The country (ISO alpha-2) above a member's declared location, or null. */
export async function memberCountry(executor: Executor, userId: string): Promise<string | null> {
  const rows = (await executor.execute(sql`
    with recursive up as (
      select l.id, l.parent_id, l.level, l.iso_code
      from user_profiles p join locations l on l.id = p.location_id
      where p.user_id = ${userId}
      union all
      select l.id, l.parent_id, l.level, l.iso_code from locations l join up on l.id = up.parent_id
    )
    select iso_code from up where level = 'country' limit 1`)) as unknown as Array<{ iso_code: string | null }>;
  const iso = rows[0]?.iso_code;
  return iso && /^[A-Z]{2}$/.test(iso) ? iso : null;
}

export type Route =
  | { status: 'ready'; provider: PaymentProvider }
  /** A provider covers the country but is not configured yet. */
  | { status: 'pending'; providerKey: string }
  | { status: 'none' };

/**
 * The provider a member in this country pays with. A member with no
 * country set gets any configured provider — one that serves every country
 * first; otherwise one whose checkout asks the payer for their country — so
 * a missing profile field never blocks a purchase.
 */
export function routeFor(countryIso: string | null): Route {
  let pending: string | null = null;
  const order = countryIso === null ? [...PAYMENT_ROUTING].sort((a, b) => Number(b.countries === 'any') - Number(a.countries === 'any')) : PAYMENT_ROUTING;
  for (const entry of order) {
    if (countryIso !== null && !coversCountry(entry, countryIso)) continue;
    const provider = getProvider(entry.provider);
    if (provider.availability().available) return { status: 'ready', provider };
    pending ??= entry.provider;
  }
  return pending ? { status: 'pending', providerKey: pending } : { status: 'none' };
}

export type CountryRoute = { iso: string; name: string; providerKey: string | null; ready: boolean };

/** Every country Yavaya serves, with how it pays: the table on the tokens page. */
export async function countryRoutes(executor: Executor, locale: string): Promise<CountryRoute[]> {
  const countries = await executor
    .select({ iso: locations.isoCode, name: locations.name, names: locations.names })
    .from(locations)
    .where(and(eq(locations.level, 'country'), sql`${locations.isoCode} is not null`));
  return countries
    .map((c) => {
      const route = routeFor(c.iso!);
      return {
        iso: c.iso!,
        name: c.names[locale] ?? c.name,
        providerKey: route.status === 'ready' ? route.provider.key : route.status === 'pending' ? route.providerKey : null,
        ready: route.status === 'ready',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
