/**
 * Geographic seed data.
 *
 * Structural notes:
 *  - Central America and North America are separate regions. Mexico is
 *    modelled under North America and marked as an expansion market, because
 *    Mexico is not a Central American country. It is supported geographically
 *    without being misfiled.
 *  - `isSupportedMarket` marks the seven launch countries. Everything else is
 *    addressable but closed to new activity until it is opened deliberately.
 *  - Cities listed here are a starting set, not a fixed list. Towns, villages
 *    and neighborhoods are added as data — never as code.
 */

export type SeedCity = {
  code: string;
  name: string;
  level?: 'city' | 'town' | 'village';
  lat?: number;
  lon?: number;
};

export type SeedState = {
  code: string;
  name: string;
  isoCode?: string;
  cities?: SeedCity[];
};

export type SeedCountry = {
  code: string;
  name: string;
  names?: Record<string, string>;
  isoCode: string;
  phonePrefix: string;
  currencyCode: string;
  timezone: string;
  supported: boolean;
  states: SeedState[];
};

export type SeedRegion = {
  code: string;
  name: string;
  names: Record<string, string>;
  countries: SeedCountry[];
};

export const GEOGRAPHY_SEED: SeedRegion[] = [
  {
    code: 'ca',
    name: 'Central America',
    names: { es: 'Centroamérica', en: 'Central America' },
    countries: [
      {
        code: 'ca.gt',
        name: 'Guatemala',
        isoCode: 'GT',
        phonePrefix: '+502',
        currencyCode: 'GTQ',
        timezone: 'America/Guatemala',
        supported: true,
        states: [
          {
            code: 'ca.gt.gua',
            name: 'Guatemala',
            isoCode: 'GT-GU',
            cities: [
              { code: 'ca.gt.gua.guatemala-city', name: 'Ciudad de Guatemala', lat: 14.6349, lon: -90.5069 },
              { code: 'ca.gt.gua.mixco', name: 'Mixco', lat: 14.6333, lon: -90.6064 },
              { code: 'ca.gt.gua.villa-nueva', name: 'Villa Nueva', lat: 14.5269, lon: -90.5875 },
            ],
          },
          {
            code: 'ca.gt.sac',
            name: 'Sacatepéquez',
            isoCode: 'GT-SA',
            cities: [{ code: 'ca.gt.sac.antigua', name: 'Antigua Guatemala', lat: 14.5586, lon: -90.7295 }],
          },
          {
            code: 'ca.gt.que',
            name: 'Quetzaltenango',
            isoCode: 'GT-QZ',
            cities: [{ code: 'ca.gt.que.quetzaltenango', name: 'Quetzaltenango', lat: 14.8347, lon: -91.5181 }],
          },
          {
            code: 'ca.gt.esc',
            name: 'Escuintla',
            isoCode: 'GT-ES',
            cities: [{ code: 'ca.gt.esc.escuintla', name: 'Escuintla', lat: 14.3050, lon: -90.7850 }],
          },
          {
            code: 'ca.gt.izb',
            name: 'Izabal',
            isoCode: 'GT-IZ',
            cities: [{ code: 'ca.gt.izb.puerto-barrios', name: 'Puerto Barrios', lat: 15.7278, lon: -88.5944 }],
          },
          { code: 'ca.gt.alt', name: 'Alta Verapaz', isoCode: 'GT-AV', cities: [{ code: 'ca.gt.alt.coban', name: 'Cobán', lat: 15.4708, lon: -90.3711 }] },
          { code: 'ca.gt.baj', name: 'Baja Verapaz', isoCode: 'GT-BV' },
          { code: 'ca.gt.chm', name: 'Chimaltenango', isoCode: 'GT-CM' },
          { code: 'ca.gt.chq', name: 'Chiquimula', isoCode: 'GT-CQ' },
          { code: 'ca.gt.pet', name: 'Petén', isoCode: 'GT-PE', cities: [{ code: 'ca.gt.pet.flores', name: 'Flores', lat: 16.9280, lon: -89.8919 }] },
          { code: 'ca.gt.pro', name: 'El Progreso', isoCode: 'GT-PR' },
          { code: 'ca.gt.hue', name: 'Huehuetenango', isoCode: 'GT-HU' },
          { code: 'ca.gt.jal', name: 'Jalapa', isoCode: 'GT-JA' },
          { code: 'ca.gt.jut', name: 'Jutiapa', isoCode: 'GT-JU' },
          { code: 'ca.gt.qui', name: 'Quiché', isoCode: 'GT-QC' },
          { code: 'ca.gt.ret', name: 'Retalhuleu', isoCode: 'GT-RE' },
          { code: 'ca.gt.san', name: 'San Marcos', isoCode: 'GT-SM' },
          { code: 'ca.gt.sro', name: 'Santa Rosa', isoCode: 'GT-SR' },
          { code: 'ca.gt.sol', name: 'Sololá', isoCode: 'GT-SO' },
          { code: 'ca.gt.suc', name: 'Suchitepéquez', isoCode: 'GT-SU' },
          { code: 'ca.gt.tot', name: 'Totonicapán', isoCode: 'GT-TO' },
          { code: 'ca.gt.zac', name: 'Zacapa', isoCode: 'GT-ZA' },
        ],
      },
      {
        code: 'ca.hn',
        name: 'Honduras',
        isoCode: 'HN',
        phonePrefix: '+504',
        currencyCode: 'HNL',
        timezone: 'America/Tegucigalpa',
        supported: true,
        states: [
          {
            code: 'ca.hn.fm',
            name: 'Francisco Morazán',
            isoCode: 'HN-FM',
            cities: [{ code: 'ca.hn.fm.tegucigalpa', name: 'Tegucigalpa', lat: 14.0723, lon: -87.1921 }],
          },
          {
            code: 'ca.hn.cr',
            name: 'Cortés',
            isoCode: 'HN-CR',
            cities: [
              { code: 'ca.hn.cr.san-pedro-sula', name: 'San Pedro Sula', lat: 15.5042, lon: -88.0250 },
              { code: 'ca.hn.cr.puerto-cortes', name: 'Puerto Cortés', lat: 15.8500, lon: -87.9333 },
            ],
          },
          { code: 'ca.hn.at', name: 'Atlántida', isoCode: 'HN-AT', cities: [{ code: 'ca.hn.at.la-ceiba', name: 'La Ceiba', lat: 15.7597, lon: -86.7822 }] },
          { code: 'ca.hn.ch', name: 'Choluteca', isoCode: 'HN-CH' },
          { code: 'ca.hn.cl', name: 'Colón', isoCode: 'HN-CL' },
          { code: 'ca.hn.cm', name: 'Comayagua', isoCode: 'HN-CM' },
          { code: 'ca.hn.cp', name: 'Copán', isoCode: 'HN-CP' },
          { code: 'ca.hn.ib', name: 'Islas de la Bahía', isoCode: 'HN-IB' },
          { code: 'ca.hn.in', name: 'Intibucá', isoCode: 'HN-IN' },
          { code: 'ca.hn.lp', name: 'La Paz', isoCode: 'HN-LP' },
          { code: 'ca.hn.le', name: 'Lempira', isoCode: 'HN-LE' },
          { code: 'ca.hn.oc', name: 'Ocotepeque', isoCode: 'HN-OC' },
          { code: 'ca.hn.ol', name: 'Olancho', isoCode: 'HN-OL' },
          { code: 'ca.hn.sb', name: 'Santa Bárbara', isoCode: 'HN-SB' },
          { code: 'ca.hn.va', name: 'Valle', isoCode: 'HN-VA' },
          { code: 'ca.hn.yo', name: 'Yoro', isoCode: 'HN-YO' },
          { code: 'ca.hn.gd', name: 'Gracias a Dios', isoCode: 'HN-GD' },
          { code: 'ca.hn.ep', name: 'El Paraíso', isoCode: 'HN-EP' },
        ],
      },
      {
        code: 'ca.sv',
        name: 'El Salvador',
        isoCode: 'SV',
        phonePrefix: '+503',
        currencyCode: 'USD',
        timezone: 'America/El_Salvador',
        supported: true,
        states: [
          {
            code: 'ca.sv.ss',
            name: 'San Salvador',
            isoCode: 'SV-SS',
            cities: [
              { code: 'ca.sv.ss.san-salvador', name: 'San Salvador', lat: 13.6929, lon: -89.2182 },
              { code: 'ca.sv.ss.soyapango', name: 'Soyapango', lat: 13.7100, lon: -89.1400 },
            ],
          },
          { code: 'ca.sv.sa', name: 'Santa Ana', isoCode: 'SV-SA', cities: [{ code: 'ca.sv.sa.santa-ana', name: 'Santa Ana', lat: 13.9942, lon: -89.5597 }] },
          { code: 'ca.sv.sm', name: 'San Miguel', isoCode: 'SV-SM', cities: [{ code: 'ca.sv.sm.san-miguel', name: 'San Miguel', lat: 13.4833, lon: -88.1833 }] },
          { code: 'ca.sv.ah', name: 'Ahuachapán', isoCode: 'SV-AH' },
          { code: 'ca.sv.ca', name: 'Cabañas', isoCode: 'SV-CA' },
          { code: 'ca.sv.ch', name: 'Chalatenango', isoCode: 'SV-CH' },
          { code: 'ca.sv.cu', name: 'Cuscatlán', isoCode: 'SV-CU' },
          { code: 'ca.sv.li', name: 'La Libertad', isoCode: 'SV-LI' },
          { code: 'ca.sv.pa', name: 'La Paz', isoCode: 'SV-PA' },
          { code: 'ca.sv.un', name: 'La Unión', isoCode: 'SV-UN' },
          { code: 'ca.sv.mo', name: 'Morazán', isoCode: 'SV-MO' },
          { code: 'ca.sv.sv', name: 'San Vicente', isoCode: 'SV-SV' },
          { code: 'ca.sv.so', name: 'Sonsonate', isoCode: 'SV-SO' },
          { code: 'ca.sv.us', name: 'Usulután', isoCode: 'SV-US' },
        ],
      },
      {
        code: 'ca.ni',
        name: 'Nicaragua',
        isoCode: 'NI',
        phonePrefix: '+505',
        currencyCode: 'NIO',
        timezone: 'America/Managua',
        supported: true,
        states: [
          {
            code: 'ca.ni.mn',
            name: 'Managua',
            isoCode: 'NI-MN',
            cities: [{ code: 'ca.ni.mn.managua', name: 'Managua', lat: 12.1149, lon: -86.2362 }],
          },
          { code: 'ca.ni.le', name: 'León', isoCode: 'NI-LE', cities: [{ code: 'ca.ni.le.leon', name: 'León', lat: 12.4379, lon: -86.8780 }] },
          { code: 'ca.ni.gr', name: 'Granada', isoCode: 'NI-GR', cities: [{ code: 'ca.ni.gr.granada', name: 'Granada', lat: 11.9294, lon: -85.9560 }] },
          { code: 'ca.ni.ms', name: 'Masaya', isoCode: 'NI-MS' },
          { code: 'ca.ni.mt', name: 'Matagalpa', isoCode: 'NI-MT' },
          { code: 'ca.ni.ci', name: 'Chinandega', isoCode: 'NI-CI' },
          { code: 'ca.ni.co', name: 'Chontales', isoCode: 'NI-CO' },
          { code: 'ca.ni.bo', name: 'Boaco', isoCode: 'NI-BO' },
          { code: 'ca.ni.ca', name: 'Carazo', isoCode: 'NI-CA' },
          { code: 'ca.ni.es', name: 'Estelí', isoCode: 'NI-ES' },
          { code: 'ca.ni.ji', name: 'Jinotega', isoCode: 'NI-JI' },
          { code: 'ca.ni.md', name: 'Madriz', isoCode: 'NI-MD' },
          { code: 'ca.ni.ns', name: 'Nueva Segovia', isoCode: 'NI-NS' },
          { code: 'ca.ni.ri', name: 'Rivas', isoCode: 'NI-RI' },
          { code: 'ca.ni.sj', name: 'Río San Juan', isoCode: 'NI-SJ' },
          { code: 'ca.ni.an', name: 'Costa Caribe Norte', isoCode: 'NI-AN' },
          { code: 'ca.ni.as', name: 'Costa Caribe Sur', isoCode: 'NI-AS' },
        ],
      },
      {
        code: 'ca.cr',
        name: 'Costa Rica',
        isoCode: 'CR',
        phonePrefix: '+506',
        currencyCode: 'CRC',
        timezone: 'America/Costa_Rica',
        supported: true,
        states: [
          {
            code: 'ca.cr.sj',
            name: 'San José',
            isoCode: 'CR-SJ',
            cities: [{ code: 'ca.cr.sj.san-jose', name: 'San José', lat: 9.9281, lon: -84.0907 }],
          },
          { code: 'ca.cr.a', name: 'Alajuela', isoCode: 'CR-A', cities: [{ code: 'ca.cr.a.alajuela', name: 'Alajuela', lat: 10.0163, lon: -84.2117 }] },
          { code: 'ca.cr.c', name: 'Cartago', isoCode: 'CR-C', cities: [{ code: 'ca.cr.c.cartago', name: 'Cartago', lat: 9.8644, lon: -83.9194 }] },
          { code: 'ca.cr.h', name: 'Heredia', isoCode: 'CR-H' },
          { code: 'ca.cr.g', name: 'Guanacaste', isoCode: 'CR-G' },
          { code: 'ca.cr.p', name: 'Puntarenas', isoCode: 'CR-P' },
          { code: 'ca.cr.l', name: 'Limón', isoCode: 'CR-L' },
        ],
      },
      {
        code: 'ca.pa',
        name: 'Panamá',
        names: { es: 'Panamá', en: 'Panama' },
        isoCode: 'PA',
        phonePrefix: '+507',
        currencyCode: 'PAB',
        timezone: 'America/Panama',
        supported: true,
        states: [
          {
            code: 'ca.pa.8',
            name: 'Panamá',
            isoCode: 'PA-8',
            cities: [{ code: 'ca.pa.8.panama-city', name: 'Ciudad de Panamá', lat: 8.9824, lon: -79.5199 }],
          },
          { code: 'ca.pa.9', name: 'Veraguas', isoCode: 'PA-9' },
          { code: 'ca.pa.1', name: 'Bocas del Toro', isoCode: 'PA-1' },
          { code: 'ca.pa.2', name: 'Coclé', isoCode: 'PA-2' },
          { code: 'ca.pa.3', name: 'Colón', isoCode: 'PA-3', cities: [{ code: 'ca.pa.3.colon', name: 'Colón', lat: 9.3592, lon: -79.9014 }] },
          { code: 'ca.pa.4', name: 'Chiriquí', isoCode: 'PA-4', cities: [{ code: 'ca.pa.4.david', name: 'David', lat: 8.4333, lon: -82.4333 }] },
          { code: 'ca.pa.5', name: 'Darién', isoCode: 'PA-5' },
          { code: 'ca.pa.6', name: 'Herrera', isoCode: 'PA-6' },
          { code: 'ca.pa.7', name: 'Los Santos', isoCode: 'PA-7' },
          { code: 'ca.pa.10', name: 'Panamá Oeste', isoCode: 'PA-10' },
          { code: 'ca.pa.em', name: 'Emberá-Wounaan', isoCode: 'PA-EM' },
          { code: 'ca.pa.kt', name: 'Guna Yala', isoCode: 'PA-KY' },
          { code: 'ca.pa.nb', name: 'Ngäbe-Buglé', isoCode: 'PA-NB' },
        ],
      },
      {
        code: 'ca.bz',
        name: 'Belize',
        names: { es: 'Belice', en: 'Belize' },
        isoCode: 'BZ',
        phonePrefix: '+501',
        currencyCode: 'BZD',
        timezone: 'America/Belize',
        supported: true,
        states: [
          {
            code: 'ca.bz.bz',
            name: 'Belize',
            isoCode: 'BZ-BZ',
            cities: [{ code: 'ca.bz.bz.belize-city', name: 'Belize City', lat: 17.5046, lon: -88.1962 }],
          },
          {
            code: 'ca.bz.cy',
            name: 'Cayo',
            isoCode: 'BZ-CY',
            cities: [{ code: 'ca.bz.cy.belmopan', name: 'Belmopan', lat: 17.2514, lon: -88.7705 }],
          },
          { code: 'ca.bz.cz', name: 'Corozal', isoCode: 'BZ-CZL' },
          { code: 'ca.bz.ow', name: 'Orange Walk', isoCode: 'BZ-OW' },
          { code: 'ca.bz.sc', name: 'Stann Creek', isoCode: 'BZ-SC' },
          { code: 'ca.bz.tol', name: 'Toledo', isoCode: 'BZ-TOL' },
        ],
      },
    ],
  },
  {
    code: 'na',
    name: 'North America',
    names: { es: 'América del Norte', en: 'North America' },
    countries: [
      {
        // Mexico is an expansion market, modelled where it actually belongs.
        // It is addressable from day one and closed to activity until opened.
        code: 'na.mx',
        name: 'México',
        names: { es: 'México', en: 'Mexico' },
        isoCode: 'MX',
        phonePrefix: '+52',
        currencyCode: 'MXN',
        timezone: 'America/Mexico_City',
        supported: false,
        states: [
          {
            code: 'na.mx.cmx',
            name: 'Ciudad de México',
            isoCode: 'MX-CMX',
            cities: [{ code: 'na.mx.cmx.ciudad-de-mexico', name: 'Ciudad de México', lat: 19.4326, lon: -99.1332 }],
          },
          { code: 'na.mx.jal', name: 'Jalisco', isoCode: 'MX-JAL', cities: [{ code: 'na.mx.jal.guadalajara', name: 'Guadalajara', lat: 20.6597, lon: -103.3496 }] },
          { code: 'na.mx.nle', name: 'Nuevo León', isoCode: 'MX-NLE', cities: [{ code: 'na.mx.nle.monterrey', name: 'Monterrey', lat: 25.6866, lon: -100.3161 }] },
          { code: 'na.mx.chp', name: 'Chiapas', isoCode: 'MX-CHP' },
          { code: 'na.mx.roo', name: 'Quintana Roo', isoCode: 'MX-ROO' },
          { code: 'na.mx.yuc', name: 'Yucatán', isoCode: 'MX-YUC' },
          { code: 'na.mx.tab', name: 'Tabasco', isoCode: 'MX-TAB' },
          { code: 'na.mx.oax', name: 'Oaxaca', isoCode: 'MX-OAX' },
          { code: 'na.mx.ver', name: 'Veracruz', isoCode: 'MX-VER' },
          { code: 'na.mx.pue', name: 'Puebla', isoCode: 'MX-PUE' },
          { code: 'na.mx.mex', name: 'Estado de México', isoCode: 'MX-MEX' },
          { code: 'na.mx.gua', name: 'Guanajuato', isoCode: 'MX-GUA' },
          { code: 'na.mx.bcn', name: 'Baja California', isoCode: 'MX-BCN' },
          { code: 'na.mx.bcs', name: 'Baja California Sur', isoCode: 'MX-BCS' },
          { code: 'na.mx.son', name: 'Sonora', isoCode: 'MX-SON' },
          { code: 'na.mx.sin', name: 'Sinaloa', isoCode: 'MX-SIN' },
          { code: 'na.mx.chh', name: 'Chihuahua', isoCode: 'MX-CHH' },
          { code: 'na.mx.coa', name: 'Coahuila', isoCode: 'MX-COA' },
          { code: 'na.mx.dur', name: 'Durango', isoCode: 'MX-DUR' },
          { code: 'na.mx.zac', name: 'Zacatecas', isoCode: 'MX-ZAC' },
          { code: 'na.mx.slp', name: 'San Luis Potosí', isoCode: 'MX-SLP' },
          { code: 'na.mx.tam', name: 'Tamaulipas', isoCode: 'MX-TAM' },
          { code: 'na.mx.nay', name: 'Nayarit', isoCode: 'MX-NAY' },
          { code: 'na.mx.col', name: 'Colima', isoCode: 'MX-COL' },
          { code: 'na.mx.mic', name: 'Michoacán', isoCode: 'MX-MIC' },
          { code: 'na.mx.agu', name: 'Aguascalientes', isoCode: 'MX-AGU' },
          { code: 'na.mx.que', name: 'Querétaro', isoCode: 'MX-QUE' },
          { code: 'na.mx.hid', name: 'Hidalgo', isoCode: 'MX-HID' },
          { code: 'na.mx.tla', name: 'Tlaxcala', isoCode: 'MX-TLA' },
          { code: 'na.mx.mor', name: 'Morelos', isoCode: 'MX-MOR' },
          { code: 'na.mx.gro', name: 'Guerrero', isoCode: 'MX-GRO' },
          { code: 'na.mx.cam', name: 'Campeche', isoCode: 'MX-CAM' },
        ],
      },
    ],
  },
];
