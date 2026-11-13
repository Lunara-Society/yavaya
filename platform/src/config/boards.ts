/**
 * The districts built on the shared board (November 2026): Hogar,
 * Movilidad, Salud y Bienestar, Aprender, Negocios and Campo.
 *
 * Each is a place where a member publishes what they offer or what they are
 * looking for, inside one of the district's subdistricts. They share one
 * engine (`src/server/domains/boards`) and one set of pages
 * (`src/ui/boards`), because what differs between them is the subject, not
 * the mechanics: who can publish, how long a post stays open, how it is
 * reported and removed are the same everywhere.
 *
 * The subdistricts are Yavaya's own starting list, chosen when the districts
 * were built, not a specification (CONFIGURATION.md, "Board districts"). A
 * subdistrict is a key here and a name in the dictionaries; adding one is two
 * lines and no migration.
 */
export const BOARD_DISTRICTS = {
  hogar: {
    slug: 'hogar',
    subdistricts: ['rentals', 'rooms', 'for_sale', 'land', 'moving', 'furniture', 'household'],
    notice: 'board.notice.hogar',
    doors: ['/services', '/mercadito'],
  },
  movilidad: {
    slug: 'movilidad',
    subdistricts: ['shared_rides', 'routes', 'freight', 'vehicle_rental', 'vehicles', 'parts', 'workshops'],
    notice: 'board.notice.movilidad',
    doors: ['/yavayago/viajes', '/services'],
  },
  salud: {
    slug: 'salud',
    subdistricts: ['clinics', 'pharmacies', 'consultations', 'home_care', 'mental_health', 'wellness', 'blood_donation', 'medical_equipment'],
    notice: 'board.notice.salud',
    doors: ['/services', '/violeta'],
  },
  aprender: {
    slug: 'aprender',
    subdistricts: ['courses', 'trades', 'tutoring', 'languages', 'digital_skills', 'scholarships', 'materials'],
    notice: 'board.notice.aprender',
    doors: ['/work', '/services'],
  },
  negocios: {
    slug: 'negocios',
    subdistricts: ['suppliers', 'wholesale', 'equipment', 'premises', 'business_services', 'partners', 'franchises'],
    notice: 'board.notice.negocios',
    doors: ['/mi-negocio', '/roxi/negocio', '/mercadito', '/yavayago'],
  },
  campo: {
    slug: 'campo',
    subdistricts: ['harvest', 'buyers', 'livestock', 'supplies', 'machinery', 'land_lease', 'farm_work', 'farm_transport'],
    notice: 'board.notice.campo',
    doors: ['/mercadito', '/work'],
  },
  // 13 November 2026, the owner's word: the neighbourhood's notice board, and help at home arranged by family abroad.
  barrio: {
    slug: 'barrio',
    subdistricts: ['notices', 'utilities', 'events', 'fairs', 'lost_found', 'giveaways', 'neighbour_help', 'groups'],
    notice: 'board.notice.barrio',
    doors: ['/community', '/hogar'],
  },
  diaspora: {
    slug: 'diaspora',
    subdistricts: ['home_repairs', 'errands', 'elder_care', 'medical_visits', 'deliveries', 'paperwork', 'celebrations', 'property_care'],
    notice: 'board.notice.diaspora',
    doors: ['/services', '/salud'],
  },
} as const satisfies Record<string, { slug: string; subdistricts: readonly string[]; notice: string; doors: readonly string[] }>;

export type BoardDistrict = keyof typeof BOARD_DISTRICTS;
export const BOARD_DISTRICT_KEYS = Object.keys(BOARD_DISTRICTS) as BoardDistrict[];

/** Offering something, or looking for it. */
export const BOARD_KINDS = ['offer', 'request'] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

export function isBoardDistrict(value: string): value is BoardDistrict {
  return Object.hasOwn(BOARD_DISTRICTS, value);
}

export function isSubdistrict(district: BoardDistrict, value: string): boolean {
  return (BOARD_DISTRICTS[district].subdistricts as readonly string[]).includes(value);
}
