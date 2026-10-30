/**
 * The Identity Studio's design library: every design, what it is called in
 * both languages, and how it is made.
 *
 * Four ways a design comes to exist, each recorded in `source`:
 *   - supplied           artwork the owner provided (sources/), used as given
 *   - yavaya-photo       Yavaya's own photographs (platform/public/art), reused
 *   - procedural-shader  drawn by a shader in shaders/ (render.mjs), at 3840×2160
 *   - procedural-vector  drawn as SVG by vector.mjs
 *
 * render.mjs and vector.mjs make the masters; build.mjs measures them, writes
 * the files the site serves, the manifest (src/config/identity-assets.json)
 * and the names (src/i18n/dictionaries/identity-assets.ts). Nothing here is a
 * claim about a file: sizes, colours measured and formats all come from the
 * files themselves.
 */

// --- Helpers -------------------------------------------------------------------------

const words = (es, en) => ({ es, en });

function shaderDesign({ id, collection, style, shader, palette, params, seed, colors, tags, name, desc, focus, kind = 'background' }) {
  return {
    id,
    collection,
    kind,
    style,
    colors,
    tags,
    placement: kind,
    focus: focus ?? { x: 50, y: 50 },
    source: 'procedural-shader',
    shader,
    palette,
    params,
    seed,
    name,
    desc,
  };
}

// --- Supplied and photographed ------------------------------------------------------------

const SUPPLIED = [
  {
    id: 'surface-liquid-gold-midnight',
    collection: 'surfaces',
    kind: 'background',
    style: 'liquid',
    colors: ['gold', 'black', 'blue'],
    tags: ['oro', 'gold', 'líquido', 'liquid', 'olas', 'waves', 'mármol', 'marble', 'partículas', 'particles', 'azul noche', 'navy'],
    placement: 'background',
    focus: { x: 50, y: 50 },
    source: 'supplied',
    master: 'sources/liquid-gold-midnight.webp',
    name: words('Oro líquido de medianoche', 'Midnight liquid gold'),
    desc: words('Ondas de oro líquido y mármol sobre azul noche, con partículas de luz.', 'Waves of liquid gold and marble over midnight blue, with specks of light.'),
  },
];

/**
 * Yavaya's photographs exist at the sizes the site already serves; the largest
 * is the master. Most go to 2560, some only to 1920 — `sizes` says which.
 */
const photo = (id, file, colors, tags, focus, name, desc, sizes = [960, 1600, 2560]) => ({
  id,
  collection: 'horizons',
  kind: 'cover',
  style: 'photo',
  colors,
  tags,
  placement: 'cover',
  focus,
  source: 'yavaya-photo',
  master: `platform/public/art/${file}-${sizes.at(-1)}.webp`,
  reuse: sizes.map((width) => ({ width, url: `/art/${file}-${width}.webp` })),
  name,
  desc,
});

const PHOTOS = [
  photo('horizon-moonlit-volcano-lake', 'hero', ['blue', 'black', 'gold'], ['volcán', 'volcano', 'lago', 'lake', 'luna', 'moon', 'noche', 'night', 'palmeras', 'palms'], { x: 45, y: 50 },
    words('Volcán y lago a la luz de la luna', 'Moonlit volcano and lake'), words('Fotografía nocturna de un volcán sobre un lago, con luna llena y palmeras.', 'Night photograph of a volcano above a lake, with a full moon and palm trees.')),
  photo('horizon-market-sunset', 'market', ['orange', 'gold', 'bronze'], ['mercado', 'market', 'atardecer', 'sunset', 'calle', 'street', 'luces', 'lights'], { x: 50, y: 55 },
    words('Mercado al atardecer', 'Market at sunset'), words('Fotografía de un mercado de calle al caer el sol, con luces cálidas.', 'Photograph of a street market as the sun goes down, in warm light.')),
  photo('horizon-colonial-street-dusk', 'street', ['pink', 'blue', 'violet'], ['calle', 'street', 'colonial', 'anochecer', 'dusk', 'faroles', 'lanterns'], { x: 50, y: 50 },
    words('Calle colonial al anochecer', 'Colonial street at dusk'), words('Fotografía de una calle colonial empedrada al anochecer, entre rosa y azul.', 'Photograph of a cobbled colonial street at dusk, between pink and blue.')),
  photo('horizon-town-panorama', 'districts', ['orange', 'green', 'gold'], ['pueblo', 'town', 'colinas', 'hills', 'tejados', 'roofs', 'tarde', 'afternoon'], { x: 50, y: 50 },
    words('Panorama del pueblo', 'Town panorama'), words('Fotografía de un pueblo entre colinas verdes, con tejados al sol de la tarde.', 'Photograph of a town among green hills, roofs in the afternoon sun.')),
  photo('horizon-coffee-road-volcano', 'roadmap', ['green', 'gold', 'orange'], ['café', 'coffee', 'camino', 'road', 'volcán', 'volcano', 'campo', 'countryside'], { x: 50, y: 50 },
    words('Camino del café al volcán', 'Coffee road to the volcano'), words('Fotografía de un camino entre cafetales con un volcán al fondo.', 'Photograph of a road through coffee farms with a volcano behind.')),
  photo('horizon-lighthouse-night', 'reputation', ['blue', 'black', 'gold'], ['faro', 'lighthouse', 'mar', 'sea', 'noche', 'night', 'costa', 'coast'], { x: 50, y: 50 },
    words('Faro de noche', 'Lighthouse at night'), words('Fotografía nocturna de un faro junto al mar, con luces doradas.', 'Night photograph of a lighthouse by the sea, with golden lights.')),
  photo('horizon-crater-lake', 'impact', ['teal', 'blue', 'white'], ['laguna', 'lagoon', 'cráter', 'crater', 'turquesa', 'turquoise', 'volcán', 'volcano'], { x: 50, y: 50 },
    words('Laguna de cráter', 'Crater lake'), words('Fotografía de una laguna turquesa dentro de un cráter volcánico.', 'Photograph of a turquoise lagoon inside a volcanic crater.'), [800, 1200, 1920]),
  photo('horizon-white-chapel-mist', 'sanctuary', ['white', 'pink', 'green'], ['capilla', 'chapel', 'iglesia', 'church', 'neblina', 'mist', 'mañana', 'morning'], { x: 50, y: 50 },
    words('Capilla blanca en la neblina', 'White chapel in the mist'), words('Fotografía de una capilla blanca entre neblina y verde, a primera hora.', 'Photograph of a white chapel in mist and greenery, early in the morning.')),
];

// --- Sovereign Surfaces: backgrounds --------------------------------------------------------

const surface = (style, shader) => (id, palette, params, seed, colors, tags, name, desc) =>
  shaderDesign({ id: `surface-${id}`, collection: 'surfaces', style, shader, palette, params, seed, colors, tags, name, desc });

const liquid = surface('liquid', 'liquid');
const marble = surface('marble', 'marble');
const silk = surface('silk', 'silk');
const nebula = surface('cosmic', 'nebula');
const bokeh = surface('bokeh', 'bokeh');
const deco = surface('deco', 'deco');
const lines = surface('lines', 'lines');
const glass = surface('glass', 'glass');
const metal = surface('metal', 'metal');
const aurora = surface('aurora', 'aurora');

const LIQUID_TAGS = ['líquido', 'liquid', 'metal', 'ondas', 'waves', 'brillo', 'shine'];

const SURFACES = [
  liquid('liquid-gold-navy', ['#04060c', '#0d1c3e', '#3a2205', '#c8902a', '#fff3cf'], [[1.2, 22, 0.42, 0.9], [0.45, 1.0, 0.03, 0.9]], 1.3, ['gold', 'blue', 'black'], [...LIQUID_TAGS, 'oro', 'gold', 'azul noche', 'navy'],
    words('Oro líquido sobre azul noche', 'Liquid gold on midnight blue'), words('Cintas de oro pulido que fluyen sobre un fondo azul noche, con destellos finos.', 'Ribbons of polished gold flowing over midnight blue, with fine sparks of light.')),
  liquid('liquid-rose-plum', ['#0a0507', '#2b1220', '#4e2318', '#d69274', '#fff1ea'], [[1.0, 30, 0.5, 1.1], [-0.3, 0.8, 0.025, 2.0]], 2.7, ['pink', 'bronze', 'violet'], [...LIQUID_TAGS, 'oro rosa', 'rose gold', 'ciruela', 'plum'],
    words('Oro rosa líquido sobre ciruela', 'Liquid rose gold on plum'), words('Pliegues de oro rosa pulido sobre un fondo ciruela oscuro.', 'Folds of polished rose gold over a dark plum ground.')),
  liquid('liquid-silver-teal', ['#020507', '#0b2628', '#262e34', '#a9b4be', '#ffffff'], [[1.4, 26, 0.38, 0.8], [0.9, 0.6, 0.03, 0.4]], 4.1, ['silver', 'teal', 'black'], [...LIQUID_TAGS, 'plata', 'silver', 'petróleo', 'teal'],
    words('Plata líquida sobre verde petróleo', 'Liquid silver on deep teal'), words('Cintas de plata brillante que cruzan en diagonal un fondo verde petróleo.', 'Bright silver ribbons crossing a deep teal ground on the diagonal.')),
  liquid('liquid-gold-onyx', ['#020203', '#141414', '#3a2205', '#d6a032', '#fff6da'], [[0.9, 40, 0.55, 1.4], [1.2, 1.2, 0.02, 2.4]], 5.9, ['gold', 'black'], [...LIQUID_TAGS, 'oro', 'gold', 'ónix', 'onyx', 'negro', 'black'],
    words('Oro líquido sobre ónix', 'Liquid gold on onyx'), words('Oro fundido en vetas apretadas sobre negro profundo.', 'Molten gold in close-set veins over deep black.')),
  liquid('liquid-champagne-espresso', ['#0d0805', '#2a1b12', '#4a3618', '#e3c88f', '#fffaf0'], [[1.1, 18, 0.48, 1.2], [-0.8, 0.7, 0.035, 1.2]], 7.3, ['gold', 'bronze', 'black'], [...LIQUID_TAGS, 'champán', 'champagne', 'café', 'espresso'],
    words('Champán líquido sobre café', 'Liquid champagne on espresso'), words('Ondas anchas de color champán sobre un fondo café oscuro.', 'Broad champagne waves over a dark espresso ground.')),
  liquid('liquid-copper-forest', ['#020806', '#0c2a20', '#3b1a0c', '#c9774a', '#ffe2cc'], [[1.3, 24, 0.4, 1.0], [0.2, 0.9, 0.03, 0.6]], 8.8, ['bronze', 'green', 'orange'], [...LIQUID_TAGS, 'cobre', 'copper', 'bosque', 'forest', 'verde', 'green'],
    words('Cobre líquido sobre bosque', 'Liquid copper on forest green'), words('Cobre pulido en cintas que fluyen sobre verde bosque.', 'Polished copper in flowing ribbons over forest green.')),
  liquid('liquid-platinum-ink', ['#030409', '#0e1330', '#2c3040', '#c9cfdc', '#ffffff'], [[0.8, 34, 0.5, 1.6], [1.4, 1.0, 0.022, 2.8]], 9.6, ['silver', 'blue', 'black'], [...LIQUID_TAGS, 'platino', 'platinum', 'tinta', 'ink'],
    words('Platino líquido sobre tinta', 'Liquid platinum on ink'), words('Platino brillante en curvas cerradas sobre azul tinta.', 'Bright platinum in tight curves over ink blue.')),

  marble('marble-carrara', ['#d9d6d0', '#f6f4ef', '#b9b6b2', '#7f7c7a', '#ffffff'], [[1.2, 3.2, 0.55, 28], [0.55, 0.6, 0.0, 0.35]], 1.7, ['white', 'silver'], ['mármol', 'marble', 'blanco', 'white', 'piedra', 'stone', 'vetas', 'veins'],
    words('Mármol blanco de vetas grises', 'White marble with grey veins'), words('Piedra blanca y lisa cruzada por vetas grises suaves.', 'Smooth white stone crossed by soft grey veins.')),
  marble('marble-gold-white', ['#e4ddd0', '#faf6ee', '#d8c39a', '#b8892e', '#ffe7a8'], [[1.0, 2.6, 0.6, 36], [-0.4, 0.5, 0.8, 0.3]], 2.9, ['white', 'gold'], ['mármol', 'marble', 'blanco', 'white', 'oro', 'gold', 'vetas', 'veins'],
    words('Mármol blanco con vetas de oro', 'White marble with gold veins'), words('Mármol blanco con vetas de oro que brillan a lo largo.', 'White marble with gold veins that shine along their length.')),
  marble('marble-nero-gold', ['#050506', '#1a1a1d', '#3d3424', '#c9a050', '#ffe7a8'], [[1.1, 2.8, 0.7, 40], [0.7, 0.7, 0.9, 0.5]], 3.3, ['black', 'gold'], ['mármol', 'marble', 'negro', 'black', 'oro', 'gold', 'vetas', 'veins'],
    words('Mármol negro con vetas de oro', 'Black marble with gold veins'), words('Mármol negro profundo atravesado por vetas de oro.', 'Deep black marble threaded with veins of gold.')),
  marble('marble-verde', ['#0a2a20', '#1d4a3a', '#5f8a76', '#cfe3d8', '#ffffff'], [[1.4, 3.6, 0.65, 22], [1.1, 0.8, 0.2, 0.6]], 4.4, ['green', 'white'], ['mármol', 'marble', 'verde', 'green', 'piedra', 'stone'],
    words('Mármol verde de vetas claras', 'Green marble with pale veins'), words('Piedra verde intensa con vetas claras que se ramifican.', 'Deep green stone with pale, branching veins.')),
  marble('marble-rosa', ['#e2c3bd', '#f7e6e1', '#d6a99a', '#b07a3e', '#ffd9a8'], [[1.1, 3.0, 0.55, 30], [-1.0, 0.6, 0.7, 0.4]], 5.2, ['pink', 'gold'], ['mármol', 'marble', 'rosa', 'pink', 'oro', 'gold'],
    words('Mármol rosa con vetas de oro', 'Pink marble with gold veins'), words('Mármol rosa pálido con vetas finas de oro.', 'Pale pink marble with fine gold veins.')),
  marble('marble-lapis', ['#071447', '#14307a', '#3a5bb0', '#d8b25a', '#fff0b8'], [[1.3, 3.4, 0.75, 34], [0.3, 0.9, 1.0, 0.7]], 6.1, ['blue', 'gold'], ['lapislázuli', 'lapis', 'azul', 'blue', 'oro', 'gold', 'piedra', 'stone'],
    words('Lapislázuli con vetas de oro', 'Lapis blue with gold veins'), words('Piedra azul intensa con vetas y motas de oro.', 'Deep blue stone with veins and flecks of gold.')),

  silk('silk-champagne', ['#3a2a14', '#c9a974', '#f3dfb6', '#fff7e6'], [[1.0, 24, 0.04, 0.7], [0.5, 0.9, 0.45, 1.0]], 1.1, ['gold', 'white'], ['seda', 'silk', 'satén', 'satin', 'champán', 'champagne', 'tela', 'fabric'],
    words('Seda champán', 'Champagne silk'), words('Satén color champán en pliegues amplios y suaves.', 'Champagne satin in broad, soft folds.')),
  silk('silk-midnight', ['#02040c', '#0e1d4a', '#3c5aa8', '#a9c0ff'], [[1.1, 28, 0.04, 0.8], [-0.4, 1.4, 0.5, 1.0]], 2.2, ['blue', 'black'], ['seda', 'silk', 'satén', 'satin', 'azul noche', 'midnight'],
    words('Seda azul noche', 'Midnight silk'), words('Satén azul noche con brillos fríos en cada pliegue.', 'Midnight satin with cool highlights along each fold.')),
  silk('silk-emerald', ['#01100a', '#0b4a33', '#2f9a72', '#bff2dc'], [[1.0, 22, 0.045, 0.9], [1.0, 0.6, 0.45, 1.0]], 3.4, ['green', 'teal'], ['seda', 'silk', 'esmeralda', 'emerald', 'verde', 'green'],
    words('Seda esmeralda', 'Emerald silk'), words('Satén esmeralda de pliegues profundos y brillo intenso.', 'Emerald satin with deep folds and a rich sheen.')),
  silk('silk-burgundy', ['#120206', '#5a0f22', '#b0405a', '#ffc2cf'], [[1.2, 26, 0.04, 0.6], [-1.1, 1.0, 0.55, 1.0]], 4.6, ['red', 'violet'], ['seda', 'silk', 'vino', 'burgundy', 'rojo', 'red'],
    words('Seda vino', 'Burgundy silk'), words('Satén color vino tinto con reflejos rosados.', 'Wine-red satin with rosy reflections.')),
  silk('silk-blush', ['#6a3e3a', '#e8b8ad', '#fbe0d8', '#fff6f2'], [[0.9, 20, 0.035, 0.8], [0.2, 2.2, 0.35, 0.9]], 5.8, ['pink', 'white'], ['seda', 'silk', 'rosa', 'blush', 'pastel'],
    words('Seda rosada', 'Blush silk'), words('Satén rosa pálido, suave y luminoso.', 'Pale pink satin, soft and luminous.')),
  silk('silk-pearl', ['#5c5a58', '#d9d6d0', '#f5f3ef', '#ffffff'], [[1.0, 24, 0.035, 0.9], [-0.6, 1.8, 0.45, 0.9]], 6.9, ['white', 'silver'], ['seda', 'silk', 'perla', 'pearl', 'blanco', 'white'],
    words('Seda perla', 'Pearl silk'), words('Satén blanco perla con reflejos plateados.', 'Pearl-white satin with silvery reflections.')),

  nebula('nebula-violet', ['#03020a', '#0b0a24', '#6b3fd1', '#1fb3b0', '#f2ecff'], [[1.2, 1.0, 0.6, 1.0], [0.25, 0.05, 0.25, 0.8]], 1.9, ['violet', 'teal', 'black'], ['nebulosa', 'nebula', 'estrellas', 'stars', 'cosmos', 'space', 'galaxia', 'galaxy'],
    words('Nebulosa violeta', 'Violet nebula'), words('Nubes de gas violeta y turquesa entre miles de estrellas.', 'Clouds of violet and turquoise gas among thousands of stars.')),
  nebula('nebula-magenta', ['#05020a', '#100821', '#c2347a', '#2f5fd6', '#fff0f6'], [[1.0, 1.1, 0.7, 1.1], [-0.3, -0.05, 0.3, 0.9]], 2.8, ['pink', 'blue', 'black'], ['nebulosa', 'nebula', 'estrellas', 'stars', 'magenta', 'cosmos'],
    words('Nebulosa magenta y azul', 'Magenta and blue nebula'), words('Gas magenta y azul profundo, cruzado por polvo oscuro.', 'Magenta and deep blue gas, crossed by dark dust.')),
  nebula('nebula-gold', ['#04030a', '#0d0b26', '#d39a3a', '#4a3fa8', '#fff4dc'], [[1.3, 0.9, 0.55, 0.9], [0.1, 0.08, 0.22, 1.0]], 3.7, ['gold', 'violet', 'black'], ['nebulosa', 'nebula', 'oro', 'gold', 'estrellas', 'stars'],
    words('Nebulosa dorada', 'Golden nebula'), words('Una nube de luz dorada sobre el añil del espacio profundo.', 'A cloud of golden light over the indigo of deep space.')),
  nebula('nebula-emerald', ['#010605', '#04161a', '#1fa37a', '#2a9bd6', '#e6fff6'], [[1.1, 1.0, 0.6, 1.0], [-0.2, 0.0, 0.3, 0.7]], 4.9, ['green', 'teal', 'black'], ['nebulosa', 'nebula', 'esmeralda', 'emerald', 'estrellas', 'stars'],
    words('Nebulosa esmeralda', 'Emerald nebula'), words('Verde esmeralda y azul cielo en un campo de estrellas.', 'Emerald green and sky blue across a field of stars.')),
  nebula('nebula-rose', ['#060206', '#1a0a14', '#e06a8a', '#e8a04a', '#fff3ea'], [[1.2, 1.0, 0.5, 0.8], [0.3, -0.08, 0.26, 0.9]], 5.5, ['pink', 'orange', 'black'], ['nebulosa', 'nebula', 'rosa', 'rose', 'ámbar', 'amber'],
    words('Nebulosa rosa y ámbar', 'Rose and amber nebula'), words('Nubes rosadas y ámbar que brillan en la oscuridad.', 'Rose and amber clouds glowing in the dark.')),

  bokeh('bokeh-gold', ['#070503', '#2a1c08', '#e2a93e', '#f4cf7a', '#ffefc4'], [[0.09, 0.55, 0.3, 0.9], [-0.35, 0.1, 0.8, 1.0]], 1.4, ['gold', 'black'], ['luces', 'lights', 'bokeh', 'oro', 'gold', 'fiesta', 'celebration'],
    words('Luces doradas', 'Golden lights'), words('Luces doradas desenfocadas sobre un fondo cálido y oscuro.', 'Golden lights out of focus over a warm dark ground.')),
  bokeh('bokeh-city', ['#02040b', '#0b1838', '#4b7cff', '#2fd0ff', '#ffb35a'], [[0.08, 0.6, 0.4, 0.9], [0.3, -0.1, -0.7, 1.0]], 2.6, ['blue', 'teal', 'black'], ['luces', 'lights', 'ciudad', 'city', 'noche', 'night', 'bokeh'],
    words('Luces de ciudad', 'City lights'), words('Luces azules y ámbar de una ciudad de noche, desenfocadas.', 'Blue and amber city lights at night, out of focus.')),
  bokeh('bokeh-rose', ['#0a0408', '#2c0f22', '#ff7aa8', '#f0a3c8', '#ffd6e6'], [[0.1, 0.5, 0.25, 0.9], [-0.2, 0.15, 0.6, 0.95]], 3.9, ['pink', 'violet'], ['luces', 'lights', 'rosa', 'pink', 'bokeh'],
    words('Luces rosadas', 'Rose lights'), words('Círculos de luz rosada que flotan sobre un fondo oscuro.', 'Circles of rose light floating over a dark ground.')),
  bokeh('bokeh-emerald', ['#010604', '#062418', '#3fd69a', '#a6e86a', '#e8ffd6'], [[0.085, 0.55, 0.35, 0.9], [0.25, 0.0, -0.6, 0.95]], 4.3, ['green', 'teal'], ['luces', 'lights', 'verde', 'green', 'bokeh', 'jardín', 'garden'],
    words('Luces esmeralda', 'Emerald lights'), words('Luces verdes desenfocadas, como un jardín de noche.', 'Green lights out of focus, like a garden at night.')),
  bokeh('bokeh-champagne', ['#120d08', '#3a2c1c', '#f3dcae', '#ffffff', '#e8c38a'], [[0.11, 0.45, 0.3, 0.8], [0.0, 0.2, 0.4, 0.9]], 5.1, ['gold', 'white'], ['luces', 'lights', 'champán', 'champagne', 'bokeh'],
    words('Luces de champán', 'Champagne lights'), words('Destellos color champán, suaves y elegantes.', 'Soft, elegant glimmers in champagne.')),

  deco('deco-fans-gold', ['#04081a', '#0c1838', '#5e4210', '#c99a3a', '#ffe9b0'], [[0.11, 2.4, 4, 1], [0, 0.9, 1.0, 0]], 1.2, ['gold', 'blue'], ['art déco', 'art deco', 'abanicos', 'fans', 'oro', 'gold', 'geometría', 'geometry'],
    words('Abanicos art déco en oro', 'Art deco fans in gold'), words('Abanicos de líneas doradas, fila tras fila, sobre azul noche.', 'Fans of fine gold line, row after row, on midnight blue.')),
  deco('deco-sunburst', ['#030303', '#141210', '#5a3f12', '#d0a443', '#fff0bf'], [[0.6, 1.6, 2, 1], [1, 1.2, 0.2, 0]], 2.4, ['gold', 'black'], ['art déco', 'art deco', 'sol', 'sunburst', 'rayos', 'rays', 'oro', 'gold'],
    words('Sol art déco', 'Art deco sunburst'), words('Rayos y anillos de oro que nacen del borde, sobre negro.', 'Rays and rings of gold rising from the edge, on black.')),
  deco('deco-chevron-rose', ['#10060c', '#2a1020', '#5e2c22', '#d99a7c', '#ffe6da'], [[0.16, 2.0, 5, 1], [2, 0.4, 0.8, 0]], 3.6, ['pink', 'violet'], ['art déco', 'art deco', 'chevrón', 'chevron', 'oro rosa', 'rose gold'],
    words('Chevrones en oro rosa', 'Rose gold chevrons'), words('Chevrones de líneas paralelas en oro rosa sobre ciruela.', 'Chevrons of parallel lines in rose gold on plum.')),
  deco('deco-lattice-silver', ['#02100c', '#0a2a22', '#3d4a50', '#bcc6cf', '#ffffff'], [[0.14, 1.8, 3, 1], [3, 2.0, 0.8, 0]], 4.8, ['silver', 'green'], ['art déco', 'art deco', 'celosía', 'lattice', 'rombos', 'diamonds', 'plata', 'silver'],
    words('Celosía de plata', 'Silver lattice'), words('Una celosía de rombos en plata sobre verde profundo.', 'A lattice of diamonds in silver on deep green.')),
  deco('deco-arches', ['#060a1c', '#101a3a', '#5a4a2a', '#e3cc94', '#fffbe8'], [[0.15, 2.0, 3, 1], [4, 0.7, 0.9, 0]], 5.7, ['gold', 'blue'], ['art déco', 'art deco', 'arcos', 'arches', 'champán', 'champagne'],
    words('Arcos art déco', 'Art deco arches'), words('Arcos anidados en champán, como ventanas de un gran salón.', 'Nested arches in champagne, like the windows of a grand hall.')),
  deco('deco-fans-ivory', ['#efe6d3', '#fbf6ea', '#8a6a24', '#b8892e', '#e8c470'], [[0.12, 2.2, 4, 0.5], [0, 0.9, 0.2, 0]], 6.6, ['white', 'gold'], ['art déco', 'art deco', 'abanicos', 'fans', 'marfil', 'ivory', 'oro', 'gold'],
    words('Abanicos sobre marfil', 'Fans on ivory'), words('Abanicos de oro fino sobre papel marfil.', 'Fans of fine gold on ivory paper.')),

  lines('lines-gold-navy', ['#03081a', '#0c1a40', '#6a4a12', '#c9993c', '#fff0c4'], [[1.2, 18, 1.6, 1.4], [1.0, 0, 0.6, 0.8]], 1.6, ['gold', 'blue'], ['líneas', 'lines', 'ondas', 'waves', 'oro', 'gold', 'contornos', 'contours'],
    words('Líneas de oro sobre azul', 'Gold lines on blue'), words('Hilos de oro que dibujan curvas de nivel sobre azul noche.', 'Gold threads drawing contour lines on midnight blue.')),
  lines('lines-silver-onyx', ['#030303', '#121315', '#4a4f55', '#c3c9d0', '#ffffff'], [[1.0, 24, 1.3, 1.6], [1.0, 0, 0.5, 2.0]], 2.5, ['silver', 'black'], ['líneas', 'lines', 'ondas', 'waves', 'plata', 'silver', 'negro', 'black'],
    words('Líneas de plata sobre ónix', 'Silver lines on onyx'), words('Líneas finas de plata en ondas cerradas sobre negro.', 'Fine silver lines in close waves on black.')),
  lines('lines-copper-forest', ['#020a07', '#0b2c21', '#5a2a12', '#c97c4e', '#ffe0c8'], [[1.3, 16, 1.8, 1.2], [1.0, 0, 0.7, 0.4]], 3.2, ['bronze', 'green'], ['líneas', 'lines', 'cobre', 'copper', 'bosque', 'forest'],
    words('Líneas de cobre sobre bosque', 'Copper lines on forest'), words('Curvas de cobre que se abren y se cierran sobre verde bosque.', 'Copper curves opening and closing on forest green.')),
  lines('lines-rose-plum', ['#0e0410', '#2a0f2c', '#6a2e3a', '#e4a0a0', '#fff0ee'], [[1.1, 20, 1.5, 1.5], [1.0, 0, 0.6, 1.4]], 4.0, ['pink', 'violet'], ['líneas', 'lines', 'rosa', 'rose', 'ciruela', 'plum'],
    words('Líneas rosadas sobre ciruela', 'Rose lines on plum'), words('Líneas rosadas que fluyen como agua sobre ciruela.', 'Rose lines flowing like water over plum.')),
  lines('lines-gold-ivory', ['#f1e9d8', '#fbf7ee', '#8a6a24', '#b8892e', '#d9b45e'], [[1.2, 16, 1.4, 1.3], [0.6, 0, 0.6, 0.8]], 5.4, ['white', 'gold'], ['líneas', 'lines', 'marfil', 'ivory', 'oro', 'gold'],
    words('Líneas de oro sobre marfil', 'Gold lines on ivory'), words('Curvas de nivel en oro fino sobre papel marfil.', 'Contour lines in fine gold on ivory paper.')),

  glass('glass-aurora', ['#06101c', '#1fb3a0', '#3f6fe0', '#8a4fd0', '#1a8f6a'], [[0.42, 1.0, 1.0, 1.0], [5, 0.8, 1.0, 0.25]], 1.8, ['teal', 'blue', 'violet'], ['cristal', 'glass', 'degradado', 'gradient', 'aurora', 'moderno', 'modern'],
    words('Cristal aurora', 'Aurora glass'), words('Turquesa, azul y violeta que se funden tras un cristal esmerilado.', 'Turquoise, blue and violet melting together behind frosted glass.')),
  glass('glass-sunset', ['#1a0a12', '#ff8a5c', '#e04a7a', '#ffc46a', '#7a3a9a'], [[0.45, 1.0, 1.0, 1.0], [5, 2.2, 1.0, 0.2]], 2.3, ['orange', 'pink', 'violet'], ['cristal', 'glass', 'degradado', 'gradient', 'atardecer', 'sunset'],
    words('Cristal atardecer', 'Sunset glass'), words('Naranja, rosa y violeta de un atardecer tras el cristal.', 'The orange, pink and violet of a sunset behind glass.')),
  glass('glass-ocean', ['#02101a', '#0c6a8a', '#1fb0c8', '#0a3a7a', '#6ad0c0'], [[0.4, 1.0, 1.0, 1.0], [5, 0.4, 1.0, 0.3]], 3.1, ['blue', 'teal'], ['cristal', 'glass', 'degradado', 'gradient', 'océano', 'ocean', 'mar', 'sea'],
    words('Cristal océano', 'Ocean glass'), words('Azules y turquesas del mar, suaves como el vidrio.', 'The blues and turquoises of the sea, soft as glass.')),
  glass('glass-orchid', ['#140818', '#c25ab8', '#7a4ae0', '#f08ac0', '#3a2a8a'], [[0.44, 1.0, 1.0, 1.0], [5, 1.4, 1.0, 0.22]], 4.7, ['violet', 'pink'], ['cristal', 'glass', 'degradado', 'gradient', 'orquídea', 'orchid'],
    words('Cristal orquídea', 'Orchid glass'), words('Violetas y rosas de orquídea tras un cristal esmerilado.', 'Orchid violets and pinks behind frosted glass.')),

  metal('metal-brushed-gold', ['#3a2606', '#a8782a', '#f2cf7a', '#fff6dc'], [[1.0, 0.25, 0.35, 0.6], [0, 0.6, 0, 0]], 1.5, ['gold'], ['metal', 'oro', 'gold', 'cepillado', 'brushed', 'placa', 'plate'],
    words('Oro cepillado', 'Brushed gold'), words('Una placa de oro cepillado bajo una luz amplia y suave.', 'A plate of brushed gold under a broad, soft light.')),
  metal('metal-spun-silver', ['#2a2e33', '#8d959e', '#e3e8ee', '#ffffff'], [[1.0, 0.3, 0.4, 0.4], [1, 0.9, -0.55, 0.2]], 2.7, ['silver'], ['metal', 'plata', 'silver', 'torneado', 'spun', 'círculos', 'circles'],
    words('Plata torneada', 'Spun silver'), words('Plata pulida en círculos finos, con el brillo de una joya.', 'Silver polished in fine circles, with the sheen of a jewel.')),
  metal('metal-brushed-rose', ['#3a1a12', '#b0705a', '#f2bfa6', '#fff0e8'], [[1.0, 0.25, 0.32, 0.7], [0, -0.5, 0, 0]], 3.8, ['pink', 'bronze'], ['metal', 'oro rosa', 'rose gold', 'cepillado', 'brushed'],
    words('Oro rosa cepillado', 'Brushed rose gold'), words('Oro rosa cepillado con un brillo cálido que lo cruza.', 'Brushed rose gold with a warm sheen across it.')),

  aurora('aurora-green', ['#02040e', '#0a1a33', '#2fe0a0', '#9a5ae8', '#e8f0ff', '#010205'], [[2, 0.15, 1.0, 38], [0.24, 1.0, 1.0, 1.0]], 1.9, ['green', 'violet', 'black'], ['aurora', 'cielo', 'sky', 'noche', 'night', 'estrellas', 'stars'],
    words('Aurora verde y violeta', 'Green and violet aurora'), words('Cortinas de luz verde y violeta sobre colinas oscuras y estrellas.', 'Curtains of green and violet light over dark hills and stars.')),
  aurora('aurora-teal', ['#03030e', '#120a2a', '#2ad0d6', '#e04ab0', '#f6eeff', '#020107'], [[3, 0.12, 0.9, 52], [0.22, 0.8, 1.2, -0.8]], 3.3, ['teal', 'pink', 'black'], ['aurora', 'cielo', 'sky', 'noche', 'night', 'magenta', 'turquesa', 'turquoise'],
    words('Aurora turquesa y magenta', 'Teal and magenta aurora'), words('Una aurora turquesa con orillas magenta en un cielo estrellado.', 'A turquoise aurora with magenta edges in a starry sky.')),
];

// --- Professional Signature: quiet backgrounds -----------------------------------------------

const pro = (style, shader) => (id, palette, params, seed, colors, tags, name, desc) =>
  shaderDesign({ id: `pro-${id}`, collection: 'professional', style, shader, palette, params, seed, colors, tags, name, desc });

const linen = pro('linen', 'linen');
const grid = pro('grid', 'grid');
const stripe = pro('pinstripe', 'pinstripe');
const topo = pro('topographic', 'lines');
const paper = pro('paper', 'paper');
const gradient = pro('gradient', 'glass');

const PRO_TAGS = ['profesional', 'professional', 'sobrio', 'sober'];

const PROFESSIONAL = [
  linen('linen-ivory', ['#cfc4ae', '#f2ebdc', '#fffaf0'], [[320, 0.35, 0.6, 0.8]], 1.1, ['white'], [...PRO_TAGS, 'lino', 'linen', 'tela', 'fabric', 'marfil', 'ivory'], words('Lino marfil', 'Ivory linen'), words('Tela de lino color marfil, vista de cerca.', 'Ivory linen cloth, seen close up.')),
  linen('linen-sand', ['#b39a74', '#dccaa6', '#f3e6cc'], [[300, 0.4, 0.7, 0.6]], 2.2, ['bronze', 'white'], [...PRO_TAGS, 'lino', 'linen', 'arena', 'sand'], words('Lino arena', 'Sand linen'), words('Lino color arena con su trama natural.', 'Sand-coloured linen with its natural weave.')),
  linen('linen-slate', ['#3c434b', '#6a737d', '#8f99a3'], [[340, 0.4, 0.6, 0.9]], 3.3, ['silver'], [...PRO_TAGS, 'lino', 'linen', 'pizarra', 'slate', 'gris', 'grey'], words('Lino pizarra', 'Slate linen'), words('Lino gris pizarra, sobrio y cálido.', 'Slate-grey linen, sober and warm.')),
  linen('linen-navy', ['#0a1328', '#1a2a4d', '#2c4170'], [[320, 0.45, 0.6, 0.7]], 4.4, ['blue'], [...PRO_TAGS, 'lino', 'linen', 'azul marino', 'navy'], words('Lino azul marino', 'Navy linen'), words('Lino azul marino con una trama fina.', 'Navy linen with a fine weave.')),
  linen('linen-charcoal', ['#141516', '#2c2e31', '#44474b'], [[360, 0.45, 0.5, 1.0]], 5.5, ['black'], [...PRO_TAGS, 'lino', 'linen', 'carbón', 'charcoal'], words('Lino carbón', 'Charcoal linen'), words('Lino color carbón, elegante y discreto.', 'Charcoal linen, elegant and discreet.')),

  grid('grid-blueprint', ['#0a2350', '#123372', '#2e5aa8', '#5d86d6'], [[24, 5, 1.2, 1], [0, -0.3, 0.2, 0]], 1.3, ['blue'], [...PRO_TAGS, 'cuadrícula', 'grid', 'plano', 'blueprint', 'ingeniería', 'engineering'], words('Cuadrícula de plano', 'Blueprint grid'), words('La cuadrícula fina de un plano, sobre azul.', 'The fine grid of a blueprint, on blue.')),
  grid('grid-graphite', ['#16181b', '#22262a', '#33383e', '#4c535b'], [[28, 4, 1.0, 1], [0, 0.3, 0.2, 0]], 2.4, ['black', 'silver'], [...PRO_TAGS, 'cuadrícula', 'grid', 'grafito', 'graphite'], words('Cuadrícula grafito', 'Graphite grid'), words('Cuadrícula discreta sobre gris grafito.', 'A discreet grid on graphite grey.')),
  grid('grid-ivory', ['#f3ecdc', '#fbf7ee', '#e3d6b8', '#cdb57e'], [[26, 5, 1.0, 1], [0, 0.0, 0.0, 0]], 3.5, ['white', 'gold'], [...PRO_TAGS, 'cuadrícula', 'grid', 'marfil', 'ivory', 'cuaderno', 'notebook'], words('Cuadrícula sobre marfil', 'Grid on ivory'), words('Cuadrícula de cuaderno fino sobre marfil.', 'A fine notebook grid on ivory.')),
  grid('grid-sage', ['#d4dfd0', '#e8f0e4', '#bccdb6', '#93ad8b'], [[22, 4, 1.1, 1], [0, -0.2, -0.1, 0]], 4.6, ['green', 'white'], [...PRO_TAGS, 'cuadrícula', 'grid', 'salvia', 'sage'], words('Cuadrícula salvia', 'Sage grid'), words('Cuadrícula suave sobre verde salvia.', 'A soft grid on sage green.')),
  grid('grid-dots', ['#1d232b', '#2a323c', '#505b68', '#7a8796'], [[30, 5, 1.6, 0], [0, 0.2, 0.2, 1]], 5.7, ['silver', 'black'], [...PRO_TAGS, 'puntos', 'dots', 'cuadrícula', 'grid', 'pizarra', 'slate'], words('Puntos de dibujo', 'Drafting dots'), words('Una malla de puntos para dibujar, sobre pizarra.', 'A drafting mesh of dots, on slate.')),

  stripe('pinstripe-charcoal', ['#1a1b1d', '#25272a', '#8e9196', '#6c6f74'], [[46, 1.6, 1.0, 0], [0, 1.0]], 1.4, ['black', 'silver'], [...PRO_TAGS, 'raya diplomática', 'pinstripe', 'traje', 'suit', 'carbón', 'charcoal'], words('Raya diplomática carbón', 'Charcoal pinstripe'), words('Tela de traje carbón con raya fina clara.', 'Charcoal suit cloth with a fine pale stripe.')),
  stripe('pinstripe-navy', ['#0b1630', '#14214a', '#8fa3c9', '#5f74a0'], [[40, 1.6, 1.0, 0], [0, 1.0]], 2.5, ['blue'], [...PRO_TAGS, 'raya diplomática', 'pinstripe', 'traje', 'suit', 'azul marino', 'navy'], words('Raya diplomática marino', 'Navy pinstripe'), words('Tela azul marino con raya diplomática.', 'Navy cloth with a pinstripe.')),
  stripe('pinstripe-grey', ['#5d6167', '#6d7278', '#c9ccd1', '#a6aab0'], [[52, 1.3, 0.8, 1], [0, 0.8]], 3.6, ['silver'], [...PRO_TAGS, 'raya', 'stripe', 'gris', 'grey', 'traje', 'suit'], words('Raya fina gris', 'Grey pinstripe'), words('Gris medio con rayas finas dobles.', 'Mid grey with fine paired stripes.')),
  stripe('pinstripe-cream', ['#eee6d4', '#f7f1e3', '#2a3a5c', '#5a6a8a'], [[44, 1.2, 0.6, 0], [0, 0.7]], 4.7, ['white', 'blue'], [...PRO_TAGS, 'raya', 'stripe', 'crema', 'cream'], words('Raya fina sobre crema', 'Pinstripe on cream'), words('Crema claro con rayas azul marino muy finas.', 'Light cream with very fine navy stripes.')),
  stripe('pinstripe-black-gold', ['#070707', '#111111', '#b8913c', '#7a5f22'], [[38, 1.4, 0.8, 1], [0, 0.9]], 5.8, ['black', 'gold'], [...PRO_TAGS, 'raya', 'stripe', 'negro', 'black', 'oro', 'gold'], words('Raya de oro sobre negro', 'Gold pinstripe on black'), words('Negro profundo con rayas finas de oro.', 'Deep black with fine gold stripes.')),

  topo('topo-sand', ['#e2d4b6', '#efe4cc', '#bfa57a', '#a88a5a', '#a88a5a'], [[1.1, 14, 1.0, 1.1], [0.0, 5, 0.2, 0.0], [4]], 1.6, ['bronze', 'white'], [...PRO_TAGS, 'curvas de nivel', 'contours', 'topográfico', 'topographic', 'mapa', 'map'], words('Curvas de nivel arena', 'Sand contours'), words('Las curvas de nivel de un mapa, sobre arena.', 'The contour lines of a map, on sand.')),
  topo('topo-slate', ['#2b3138', '#353c44', '#59636e', '#6f7a86', '#6f7a86'], [[1.2, 16, 0.9, 1.3], [0.0, 5, 0.2, 0.0], [4]], 2.7, ['silver', 'black'], [...PRO_TAGS, 'curvas de nivel', 'contours', 'topográfico', 'topographic', 'pizarra', 'slate'], words('Curvas de nivel pizarra', 'Slate contours'), words('Curvas de nivel finas sobre gris pizarra.', 'Fine contour lines on slate grey.')),
  topo('topo-forest', ['#0e2a20', '#143528', '#2f5a48', '#41705c', '#41705c'], [[1.0, 13, 1.0, 1.2], [0.0, 4, 0.2, 0.0], [4]], 3.8, ['green'], [...PRO_TAGS, 'curvas de nivel', 'contours', 'topográfico', 'topographic', 'bosque', 'forest'], words('Curvas de nivel bosque', 'Forest contours'), words('Curvas de nivel sobre verde bosque.', 'Contour lines on forest green.')),
  topo('topo-navy', ['#0a1630', '#0f1e40', '#24396a', '#33508a', '#33508a'], [[1.1, 15, 1.0, 1.4], [0.0, 5, 0.2, 0.0], [4]], 4.9, ['blue'], [...PRO_TAGS, 'curvas de nivel', 'contours', 'topográfico', 'topographic', 'azul marino', 'navy'], words('Curvas de nivel marino', 'Navy contours'), words('Curvas de nivel sobre azul marino.', 'Contour lines on navy.')),
  topo('topo-stone', ['#cfcac2', '#dedad3', '#a9a39a', '#938c82', '#938c82'], [[1.2, 15, 0.9, 1.2], [0.0, 5, 0.2, 0.0], [4]], 5.1, ['silver', 'white'], [...PRO_TAGS, 'curvas de nivel', 'contours', 'topográfico', 'topographic', 'piedra', 'stone'], words('Curvas de nivel piedra', 'Stone contours'), words('Curvas de nivel sobre gris piedra claro.', 'Contour lines on light stone grey.')),

  paper('paper-cream', ['#e8dcc2', '#f6eedb', '#d9c9a6', '#fffaf0'], [[1.0, 0.6, 1.0, 0.0], [0.8, 0.6]], 1.7, ['white'], [...PRO_TAGS, 'papel', 'paper', 'crema', 'cream'], words('Papel crema', 'Cream paper'), words('Una hoja de papel crema con fibras finas.', 'A sheet of cream paper with fine fibres.')),
  paper('paper-laid', ['#e6e1d6', '#f4f1ea', '#d2cbbb', '#ffffff'], [[0.8, 0.5, 0.8, 1.0], [0.6, 0.5]], 2.8, ['white'], [...PRO_TAGS, 'papel', 'paper', 'verjurado', 'laid'], words('Papel verjurado', 'Laid paper'), words('Papel verjurado con las líneas finas del molde.', 'Laid paper with the fine lines of its mould.')),
  paper('paper-grey', ['#b9bcc0', '#d3d6da', '#a8acb1', '#eef0f2'], [[0.9, 0.6, 1.0, 0.0], [0.9, 0.5]], 3.9, ['silver'], [...PRO_TAGS, 'papel', 'paper', 'gris', 'grey'], words('Papel gris', 'Grey paper'), words('Papel gris claro, mate y suave.', 'Light grey paper, matt and soft.')),
  paper('paper-kraft', ['#8a6440', '#b48a5e', '#7a5634', '#d2ae82'], [[1.4, 0.8, 1.2, 0.0], [0.7, 0.5]], 4.1, ['bronze', 'orange'], [...PRO_TAGS, 'papel', 'paper', 'kraft', 'cartón', 'cardboard'], words('Papel kraft', 'Kraft paper'), words('Papel kraft con sus fibras visibles.', 'Kraft paper with its fibres showing.')),
  paper('paper-ivory', ['#efe5cf', '#fbf5e6', '#e2d3b0', '#ffffff'], [[0.7, 0.5, 0.8, 0.0], [1.0, 0.7]], 5.2, ['white', 'gold'], [...PRO_TAGS, 'papel', 'paper', 'marfil', 'ivory'], words('Papel marfil', 'Ivory paper'), words('Papel marfil fino bajo una luz cálida.', 'Fine ivory paper under a warm light.')),

  gradient('gradient-corporate', ['#0a1a3a', '#1f4fa0', '#123070', '#3a7ad0', '#0e2a5c'], [[0.55, 0.9, 0.5, 0.0], [4, 0.7, 0.6, 0.6]], 1.8, ['blue'], [...PRO_TAGS, 'degradado', 'gradient', 'azul', 'blue', 'corporativo', 'corporate'], words('Degradado azul corporativo', 'Corporate blue gradient'), words('Un degradado sereno de azules profundos.', 'A calm gradient of deep blues.')),
  gradient('gradient-teal', ['#062a2c', '#0f6a6a', '#0a4a50', '#1f9a90', '#0c3a40'], [[0.55, 0.9, 0.5, 0.0], [4, 2.0, 0.6, 0.6]], 2.9, ['teal'], [...PRO_TAGS, 'degradado', 'gradient', 'turquesa', 'teal'], words('Degradado turquesa', 'Teal gradient'), words('Un degradado sereno de turquesas oscuros.', 'A calm gradient of dark teals.')),
  gradient('gradient-graphite', ['#141619', '#2e3237', '#1f2226', '#43484f', '#25292d'], [[0.55, 0.9, 0.6, 0.0], [4, 0.9, 0.6, 0.6]], 3.1, ['black', 'silver'], [...PRO_TAGS, 'degradado', 'gradient', 'grafito', 'graphite'], words('Degradado grafito', 'Graphite gradient'), words('Grises grafito que se funden con suavidad.', 'Graphite greys blending softly.')),
  gradient('gradient-sand', ['#e9dcc2', '#f6ecd8', '#dcc6a0', '#fbf4e6', '#e2cfa8'], [[0.6, 0.9, 0.4, 0.0], [4, 0.6, 0.6, 0.6]], 4.2, ['white', 'bronze'], [...PRO_TAGS, 'degradado', 'gradient', 'arena', 'sand'], words('Degradado arena', 'Sand gradient'), words('Tonos arena claros, cálidos y tranquilos.', 'Light sand tones, warm and calm.')),
  gradient('gradient-plum', ['#1c0f22', '#4a2456', '#2f173a', '#6a3a78', '#3a1c48'], [[0.55, 0.9, 0.5, 0.0], [4, 1.6, 0.6, 0.6]], 5.3, ['violet'], [...PRO_TAGS, 'degradado', 'gradient', 'ciruela', 'plum'], words('Degradado ciruela', 'Plum gradient'), words('Un degradado sereno de ciruela y violeta.', 'A calm gradient of plum and violet.')),
];

// --- Infinite Horizons: illustrated covers --------------------------------------------------------

// The hours of the day, as colours: sky top, sky at the horizon, sun or moon glow, near land, far land, water.
const HOURS = {
  dawn: { palette: ['#26325e', '#f2b6a0', '#ffd6ae', '#1b1f30', '#6b6c8f', '#3a4570'], sun: [0.03, 0], clouds: 0.6, haze: 0.6, rim: 0.6, stars: 0, colors: ['pink', 'blue', 'violet'],
    words: words('al amanecer', 'at dawn'), tags: ['amanecer', 'dawn', 'alba', 'daybreak'] },
  morning: { palette: ['#3f7fcf', '#cfe3f2', '#fff1d0', '#1d3b2c', '#7c9db3', '#3b74a0'], sun: [0.22, 0], clouds: 0.5, haze: 0.55, rim: 0.3, stars: 0, colors: ['blue', 'green', 'white'],
    words: words('por la mañana', 'in the morning'), tags: ['mañana', 'morning', 'día', 'day'] },
  noon: { palette: ['#2a6fd0', '#c3e2f6', '#ffffff', '#24502a', '#89aac2', '#2876ad'], sun: [0.38, 0], clouds: 0.45, haze: 0.45, rim: 0.1, stars: 0, colors: ['blue', 'green'],
    words: words('a mediodía', 'at noon'), tags: ['mediodía', 'noon', 'sol', 'sun', 'día', 'day'] },
  golden: { palette: ['#355a98', '#ffc87a', '#ffe09a', '#33271a', '#9a7b6c', '#6a5a6e'], sun: [0.07, 0], clouds: 0.55, haze: 0.6, rim: 0.8, stars: 0, colors: ['gold', 'orange', 'blue'],
    words: words('en la hora dorada', 'at golden hour'), tags: ['hora dorada', 'golden hour', 'tarde', 'afternoon', 'oro', 'gold'] },
  sunset: { palette: ['#271f4d', '#ff8c4e', '#ffb25a', '#160d1c', '#6a3c5c', '#55304e'], sun: [0.015, 0], clouds: 0.65, haze: 0.65, rim: 0.9, stars: 0, colors: ['orange', 'violet', 'red'],
    words: words('al atardecer', 'at sunset'), tags: ['atardecer', 'sunset', 'ocaso', 'naranja', 'orange'] },
  dusk: { palette: ['#10173a', '#9c5478', '#ef9a7c', '#0b0e1b', '#363256', '#252a48'], sun: [-0.03, 0], clouds: 0.5, haze: 0.6, rim: 0.5, stars: 0.4, colors: ['violet', 'blue', 'pink'],
    words: words('al anochecer', 'at dusk'), tags: ['anochecer', 'dusk', 'crepúsculo', 'twilight'] },
  moonlit: { palette: ['#060f2c', '#26406a', '#e6eeff', '#050912', '#1d3050', '#112645'], sun: [0.28, 1], clouds: 0.35, haze: 0.5, rim: 0.35, stars: 1, colors: ['blue', 'black', 'silver'],
    words: words('bajo la luna', 'under the moon'), tags: ['luna', 'moon', 'noche', 'night', 'estrellas', 'stars'] },
  night: { palette: ['#03060f', '#111f44', '#a9bdff', '#02040a', '#0f1830', '#0a1430'], sun: [0.33, 1], clouds: 0.2, haze: 0.4, rim: 0.2, stars: 1.3, colors: ['black', 'blue'],
    words: words('de noche', 'at night'), tags: ['noche', 'night', 'estrellas', 'stars', 'luna', 'moon'] },
};

const SCENES = {
  'volcano-lake': { scene: 0, horizon: 0.42, roughness: 0.6, mist: 0.25, palms: 0, sunX: 0.35, hours: ['dawn', 'morning', 'golden', 'sunset', 'dusk', 'moonlit'],
    words: words('Volcán sobre el lago', 'Volcano over the lake'), what: words('un volcán que se refleja en un lago', 'a volcano mirrored in a lake'), tags: ['volcán', 'volcano', 'lago', 'lake', 'reflejo', 'reflection'] },
  'twin-volcanoes': { scene: 1, horizon: 0.42, roughness: 0.5, mist: 0.2, palms: 0, sunX: -0.05, hours: ['dawn', 'noon', 'golden', 'sunset', 'dusk', 'moonlit'],
    words: words('Volcanes gemelos', 'Twin volcanoes'), what: words('una isla de dos volcanes en un lago', 'an island of two volcanoes on a lake'), tags: ['volcanes', 'volcanoes', 'isla', 'island', 'lago', 'lake'] },
  'coffee-hills': { scene: 2, horizon: 0.58, roughness: 0.5, mist: 0.35, palms: 0, sunX: -0.45, hours: ['dawn', 'morning', 'noon', 'golden', 'sunset', 'dusk'],
    words: words('Colinas del café', 'Coffee hills'), what: words('colinas de cafetales en hileras, con un volcán al fondo', 'hills of coffee rows with a volcano behind'), tags: ['café', 'coffee', 'colinas', 'hills', 'campo', 'countryside'] },
  'cloud-forest': { scene: 3, horizon: 0.55, roughness: 0.8, mist: 0.65, palms: 0, sunX: 0.4, hours: ['dawn', 'morning', 'noon', 'golden', 'dusk', 'night'],
    words: words('Bosque nuboso', 'Cloud forest'), what: words('sierras cubiertas de bosque entre nubes y neblina', 'forested ridges among clouds and mist'), tags: ['bosque', 'forest', 'nubes', 'clouds', 'neblina', 'mist', 'montañas', 'mountains'] },
  'headland-coast': { scene: 4, horizon: 0.45, roughness: 0.5, mist: 0.1, palms: 1, sunX: 0.3, hours: ['dawn', 'noon', 'golden', 'sunset', 'dusk', 'moonlit'],
    words: words('Costa y promontorio', 'Headland coast'), what: words('el mar abierto junto a un promontorio con palmeras', 'the open sea beside a headland with palm trees'), tags: ['costa', 'coast', 'mar', 'sea', 'playa', 'beach', 'palmeras', 'palms'] },
  islands: { scene: 5, horizon: 0.44, roughness: 0.4, mist: 0.05, palms: 1, sunX: -0.25, hours: ['morning', 'noon', 'golden', 'sunset', 'dusk', 'moonlit'],
    words: words('Islas al horizonte', 'Islands on the horizon'), what: words('islas pequeñas en un mar tranquilo, con palmeras', 'small islands on a calm sea, with palm trees'), tags: ['islas', 'islands', 'mar', 'sea', 'caribe', 'caribbean', 'palmeras', 'palms'] },
  'crater-lake': { scene: 6, horizon: 0.43, roughness: 0.6, mist: 0.3, palms: 0, sunX: 0.5, hours: ['dawn', 'morning', 'golden', 'sunset', 'dusk', 'night'],
    words: words('Lago entre volcanes', 'Lake among volcanoes'), what: words('un lago rodeado de volcanes y montañas', 'a lake ringed by volcanoes and mountains'), tags: ['lago', 'lake', 'volcanes', 'volcanoes', 'montañas', 'mountains'] },
};

// Islands keep their turquoise water by day.
const WATER_OVERRIDE = { islands: { morning: '#1aa0b0', noon: '#1798ad', golden: '#3a8a90' } };

let horizonSeed = 1;
const HORIZONS = Object.entries(SCENES).flatMap(([sceneId, scene]) =>
  scene.hours.map((hourId) => {
    const hour = HOURS[hourId];
    const palette = [...hour.palette];
    const water = WATER_OVERRIDE[sceneId]?.[hourId];
    if (water) palette[5] = water;
    const night = hour.sun[1];
    const sunX = night ? -scene.sunX * 0.8 : scene.sunX;
    horizonSeed += 1;
    return shaderDesign({
      id: `horizon-${sceneId}-${hourId}`,
      collection: 'horizons',
      kind: 'cover',
      style: 'illustration',
      shader: 'landscape',
      palette,
      params: [
        [scene.scene, sunX, hour.sun[0], night],
        [scene.horizon, hour.haze, hour.clouds, hour.stars],
        [hour.rim, scene.roughness, scene.mist, scene.palms],
      ],
      seed: horizonSeed * 1.37,
      focus: { x: 50, y: Math.round((1 - scene.horizon) * 100) },
      colors: hour.colors,
      tags: ['ilustración', 'illustration', 'paisaje', 'landscape', ...scene.tags, ...hour.tags],
      name: words(`${scene.words.es} ${hour.words.es}`, `${scene.words.en} ${hour.words.en}`),
      desc: words(`Ilustración de ${scene.what.es} ${hour.words.es}.`, `Illustration of ${scene.what.en} ${hour.words.en}.`),
    });
  }),
);

// --- Identity Frames and Personal Expression: drawn in vector.mjs ----------------------------------

function vectorDesign({ id, collection, kind, style, family, drawing, options, colors, tags, placement, frameShape, name, desc }) {
  return {
    id,
    collection,
    kind,
    style,
    colors,
    tags,
    placement,
    focus: { x: 50, y: 50 },
    ...(frameShape ? { frameShape } : {}),
    source: 'procedural-vector',
    vector: { family, style: drawing, options },
    name,
    desc,
  };
}

const METAL_COLORS = { gold: ['gold'], silver: ['silver'], rose: ['pink', 'bronze'], bronze: ['bronze'] };
const METAL_TAGS = { gold: ['oro', 'gold'], silver: ['plata', 'silver'], rose: ['oro rosa', 'rose gold'], bronze: ['bronce', 'bronze'] };
const FRAME_TAGS = ['marco', 'frame', 'foto', 'photo', 'avatar'];

const frame = (id, drawing, style, options, colors, tags, name, desc, shape = 'circle') =>
  vectorDesign({
    id: `frame-${id}`,
    collection: 'frames',
    kind: 'frame',
    style,
    family: shape === 'circle' ? 'circle' : 'rounded',
    drawing,
    options,
    colors,
    tags: [...FRAME_TAGS, ...tags],
    placement: 'avatar-frame',
    frameShape: shape,
    name,
    desc,
  });

const FRAMES = [
  frame('ring-gold', 'ring', 'ring', { metal: 'gold', outer: 6, inner: 2, gap: 9 }, ['gold'], ['anillo', 'ring', ...METAL_TAGS.gold], words('Anillo de oro', 'Gold ring'), words('Un aro doble de oro pulido alrededor de tu foto.', 'A double band of polished gold around your photo.')),
  frame('ring-silver', 'ring', 'ring', { metal: 'silver', outer: 5, inner: 1.6, gap: 7 }, ['silver'], ['anillo', 'ring', ...METAL_TAGS.silver], words('Anillo de plata', 'Silver ring'), words('Un aro doble de plata, fino y brillante.', 'A fine, bright double band of silver.')),
  frame('ring-rose', 'ring', 'ring', { metal: 'rose', outer: 7, inner: 2.4, gap: 10 }, METAL_COLORS.rose, ['anillo', 'ring', ...METAL_TAGS.rose], words('Anillo de oro rosa', 'Rose gold ring'), words('Un aro ancho de oro rosa con un hilo exterior.', 'A broad rose gold band with an outer thread.')),
  frame('ring-bronze', 'ring', 'ring', { metal: 'bronze', outer: 8, inner: 2, gap: 6 }, ['bronze'], ['anillo', 'ring', ...METAL_TAGS.bronze], words('Anillo de bronce', 'Bronze ring'), words('Un aro grueso de bronce cálido.', 'A heavy band of warm bronze.')),
  frame('pearl-gold', 'pearl', 'pearl', { metal: 'gold', count: 40 }, ['gold', 'white'], ['perlas', 'pearls', ...METAL_TAGS.gold], words('Perlas y oro', 'Pearls and gold'), words('Una corona de perlas sobre un aro de oro.', 'A crown of pearls on a band of gold.')),
  frame('pearl-silver', 'pearl', 'pearl', { metal: 'silver', count: 36, size: 4.6 }, ['silver', 'white'], ['perlas', 'pearls', ...METAL_TAGS.silver], words('Perlas y plata', 'Pearls and silver'), words('Perlas grandes sobre un aro de plata.', 'Large pearls on a band of silver.')),
  frame('pearl-rose', 'pearl', 'pearl', { metal: 'rose', count: 44, size: 3.8 }, ['pink', 'white'], ['perlas', 'pearls', ...METAL_TAGS.rose], words('Perlas y oro rosa', 'Pearls and rose gold'), words('Perlas pequeñas y apretadas sobre oro rosa.', 'Small, close-set pearls on rose gold.')),
  frame('laurel-gold', 'laurel', 'laurel', { metal: 'gold', leaves: 13 }, ['gold'], ['laurel', 'hojas', 'leaves', 'corona', 'wreath', ...METAL_TAGS.gold], words('Laurel de oro', 'Gold laurel'), words('Dos ramas de laurel de oro que abrazan tu foto.', 'Two branches of gold laurel embracing your photo.')),
  frame('laurel-silver', 'laurel', 'laurel', { metal: 'silver', leaves: 11, gapDeg: 44 }, ['silver'], ['laurel', 'hojas', 'leaves', 'corona', 'wreath', ...METAL_TAGS.silver], words('Laurel de plata', 'Silver laurel'), words('Ramas de laurel de plata, abiertas arriba.', 'Branches of silver laurel, open at the top.')),
  frame('laurel-emerald', 'laurel', 'laurel', { metal: 'gold', leafColor: 'emerald', leaves: 14, gapDeg: 28 }, ['green', 'gold'], ['laurel', 'hojas', 'leaves', 'esmeralda', 'emerald', 'verde', 'green'], words('Laurel esmeralda', 'Emerald laurel'), words('Hojas de esmalte verde sobre un aro de oro.', 'Leaves of green enamel on a band of gold.')),
  frame('deco-gold', 'deco', 'deco', { metal: 'gold', rays: 60 }, ['gold'], ['art déco', 'art deco', 'sol', 'sun', 'rayos', 'rays', ...METAL_TAGS.gold], words('Sol art déco en oro', 'Gold art deco sun'), words('Rayos de oro alrededor de tu foto, con cuatro diamantes.', 'Gold rays around your photo, with four diamonds.')),
  frame('deco-silver', 'deco', 'deco', { metal: 'silver', rays: 72 }, ['silver'], ['art déco', 'art deco', 'sol', 'sun', 'rayos', 'rays', ...METAL_TAGS.silver], words('Sol art déco en plata', 'Silver art deco sun'), words('Rayos finos de plata con cuatro diamantes.', 'Fine silver rays with four diamonds.')),
  frame('deco-onyx', 'deco', 'deco', { metal: 'gold', rays: 48, enamel: 'onyx' }, ['black', 'gold'], ['art déco', 'art deco', 'ónix', 'onyx', 'negro', 'black', ...METAL_TAGS.gold], words('Ónix y oro art déco', 'Onyx and gold art deco'), words('Un anillo de ónix con rayos y diamantes de oro.', 'A ring of onyx with gold rays and diamonds.')),
  frame('gem-emerald', 'gem', 'gem', { metal: 'gold', stone: 'emerald', count: 6 }, ['green', 'gold'], ['gemas', 'gems', 'esmeralda', 'emerald', 'joya', 'jewel'], words('Esmeraldas en oro', 'Emeralds in gold'), words('Seis esmeraldas engastadas en un aro de oro.', 'Six emeralds set in a band of gold.')),
  frame('gem-sapphire', 'gem', 'gem', { metal: 'silver', stone: 'sapphire', count: 8, size: 6.5 }, ['blue', 'silver'], ['gemas', 'gems', 'zafiro', 'sapphire', 'joya', 'jewel'], words('Zafiros en plata', 'Sapphires in silver'), words('Ocho zafiros engastados en plata.', 'Eight sapphires set in silver.')),
  frame('gem-ruby', 'gem', 'gem', { metal: 'gold', stone: 'ruby', count: 4, size: 9 }, ['red', 'gold'], ['gemas', 'gems', 'rubí', 'ruby', 'joya', 'jewel'], words('Rubíes en oro', 'Rubies in gold'), words('Cuatro rubíes grandes en un aro de oro.', 'Four large rubies in a band of gold.')),
  frame('floral-blossom', 'floral', 'floral', { metal: 'gold', petal: 'blossom', count: 8 }, ['pink', 'green'], ['flores', 'flowers', 'floral', 'rosa', 'pink'], words('Flores rosadas', 'Pink blossoms'), words('Flores rosadas con hojas verdes alrededor de tu foto.', 'Pink blossoms with green leaves around your photo.')),
  frame('floral-ivory', 'floral', 'floral', { metal: 'silver', petal: 'ivory', count: 10 }, ['white', 'green'], ['flores', 'flowers', 'floral', 'marfil', 'ivory', 'blanco', 'white'], words('Flores de marfil', 'Ivory blossoms'), words('Flores blancas como el marfil, con hojas finas.', 'Flowers white as ivory, with fine leaves.')),
  frame('floral-gold', 'floral', 'floral', { metal: 'gold', petal: 'goldleaf', count: 6 }, ['gold', 'green'], ['flores', 'flowers', 'floral', ...METAL_TAGS.gold], words('Flores de oro', 'Golden blossoms'), words('Seis flores de oro entre hojas verdes.', 'Six golden flowers among green leaves.')),
  frame('celestial-gold', 'celestial', 'celestial', { metal: 'gold', stars: 11 }, ['gold'], ['luna', 'moon', 'estrellas', 'stars', 'cielo', 'sky', ...METAL_TAGS.gold], words('Luna y estrellas de oro', 'Gold moon and stars'), words('Una luna creciente y estrellas de oro alrededor de tu foto.', 'A crescent moon and gold stars around your photo.')),
  frame('celestial-silver', 'celestial', 'celestial', { metal: 'silver', stars: 14 }, ['silver'], ['luna', 'moon', 'estrellas', 'stars', 'cielo', 'sky', ...METAL_TAGS.silver], words('Luna y estrellas de plata', 'Silver moon and stars'), words('Luna creciente y estrellas de plata.', 'A silver crescent moon and stars.')),
  frame('rope-gold', 'rope', 'rope', { metal: 'gold', twists: 84 }, ['gold'], ['cordón', 'rope', 'trenza', 'twist', ...METAL_TAGS.gold], words('Cordón de oro', 'Gold rope'), words('Un cordón trenzado de oro.', 'A twisted rope of gold.')),
  frame('rope-silver', 'rope', 'rope', { metal: 'silver', twists: 96 }, ['silver'], ['cordón', 'rope', 'trenza', 'twist', ...METAL_TAGS.silver], words('Cordón de plata', 'Silver rope'), words('Un cordón trenzado de plata, más fino.', 'A finer twisted rope of silver.')),
  frame('geometric-gold', 'geometric', 'geometric', { metal: 'gold', sides: 12 }, ['gold'], ['geometría', 'geometry', 'facetas', 'facets', ...METAL_TAGS.gold], words('Facetas de oro', 'Gold facets'), words('Un aro de oro tallado en doce facetas.', 'A gold band cut into twelve facets.')),
  frame('geometric-silver', 'geometric', 'geometric', { metal: 'silver', sides: 16 }, ['silver'], ['geometría', 'geometry', 'facetas', 'facets', ...METAL_TAGS.silver], words('Facetas de plata', 'Silver facets'), words('Plata tallada en dieciséis facetas.', 'Silver cut into sixteen facets.')),
  frame('geometric-rose', 'geometric', 'geometric', { metal: 'rose', sides: 8 }, METAL_COLORS.rose, ['geometría', 'geometry', 'octágono', 'octagon', ...METAL_TAGS.rose], words('Octágono de oro rosa', 'Rose gold octagon'), words('Un octágono facetado de oro rosa.', 'A faceted octagon of rose gold.')),
  frame('botanical-green', 'botanical', 'botanical', { metal: 'gold', leafColor: 'leaf', leaves: 22 }, ['green', 'gold'], ['hojas', 'leaves', 'enredadera', 'vine', 'verde', 'green', 'botánico', 'botanical'], words('Enredadera verde', 'Green vine'), words('Una enredadera de hojas verdes alrededor de tu foto.', 'A vine of green leaves around your photo.')),
  frame('botanical-gold', 'botanical', 'botanical', { metal: 'gold', leafColor: 'goldleaf', leaves: 18 }, ['gold'], ['hojas', 'leaves', 'enredadera', 'vine', 'botánico', 'botanical', ...METAL_TAGS.gold], words('Enredadera de oro', 'Gold vine'), words('Hojas de oro que rodean tu foto.', 'Leaves of gold circling your photo.')),
  frame('minimal-gold', 'minimal', 'minimal', { metal: 'gold', mark: 'diamond' }, ['gold'], ['minimalista', 'minimal', 'línea', 'line', ...METAL_TAGS.gold], words('Línea fina de oro', 'Fine gold line'), words('Una sola línea de oro con un pequeño diamante.', 'A single gold line with a small diamond.')),
  frame('minimal-silver', 'minimal', 'minimal', { metal: 'silver', mark: 'dot' }, ['silver'], ['minimalista', 'minimal', 'línea', 'line', ...METAL_TAGS.silver], words('Línea fina de plata', 'Fine silver line'), words('Una sola línea de plata con un punto.', 'A single silver line with a dot.')),
  frame('scalloped-gold', 'scalloped', 'ornamental', { metal: 'gold', count: 24 }, ['gold'], ['festón', 'scallops', 'ornamental', ...METAL_TAGS.gold], words('Festón de oro', 'Gold scallops'), words('Un borde festoneado de oro.', 'A scalloped edge of gold.')),
  frame('scalloped-silver', 'scalloped', 'ornamental', { metal: 'silver', count: 30 }, ['silver'], ['festón', 'scallops', 'ornamental', ...METAL_TAGS.silver], words('Festón de plata', 'Silver scallops'), words('Un festón de plata más menudo.', 'A finer silver scallop.')),
  frame('rounded-ring-gold', 'ring', 'ring', { metal: 'gold' }, ['gold'], ['redondeado', 'rounded', 'cuadrado', 'square', ...METAL_TAGS.gold], words('Marco redondeado de oro', 'Rounded gold frame'), words('Un marco doble de oro para la foto redondeada.', 'A double gold frame for the rounded photo.'), 'rounded'),
  frame('rounded-ring-silver', 'ring', 'ring', { metal: 'silver' }, ['silver'], ['redondeado', 'rounded', 'cuadrado', 'square', ...METAL_TAGS.silver], words('Marco redondeado de plata', 'Rounded silver frame'), words('Un marco doble de plata para la foto redondeada.', 'A double silver frame for the rounded photo.'), 'rounded'),
  frame('rounded-deco-gold', 'deco', 'deco', { metal: 'gold' }, ['gold'], ['redondeado', 'rounded', 'art déco', 'art deco', ...METAL_TAGS.gold], words('Escuadras art déco en oro', 'Gold art deco brackets'), words('Escuadras escalonadas de oro en las esquinas.', 'Stepped gold brackets at the corners.'), 'rounded'),
  frame('rounded-deco-silver', 'deco', 'deco', { metal: 'silver' }, ['silver'], ['redondeado', 'rounded', 'art déco', 'art deco', ...METAL_TAGS.silver], words('Escuadras art déco en plata', 'Silver art deco brackets'), words('Escuadras escalonadas de plata en las esquinas.', 'Stepped silver brackets at the corners.'), 'rounded'),
  frame('rounded-pearl-gold', 'pearl', 'pearl', { metal: 'gold', count: 44 }, ['gold', 'white'], ['redondeado', 'rounded', 'perlas', 'pearls', ...METAL_TAGS.gold], words('Marco de perlas', 'Pearl frame'), words('Perlas alrededor de la foto redondeada.', 'Pearls around the rounded photo.'), 'rounded'),
  frame('rounded-gem-emerald', 'gem', 'gem', { metal: 'gold', stone: 'emerald' }, ['green', 'gold'], ['redondeado', 'rounded', 'esmeralda', 'emerald', 'gemas', 'gems'], words('Esmeraldas en marco redondeado', 'Emeralds, rounded frame'), words('Ocho esmeraldas en un marco de oro redondeado.', 'Eight emeralds in a rounded gold frame.'), 'rounded'),
  frame('rounded-gem-sapphire', 'gem', 'gem', { metal: 'silver', stone: 'sapphire' }, ['blue', 'silver'], ['redondeado', 'rounded', 'zafiro', 'sapphire', 'gemas', 'gems'], words('Zafiros en marco redondeado', 'Sapphires, rounded frame'), words('Ocho zafiros en un marco de plata redondeado.', 'Eight sapphires in a rounded silver frame.'), 'rounded'),
  frame('rounded-minimal-rose', 'minimal', 'minimal', { metal: 'rose' }, METAL_COLORS.rose, ['redondeado', 'rounded', 'minimalista', 'minimal', ...METAL_TAGS.rose], words('Línea fina de oro rosa', 'Fine rose gold line'), words('Una línea fina de oro rosa para la foto redondeada.', 'A fine rose gold line for the rounded photo.'), 'rounded'),
];

const ORNAMENT_TAGS = ['adorno', 'ornament', 'decoración', 'decoration'];
const ornament = (id, family, drawing, style, options, colors, tags, name, desc) =>
  vectorDesign({
    id: `decor-${id}`,
    collection: 'expression',
    kind: 'decoration',
    style,
    family,
    drawing,
    options,
    colors,
    tags: [...ORNAMENT_TAGS, ...tags],
    placement: family === 'corner' ? 'corners' : family === 'crest' ? 'header' : 'border',
    name,
    desc,
  });

const CORNER = ['esquinas', 'corners'];
const CREST = ['cresta', 'crest', 'centro', 'centre'];
const TRIM = ['borde', 'trim', 'cenefa', 'border'];

const EXPRESSION = [
  ornament('corner-deco-gold', 'corner', 'deco', 'deco', { metal: 'gold', steps: 3 }, ['gold'], [...CORNER, 'art déco', 'art deco', ...METAL_TAGS.gold], words('Escuadras art déco en oro', 'Gold art deco corners'), words('Líneas escalonadas y un abanico de oro en las esquinas de tu portada.', 'Stepped lines and a gold fan in the corners of your cover.')),
  ornament('corner-deco-silver', 'corner', 'deco', 'deco', { metal: 'silver', steps: 2 }, ['silver'], [...CORNER, 'art déco', 'art deco', ...METAL_TAGS.silver], words('Escuadras art déco en plata', 'Silver art deco corners'), words('Líneas escalonadas y un abanico de plata en las esquinas.', 'Stepped lines and a silver fan in the corners.')),
  ornament('corner-filigree-gold', 'corner', 'filigree', 'ornamental', { metal: 'gold', curls: 3 }, ['gold'], [...CORNER, 'filigrana', 'filigree', ...METAL_TAGS.gold], words('Filigrana de oro', 'Gold filigree'), words('Volutas de oro que se enroscan en las esquinas.', 'Gold scrolls curling into the corners.')),
  ornament('corner-filigree-silver', 'corner', 'filigree', 'ornamental', { metal: 'silver', curls: 2 }, ['silver'], [...CORNER, 'filigrana', 'filigree', ...METAL_TAGS.silver], words('Filigrana de plata', 'Silver filigree'), words('Volutas de plata, sencillas y elegantes.', 'Silver scrolls, simple and elegant.')),
  ornament('corner-filigree-rose', 'corner', 'filigree', 'ornamental', { metal: 'rose', curls: 3 }, METAL_COLORS.rose, [...CORNER, 'filigrana', 'filigree', ...METAL_TAGS.rose], words('Filigrana de oro rosa', 'Rose gold filigree'), words('Volutas de oro rosa en las esquinas.', 'Rose gold scrolls in the corners.')),
  ornament('corner-sprig-green', 'corner', 'sprig', 'botanical', { metal: 'gold', leafColor: 'leaf' }, ['green', 'gold'], [...CORNER, 'ramas', 'sprigs', 'hojas', 'leaves', 'verde', 'green'], words('Ramas verdes', 'Green sprigs'), words('Ramas de hojas verdes que bordean las esquinas.', 'Sprigs of green leaves along the corners.')),
  ornament('corner-sprig-gold', 'corner', 'sprig', 'botanical', { metal: 'gold', leafColor: 'goldleaf' }, ['gold'], [...CORNER, 'ramas', 'sprigs', 'hojas', 'leaves', ...METAL_TAGS.gold], words('Ramas de oro', 'Golden sprigs'), words('Ramas de hojas de oro en las esquinas.', 'Sprigs of gold leaves in the corners.')),
  ornament('corner-floral-blossom', 'corner', 'floral', 'floral', { metal: 'gold', petal: 'blossom' }, ['pink', 'green'], [...CORNER, 'flores', 'flowers', 'rosa', 'pink'], words('Flores en la esquina', 'Corner blossoms'), words('Un ramillete de flores rosadas en cada esquina.', 'A posy of pink blossoms in each corner.')),
  ornament('corner-floral-ivory', 'corner', 'floral', 'floral', { metal: 'silver', petal: 'ivory' }, ['white', 'green'], [...CORNER, 'flores', 'flowers', 'marfil', 'ivory'], words('Flores de marfil en la esquina', 'Ivory corner blossoms'), words('Flores blancas y hojas finas en las esquinas.', 'White flowers and fine leaves in the corners.')),
  ornament('corner-celestial-gold', 'corner', 'celestial', 'celestial', { metal: 'gold' }, ['gold'], [...CORNER, 'luna', 'moon', 'estrellas', 'stars', ...METAL_TAGS.gold], words('Luna y estrellas', 'Moon and stars'), words('Una luna creciente y estrellas de oro en las esquinas.', 'A crescent moon and gold stars in the corners.')),
  ornament('corner-celestial-silver', 'corner', 'celestial', 'celestial', { metal: 'silver' }, ['silver'], [...CORNER, 'luna', 'moon', 'estrellas', 'stars', ...METAL_TAGS.silver], words('Luna y estrellas de plata', 'Silver moon and stars'), words('Luna y estrellas de plata en las esquinas.', 'A silver moon and stars in the corners.')),
  ornament('corner-geometric-gold', 'corner', 'geometric', 'geometric', { metal: 'gold' }, ['gold'], [...CORNER, 'triángulos', 'triangles', 'geometría', 'geometry', ...METAL_TAGS.gold], words('Triángulos de oro', 'Gold triangles'), words('Triángulos anidados de oro en las esquinas.', 'Nested gold triangles in the corners.')),
  ornament('corner-geometric-silver', 'corner', 'geometric', 'geometric', { metal: 'silver' }, ['silver'], [...CORNER, 'triángulos', 'triangles', 'geometría', 'geometry', ...METAL_TAGS.silver], words('Triángulos de plata', 'Silver triangles'), words('Triángulos anidados de plata en las esquinas.', 'Nested silver triangles in the corners.')),
  ornament('corner-laurel-gold', 'corner', 'laurel', 'laurel', { metal: 'gold' }, ['gold'], [...CORNER, 'laurel', 'hojas', 'leaves', ...METAL_TAGS.gold], words('Laurel en la esquina', 'Corner laurel'), words('Ramas de laurel de oro a lo largo de las esquinas.', 'Branches of gold laurel along the corners.')),
  ornament('corner-dotted-gold', 'corner', 'dotted', 'geometric', { metal: 'gold' }, ['gold'], [...CORNER, 'puntos', 'dots', 'arcos', 'arcs', ...METAL_TAGS.gold], words('Arcos de puntos de oro', 'Gold dotted arcs'), words('Arcos de puntos de oro que nacen de la esquina.', 'Arcs of gold dots spreading from the corner.')),
  ornament('corner-dotted-rose', 'corner', 'dotted', 'geometric', { metal: 'rose' }, METAL_COLORS.rose, [...CORNER, 'puntos', 'dots', 'arcos', 'arcs', ...METAL_TAGS.rose], words('Arcos de puntos de oro rosa', 'Rose gold dotted arcs'), words('Arcos de puntos de oro rosa en las esquinas.', 'Arcs of rose gold dots in the corners.')),

  ornament('crest-fan-gold', 'crest', 'decoFan', 'deco', { metal: 'gold' }, ['gold'], [...CREST, 'art déco', 'art deco', 'abanico', 'fan', ...METAL_TAGS.gold], words('Abanico art déco', 'Art deco fan crest'), words('Un abanico de oro con líneas que se abren a los lados.', 'A gold fan with lines opening to either side.')),
  ornament('crest-fan-silver', 'crest', 'decoFan', 'deco', { metal: 'silver' }, ['silver'], [...CREST, 'art déco', 'art deco', 'abanico', 'fan', ...METAL_TAGS.silver], words('Abanico art déco en plata', 'Silver art deco fan'), words('Un abanico de plata en lo alto de tu portada.', 'A silver fan at the top of your cover.')),
  ornament('crest-flourish-gold', 'crest', 'flourish', 'ornamental', { metal: 'gold', loops: 2 }, ['gold'], [...CREST, 'floritura', 'flourish', ...METAL_TAGS.gold], words('Floritura de oro', 'Gold flourish'), words('Volutas de oro a ambos lados de un diamante.', 'Gold scrolls on either side of a diamond.')),
  ornament('crest-flourish-silver', 'crest', 'flourish', 'ornamental', { metal: 'silver', loops: 1 }, ['silver'], [...CREST, 'floritura', 'flourish', ...METAL_TAGS.silver], words('Floritura de plata', 'Silver flourish'), words('Una floritura sencilla de plata.', 'A simple silver flourish.')),
  ornament('crest-flourish-rose', 'crest', 'flourish', 'ornamental', { metal: 'rose', loops: 2 }, METAL_COLORS.rose, [...CREST, 'floritura', 'flourish', ...METAL_TAGS.rose], words('Floritura de oro rosa', 'Rose gold flourish'), words('Volutas de oro rosa alrededor de un diamante.', 'Rose gold scrolls around a diamond.')),
  ornament('crest-laurel-gold', 'crest', 'laurel', 'laurel', { metal: 'gold' }, ['gold'], [...CREST, 'laurel', 'corona', 'wreath', ...METAL_TAGS.gold], words('Corona de laurel', 'Laurel crest'), words('Dos ramas de laurel de oro con una estrella al centro.', 'Two branches of gold laurel with a star at the centre.')),
  ornament('crest-laurel-green', 'crest', 'laurel', 'laurel', { metal: 'gold', leafColor: 'leaf' }, ['green', 'gold'], [...CREST, 'laurel', 'corona', 'wreath', 'verde', 'green'], words('Laurel verde', 'Green laurel crest'), words('Ramas de laurel verde con una estrella de oro.', 'Green laurel branches with a gold star.')),
  ornament('crest-celestial-gold', 'crest', 'celestial', 'celestial', { metal: 'gold' }, ['gold'], [...CREST, 'estrellas', 'stars', 'arco', 'arc', ...METAL_TAGS.gold], words('Arco de estrellas', 'Arc of stars'), words('Estrellas de oro en arco, con una estrella mayor al centro.', 'Gold stars in an arc, with a larger star at the centre.')),
  ornament('crest-celestial-silver', 'crest', 'celestial', 'celestial', { metal: 'silver' }, ['silver'], [...CREST, 'estrellas', 'stars', 'arco', 'arc', ...METAL_TAGS.silver], words('Arco de estrellas de plata', 'Silver arc of stars'), words('Un arco de estrellas de plata.', 'An arc of silver stars.')),
  ornament('crest-garland-blossom', 'crest', 'garland', 'floral', { metal: 'gold', petal: 'blossom' }, ['pink', 'green'], [...CREST, 'guirnalda', 'garland', 'flores', 'flowers'], words('Guirnalda de flores', 'Flower garland'), words('Una guirnalda de flores rosadas y hojas.', 'A garland of pink flowers and leaves.')),
  ornament('crest-garland-ivory', 'crest', 'garland', 'floral', { metal: 'silver', petal: 'ivory' }, ['white', 'green'], [...CREST, 'guirnalda', 'garland', 'flores', 'flowers', 'marfil', 'ivory'], words('Guirnalda de marfil', 'Ivory garland'), words('Flores blancas y hojas en guirnalda.', 'White flowers and leaves in a garland.')),
  ornament('crest-chevron-gold', 'crest', 'chevrons', 'geometric', { metal: 'gold' }, ['gold'], [...CREST, 'chevrón', 'chevron', 'geometría', 'geometry', ...METAL_TAGS.gold], words('Chevrones de oro', 'Gold chevrons'), words('Chevrones de oro anidados entre dos líneas.', 'Nested gold chevrons between two lines.')),

  ornament('trim-greek-gold', 'trim', 'greekKey', 'geometric', { metal: 'gold' }, ['gold'], [...TRIM, 'greca', 'greek key', 'meandro', 'meander', ...METAL_TAGS.gold], words('Greca de oro', 'Gold Greek key'), words('Una greca de oro a lo largo del borde superior.', 'A gold Greek key along the top edge.')),
  ornament('trim-greek-silver', 'trim', 'greekKey', 'geometric', { metal: 'silver' }, ['silver'], [...TRIM, 'greca', 'greek key', 'meandro', 'meander', ...METAL_TAGS.silver], words('Greca de plata', 'Silver Greek key'), words('Una greca de plata a lo largo del borde.', 'A silver Greek key along the edge.')),
  ornament('trim-fans-gold', 'trim', 'fans', 'deco', { metal: 'gold' }, ['gold'], [...TRIM, 'abanicos', 'fans', 'art déco', 'art deco', ...METAL_TAGS.gold], words('Abanicos de oro', 'Gold fan trim'), words('Una fila de abanicos art déco de oro.', 'A row of gold art deco fans.')),
  ornament('trim-fans-silver', 'trim', 'fans', 'deco', { metal: 'silver' }, ['silver'], [...TRIM, 'abanicos', 'fans', 'art déco', 'art deco', ...METAL_TAGS.silver], words('Abanicos de plata', 'Silver fan trim'), words('Una fila de abanicos art déco de plata.', 'A row of silver art deco fans.')),
  ornament('trim-waves-gold', 'trim', 'waves', 'waves', { metal: 'gold' }, ['gold'], [...TRIM, 'ondas', 'waves', ...METAL_TAGS.gold], words('Ondas de oro', 'Gold waves'), words('Dos líneas de oro que ondulan juntas.', 'Two gold lines rippling together.')),
  ornament('trim-waves-silver', 'trim', 'waves', 'waves', { metal: 'silver' }, ['silver'], [...TRIM, 'ondas', 'waves', ...METAL_TAGS.silver], words('Ondas de plata', 'Silver waves'), words('Dos líneas de plata que ondulan juntas.', 'Two silver lines rippling together.')),
  ornament('trim-beads-gold', 'trim', 'beads', 'pearl', { metal: 'gold' }, ['gold'], [...TRIM, 'cuentas', 'beads', ...METAL_TAGS.gold], words('Cuentas de oro', 'Gold beads'), words('Una sarta de cuentas de oro.', 'A string of gold beads.')),
  ornament('trim-beads-pearl', 'trim', 'beads', 'pearl', { metal: 'gold', pearl: true }, ['white', 'gold'], [...TRIM, 'perlas', 'pearls', 'collar', 'necklace'], words('Perlas', 'Pearls'), words('Una sarta de perlas con puntos de oro.', 'A string of pearls with gold dots.')),
  ornament('trim-vine-green', 'trim', 'vine', 'botanical', { metal: 'gold', leafColor: 'leaf' }, ['green', 'gold'], [...TRIM, 'enredadera', 'vine', 'hojas', 'leaves', 'verde', 'green'], words('Enredadera', 'Vine'), words('Una enredadera verde que corre por el borde.', 'A green vine running along the edge.')),
  ornament('trim-vine-gold', 'trim', 'vine', 'botanical', { metal: 'gold', leafColor: 'goldleaf' }, ['gold'], [...TRIM, 'enredadera', 'vine', 'hojas', 'leaves', ...METAL_TAGS.gold], words('Enredadera de oro', 'Gold vine trim'), words('Una enredadera de oro a lo largo del borde.', 'A gold vine along the edge.')),
  ornament('trim-stars-gold', 'trim', 'stars', 'celestial', { metal: 'gold' }, ['gold'], [...TRIM, 'estrellas', 'stars', ...METAL_TAGS.gold], words('Estrellas de oro', 'Gold stars'), words('Estrellas y puntos de oro en fila.', 'Gold stars and dots in a row.')),
  ornament('trim-stars-silver', 'trim', 'stars', 'celestial', { metal: 'silver' }, ['silver'], [...TRIM, 'estrellas', 'stars', ...METAL_TAGS.silver], words('Estrellas de plata', 'Silver stars'), words('Estrellas y puntos de plata en fila.', 'Silver stars and dots in a row.')),
];

export const DESIGNS = [...SUPPLIED, ...SURFACES, ...PHOTOS, ...HORIZONS, ...FRAMES, ...EXPRESSION, ...PROFESSIONAL];
