import type { DistrictId } from './blocks';

/**
 * A barrio's rótulo: the wrought-iron sign that hangs over a shop door in a
 * colonial town, a silhouette of the trade rather than a word — a basket for
 * the market, a candle for the chapel. Each district hangs its own at the top
 * of its pages, black iron with the emblem lit from behind in the barrio's
 * colour (Santuario's is gilded, and its candle burns).
 *
 * Drawn here rather than shipped as images so it takes the world's colour
 * (worlds.css, "Rótulos") and costs a few hundred bytes. Decorative: hidden
 * from assistive technology, and it hangs still with reduced motion.
 *
 * Geometry, in the 200 × 220 view box: the wall plate is on the right, the arm
 * reaches left to x 34, and the plaque hangs from two chains at x 82 and 118,
 * centred on (100, 118). The swing turns about the arm, at (100, 26).
 */

const PLAQUES: Record<DistrictId, string> = {
  // The market: a round sign, like a coin.
  mercadito: 'M100 56a62 62 0 1 1 0 124a62 62 0 1 1 0-124Z',
  // Servicios: a guild shield.
  services: 'M40 58H160V112C160 148 132 170 100 180C68 170 40 148 40 112Z',
  // Trabajo: a cut plate, square-cornered like a drawing's title block.
  work: 'M48 54H152L160 62V172L152 180H48L40 172V62Z',
  // YavayaGo: a pennant pointing the way.
  yavayago: 'M36 60H138L166 118L138 176H36L50 118Z',
  // Comunidad: an oval, the shape of a plaza.
  community: 'M100 54C136 54 162 82 162 118C162 154 136 182 100 182C64 182 38 154 38 118C38 82 64 54 100 54Z',
  // Santuario: a pointed chapel arch.
  sanctuary: 'M42 182V112C42 78 66 54 100 44C134 54 158 78 158 112V182Z',
  // Animales: a scalloped round, like a flower or a rosette at a fair.
  animals:
    'M100 56C110 56 116 63 124 66C133 68 141 66 148 73C154 80 152 88 155 96C158 104 164 110 164 118C164 128 157 134 154 142C152 150 154 159 147 165C140 172 132 169 124 172C116 175 110 182 100 182C90 182 84 175 76 172C68 169 60 172 53 165C46 159 48 150 46 142C43 134 36 128 36 118C36 110 42 104 45 96C48 88 46 80 52 73C59 66 67 68 76 66C84 63 90 56 100 56Z',
};

function Emblem({ id }: { id: DistrictId }) {
  switch (id) {
    case 'mercadito':
      // A woven basket heaped with fruit.
      return (
        <g className="rt-emblem">
          <path className="rt-line" d="M74 112C74 84 126 84 126 112" fill="none" strokeWidth="5" />
          <g className="rt-over">
            <circle cx="84" cy="102" r="10" />
            <circle cx="117" cy="103" r="9" />
            <circle cx="101" cy="98" r="11" />
            <path d="M103 88C107 79 116 76 123 78C119 85 110 89 103 88Z" />
          </g>
          <rect x="64" y="109" width="72" height="9" rx="4.5" />
          <path d="M68 121H132L123 152H77Z" />
          <path className="rt-cut" d="M70 131H130M73 141H127M88 121L86 152M100 121V152M112 121L114 152" fill="none" strokeWidth="2.5" />
        </g>
      );
    case 'services':
      // The trades: hammer and wrench, crossed.
      return (
        <g className="rt-emblem">
          <g transform="translate(100 118) rotate(-42)">
            <rect x="-4.5" y="-22" width="9" height="58" rx="4" />
            <path d="M-24 -38H20C24 -38 26 -35 26 -31V-26C26 -23 24 -22 21 -22H-24C-26 -22 -27 -23 -27 -25V-35C-27 -37 -26 -38 -24 -38Z" />
          </g>
          <g transform="translate(100 118) rotate(42)" className="rt-over">
            <rect x="-5" y="-26" width="10" height="60" rx="5" />
            <path d="M0 -50A14 14 0 1 1 0 -22A14 14 0 1 1 0 -50Z" />
            <rect className="rt-cut-fill" x="-5" y="-55" width="10" height="17" rx="2" />
            <circle cx="0" cy="30" r="7.5" />
            <circle className="rt-cut-fill" cx="0" cy="30" r="3" />
          </g>
        </g>
      );
    case 'work':
      // Precision: a drafting compass standing on a rule.
      return (
        <g className="rt-emblem">
          <rect x="94" y="72" width="12" height="11" rx="2" />
          <circle cx="100" cy="88" r="8" />
          <circle className="rt-cut-fill" cx="100" cy="88" r="3" />
          <path className="rt-line" d="M96 94L76 140M104 94L124 140" fill="none" strokeWidth="6.5" strokeLinecap="round" />
          <path className="rt-line" d="M85 120Q100 128 115 120" fill="none" strokeWidth="3" strokeLinecap="round" />
          <rect x="60" y="142" width="80" height="13" rx="2" />
          <path className="rt-cut" d="M68 142V149M76 142V146M84 142V149M92 142V146M100 142V149M108 142V146M116 142V149M124 142V146M132 142V149" fill="none" strokeWidth="2" />
        </g>
      );
    case 'yavayago':
      // An errand on its way: a scooter with its delivery box.
      return (
        <g className="rt-emblem">
          <rect x="58" y="88" width="30" height="24" rx="3" />
          <path className="rt-cut" d="M58 98H88" fill="none" strokeWidth="2.5" />
          <path d="M62 128C62 116 72 112 86 113L96 128Z" />
          <rect x="68" y="108" width="24" height="6" rx="3" />
          <rect x="80" y="126" width="40" height="7" rx="3.5" />
          <path className="rt-line" d="M116 130L128 90M120 88H138" fill="none" strokeWidth="6" strokeLinecap="round" />
          <circle className="rt-line" cx="76" cy="144" r="11" fill="none" strokeWidth="5.5" />
          <circle className="rt-line" cx="130" cy="144" r="11" fill="none" strokeWidth="5.5" />
          <circle cx="76" cy="144" r="3" />
          <circle cx="130" cy="144" r="3" />
        </g>
      );
    case 'community':
      // The ceiba in the plaza, where a town gathers — and two people under it.
      // Its crown is broad and flat, in clusters with sky between them; a single
      // smooth dome on a thin trunk reads as something else entirely.
      return (
        <g className="rt-emblem">
          <path className="rt-line" d="M100 112C98 104 92 99 80 96M100 112C102 104 108 99 120 96M100 108V90" fill="none" strokeWidth="4" strokeLinecap="round" />
          <g className="rt-over">
            <circle cx="66" cy="94" r="10" />
            <circle cx="80" cy="84" r="12" />
            <circle cx="134" cy="94" r="10" />
            <circle cx="120" cy="84" r="12" />
            <circle cx="100" cy="78" r="13" />
            <circle cx="88" cy="94" r="9" />
            <circle cx="112" cy="94" r="9" />
          </g>
          <path d="M96 106H104C103 122 105 136 109 146C113 150 119 152 124 154H76C81 152 87 150 91 146C95 136 97 122 96 106Z" />
          <circle cx="68" cy="132" r="5" />
          <path d="M60 154C60 144 63 139 68 139C73 139 76 144 76 154Z" />
          <circle cx="132" cy="132" r="5" />
          <path d="M124 154C124 144 127 139 132 139C137 139 140 144 140 154Z" />
        </g>
      );
    case 'sanctuary':
      // A candle, alight.
      return (
        <g className="rt-emblem">
          <circle className="rt-halo" cx="100" cy="82" r="30" />
          <path className="rt-flame" d="M100 62C108 74 110 83 100 92C90 83 92 74 100 62Z" />
          <path className="rt-flame-core" d="M100 74C104 80 104 85 100 89C96 85 96 80 100 74Z" />
          <path className="rt-wick" d="M100 92V99" fill="none" strokeWidth="2" strokeLinecap="round" />
          <path className="rt-candle" d="M88 102C88 99 90 98 93 98H107C110 98 112 99 112 102V150H88Z" />
          <path className="rt-candle-drip" d="M92 98H100V108C100 111 96 111 96 108V104C96 102 94 101 92 101Z" />
          <path className="rt-dish" d="M70 152H130C130 160 118 164 100 164C82 164 70 160 70 152Z" />
        </g>
      );
    case 'animals':
      // A paw.
      return (
        <g className="rt-emblem">
          <ellipse cx="74" cy="104" rx="9" ry="12" transform="rotate(-22 74 104)" />
          <ellipse cx="89" cy="90" rx="9" ry="12.5" transform="rotate(-6 89 90)" />
          <ellipse cx="111" cy="90" rx="9" ry="12.5" transform="rotate(6 111 90)" />
          <ellipse cx="126" cy="104" rx="9" ry="12" transform="rotate(22 126 104)" />
          <path d="M100 112C112 112 126 124 130 136C134 148 126 156 116 154C110 153 106 150 100 150C94 150 90 153 84 154C74 156 66 148 70 136C74 124 88 112 100 112Z" />
        </g>
      );
  }
}

export function Rotulo({ id, className }: { id: DistrictId; className?: string }) {
  const gilded = id === 'sanctuary';
  return (
    <svg className={className ? `rotulo rt-${id} ${className}` : `rotulo rt-${id}`} viewBox="0 0 200 220" aria-hidden="true" focusable="false">
      <defs>
        {/* The light behind the cut-out: the emblem, blurred, under itself. Identical in every sign, so a repeated id is harmless. */}
        <filter id="rt-light" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.2" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {gilded ? (
          <>
            <linearGradient id="rt-gilt" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fbeec2" />
              <stop offset="0.45" stopColor="#e2c27a" />
              <stop offset="1" stopColor="#b38a3c" />
            </linearGradient>
            <radialGradient id="rt-glow">
              <stop offset="0" stopColor="#fff3cf" stopOpacity="0.95" />
              <stop offset="0.5" stopColor="#ffd98a" stopOpacity="0.35" />
              <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
            </radialGradient>
          </>
        ) : null}
      </defs>
      {/* The bracket: a plate on the wall, an arm, and a scroll beneath it. */}
      <g className="rt-iron">
        <rect x="186" y="6" width="10" height="56" rx="2.5" />
        <rect x="30" y="22" width="160" height="7" rx="3.5" />
        <circle cx="30" cy="25.5" r="6" />
        <path d="M188 58C160 58 146 50 136 32" fill="none" strokeWidth="5" />
        <path d="M150 49C142 52 134 48 135 41C136 35 144 34 147 39" fill="none" strokeWidth="4" />
      </g>
      <g className="rt-swing">
        <g className="rt-iron rt-chain" fill="none" strokeWidth="2.6">
          <ellipse cx="82" cy="35" rx="3.2" ry="6" />
          <path d="M82 41V48" />
          <ellipse cx="82" cy="54" rx="3.2" ry="6" />
          <ellipse cx="118" cy="35" rx="3.2" ry="6" />
          <path d="M118 41V48" />
          <ellipse cx="118" cy="54" rx="3.2" ry="6" />
        </g>
        <path className="rt-plaque" d={PLAQUES[id]} />
        <path className="rt-rim" d={PLAQUES[id]} fill="none" transform="translate(100 118) scale(0.9) translate(-100 -118)" />
        <Emblem id={id} />
      </g>
    </svg>
  );
}
