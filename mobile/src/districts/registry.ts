import { districtAccent, type DistrictId } from '../design/tokens.ts';

/**
 * The fifteen districts as the website has them (platform/src/config/districts.ts).
 * `native` says whether the district has a native screen yet; every district
 * keeps its full website screen inside the app (BASELINE_AUDIT §7).
 */
export type District = {
  id: DistrictId;
  name: { es: string; en: string };
  line: { es: string; en: string };
  webPath: string;
  accent: string;
  /** Glyph id from design/icons. */
  glyph: string;
  essential: boolean;
};

const d = (id: DistrictId, es: string, en: string, lineEs: string, lineEn: string, glyph: string, essential = false): District => ({
  id,
  name: { es, en },
  line: { es: lineEs, en: lineEn },
  webPath: `/${id}`,
  accent: districtAccent[id],
  glyph,
  essential,
});

export const DISTRICTS: readonly District[] = [
  d('mercadito', 'Mercadito', 'Market', 'Compra y vende cerca de ti', 'Buy and sell near you', 'market', true),
  d('yavayago', 'YavayaGo', 'YavayaGo', 'Entregas y viajes de confianza', 'Trusted deliveries and rides', 'go', true),
  d('services', 'Servicios', 'Services', 'Gente que resuelve hoy', 'People who fix it today', 'tool', true),
  d('work', 'Trabajo', 'Work', 'Ofertas con pago visible', 'Jobs with visible pay', 'work', true),
  d('community', 'Comunidad', 'Community', 'Ayuda local y oración', 'Local help and prayer', 'people'),
  d('sanctuary', 'Santuario', 'Sanctuary', 'Iglesias y una vela por alguien', 'Churches and a candle for someone', 'candle'),
  d('animals', 'Animales', 'Animals', 'Adopción y rescate', 'Adoption and rescue', 'paw'),
  d('hogar', 'Hogar', 'Home', 'Casa, cuartos y arreglos', 'Homes, rooms and repairs', 'house'),
  d('movilidad', 'Movilidad', 'Mobility', 'Vehículos y transporte', 'Vehicles and transport', 'route'),
  d('salud', 'Salud y Bienestar', 'Health', 'Cuidado y bienestar', 'Care and wellbeing', 'pulse'),
  d('aprender', 'Aprender', 'Learn', 'Clases y cursos', 'Classes and courses', 'book'),
  d('negocios', 'Negocios', 'Business', 'Tiendas y proveedores', 'Shops and suppliers', 'store'),
  d('campo', 'Campo', 'Farm', 'Cosecha, ganado y herramientas', 'Harvest, livestock and tools', 'leaf'),
  d('barrio', 'Barrio', 'Neighbourhood', 'Cortes de agua y luz, avisos', 'Water and power cuts, notices', 'signal'),
  d('diaspora', 'Diáspora', 'Diaspora', 'Cerca de casa desde lejos', 'Close to home from afar', 'globe'),
];

export const districtById = (id: string): District | undefined => DISTRICTS.find((x) => x.id === id);
