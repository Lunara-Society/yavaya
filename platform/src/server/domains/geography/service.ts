import { and, asc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { locations } from '@/server/db/schema';
import { LOCATION_PRIVACY, type LocationPrecision } from '@/config/business-rules';

/**
 * Geography service.
 *
 * The hierarchy is data. No function here takes a country or city name as a
 * literal, and adding a market is an insert, not a code change.
 */

export type LocationNode = {
  id: string;
  code: string;
  level: string;
  name: string;
  parentId: string | null;
  isoCode: string | null;
  latitude: number | null;
  longitude: number | null;
  depth: number;
};

export type LocalizedLocation = LocationNode & { displayName: string };

export function localizeName(
  row: { name: string; names: Record<string, string> },
  locale: string,
): string {
  return row.names[locale] ?? row.name;
}

export async function listCountries(
  executor: Executor,
  options: { supportedOnly?: boolean; locale?: string } = {},
): Promise<LocalizedLocation[]> {
  const conditions = [eq(locations.level, 'country'), eq(locations.isActive, true)];
  if (options.supportedOnly) conditions.push(eq(locations.isSupportedMarket, true));

  const rows = await executor
    .select()
    .from(locations)
    .where(and(...conditions))
    .orderBy(asc(locations.sortOrder), asc(locations.name));

  return rows.map((row) => toLocalized(row, options.locale ?? 'es'));
}

/** Immediate children of a node — the building block of a location picker. */
export async function listChildren(
  executor: Executor,
  parentId: string,
  options: { locale?: string } = {},
): Promise<LocalizedLocation[]> {
  const rows = await executor
    .select()
    .from(locations)
    .where(and(eq(locations.parentId, parentId), eq(locations.isActive, true)))
    .orderBy(asc(locations.sortOrder), asc(locations.name));

  return rows.map((row) => toLocalized(row, options.locale ?? 'es'));
}

export async function getByCode(
  executor: Executor,
  code: string,
  options: { locale?: string } = {},
): Promise<LocalizedLocation | null> {
  const [row] = await executor.select().from(locations).where(eq(locations.code, code)).limit(1);
  return row ? toLocalized(row, options.locale ?? 'es') : null;
}

export async function getById(
  executor: Executor,
  id: string,
  options: { locale?: string } = {},
): Promise<LocalizedLocation | null> {
  const [row] = await executor.select().from(locations).where(eq(locations.id, id)).limit(1);
  return row ? toLocalized(row, options.locale ?? 'es') : null;
}

/** Root-to-node breadcrumb, e.g. Central America → Guatemala → Guatemala City. */
export async function ancestorsOf(
  executor: Executor,
  id: string,
  options: { locale?: string } = {},
): Promise<LocalizedLocation[]> {
  const [node] = await executor.select().from(locations).where(eq(locations.id, id)).limit(1);
  if (!node || node.path.length === 0) return [];

  const rows = await executor
    .select()
    .from(locations)
    .where(inArray(locations.code, node.path))
    .orderBy(asc(locations.depth));

  return rows.map((row) => toLocalized(row, options.locale ?? 'es'));
}

/**
 * Everything at or beneath a node. Used for "search this whole department"
 * without the caller knowing how deep the tree goes there.
 */
export async function subtreeIds(executor: Executor, code: string): Promise<string[]> {
  const rows = await executor
    .select({ id: locations.id })
    .from(locations)
    .where(sql`${locations.code} = ${code} or ${code} = any(${locations.path})`);
  return rows.map((row) => row.id);
}

export async function search(
  executor: Executor,
  query: string,
  options: { locale?: string; levels?: Array<LocationNode['level']>; limit?: number } = {},
): Promise<LocalizedLocation[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const conditions = [eq(locations.isActive, true), ilike(locations.name, `%${trimmed}%`)];
  const rows = await executor
    .select()
    .from(locations)
    .where(and(...conditions))
    .orderBy(asc(locations.depth), asc(locations.name))
    .limit(options.limit ?? 20);

  return rows.map((row) => toLocalized(row, options.locale ?? 'es'));
}

/**
 * Nearest supported locations to a coordinate.
 *
 * Uses a bounding box plus a haversine sort rather than PostGIS, which keeps
 * the deployment dependency-free. Swapping in PostGIS later is a change to
 * this function only — see docs/CONFIGURATION.md.
 */
export async function nearby(
  executor: Executor,
  params: { latitude: number; longitude: number; radiusKm?: number; limit?: number; locale?: string },
): Promise<Array<LocalizedLocation & { distanceKm: number }>> {
  const radiusKm = params.radiusKm ?? 50;
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.01, Math.cos((params.latitude * Math.PI) / 180)));

  const rows = await executor
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.isActive, true),
        sql`${locations.latitude} between ${params.latitude - latDelta} and ${params.latitude + latDelta}`,
        sql`${locations.longitude} between ${params.longitude - lonDelta} and ${params.longitude + lonDelta}`,
      ),
    )
    .limit(200);

  return rows
    .map((row) => ({
      ...toLocalized(row, params.locale ?? 'es'),
      distanceKm: haversineKm(params.latitude, params.longitude, row.latitude ?? 0, row.longitude ?? 0),
    }))
    .filter((row) => row.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, params.limit ?? 10);
}

/**
 * Reduces a coordinate to the precision the user has agreed to publish.
 *
 * Granting GPS permission tells Yavaya where someone is; it does not give
 * Yavaya permission to tell everyone else. Publication always goes through
 * here, and `exact` is never the default.
 */
export function fuzzCoordinates(
  point: { latitude: number; longitude: number },
  precision: LocationPrecision,
): { latitude: number; longitude: number } | null {
  const radius = LOCATION_PRIVACY.fuzzRadiusMeters[precision];
  if (precision === 'exact') return point;
  if (radius === undefined) return null;

  // Snap to a grid of the given size. Snapping (rather than adding noise) means
  // repeated reads cannot be averaged back to the true position.
  const latStep = radius / 111_320;
  const lonStep = radius / (111_320 * Math.max(0.01, Math.cos((point.latitude * Math.PI) / 180)));

  return {
    latitude: Math.round(point.latitude / latStep) * latStep,
    longitude: Math.round(point.longitude / lonStep) * lonStep,
  };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Recomputes `path` and `depth` for a node from its parent. */
export async function materializePath(
  tx: Executor,
  params: { code: string; parentCode: string | null },
): Promise<{ path: string[]; depth: number }> {
  if (!params.parentCode) return { path: [], depth: 0 };

  const [parent] = await tx
    .select({ path: locations.path, depth: locations.depth, code: locations.code })
    .from(locations)
    .where(eq(locations.code, params.parentCode))
    .limit(1);

  if (!parent) return { path: [], depth: 0 };
  return { path: [...parent.path, parent.code], depth: parent.depth + 1 };
}

export async function listRegions(executor: Executor, locale = 'es'): Promise<LocalizedLocation[]> {
  const rows = await executor
    .select()
    .from(locations)
    .where(and(eq(locations.level, 'region'), isNull(locations.parentId)))
    .orderBy(asc(locations.sortOrder));
  return rows.map((row) => toLocalized(row, locale));
}

function toLocalized(
  row: typeof locations.$inferSelect,
  locale: string,
): LocalizedLocation {
  return {
    id: row.id,
    code: row.code,
    level: row.level,
    name: row.name,
    parentId: row.parentId,
    isoCode: row.isoCode,
    latitude: row.latitude,
    longitude: row.longitude,
    depth: row.depth,
    displayName: localizeName(row, locale),
  };
}
