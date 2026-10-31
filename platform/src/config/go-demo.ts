/**
 * The YavayaGo map demonstration: one made-up delivery, the same every time.
 *
 * It exists so anyone can see how tracking looks before there is a real
 * delivery to follow. It is not data about anyone: it runs entirely in the
 * visitor's browser, nothing about it is ever written to the database, and
 * the map labels it "DEMOSTRACIÓN — DATOS SIMULADOS" for as long as it shows.
 *
 * No place is written here. The route is a list of steps in metres, east and
 * north, from the centre of the launch city — whichever city the
 * `go.launch_place` setting names, read from its row. The steps turn at
 * right angles like streets, but they are not streets: the route is drawn,
 * not routed, and the map says so rather than claim real travel times.
 */

export type DemoStep = { east: number; north: number };

export const GO_DEMO = {
  /** Where the driver starts, then every corner, in order. */
  route: [
    { east: -900, north: 500 },
    { east: -900, north: 150 },
    { east: -600, north: 150 },
    { east: -600, north: -300 },
    { east: -100, north: -300 },
    { east: -100, north: -900 },
    { east: 400, north: -900 },
    { east: 400, north: -1500 },
    { east: 700, north: -1500 },
  ] as readonly DemoStep[],
  /** The corner where the order is picked up (an index into `route`); the last corner is the drop-off. */
  pickupIndex: 2,
  /** Metres the marker covers per second of the visitor's time: quicker than a real ride, and said to be. */
  playbackMetresPerSecond: 70,
  /** The pretend speed the simulated arrival estimate is worked out at (km/h). */
  simulatedSpeedKmh: 25,
  /** How long the driver waits at the store, in the visitor's seconds. */
  pickupPauseSeconds: 3,
} as const;

export type GeoPoint = { latitude: number; longitude: number };

const METRES_PER_DEGREE = 111_320;

/** A step in metres from a centre, as a point on the map. */
export function offsetPoint(center: GeoPoint, step: DemoStep): GeoPoint {
  const latitude = center.latitude + step.north / METRES_PER_DEGREE;
  const longitude = center.longitude + step.east / (METRES_PER_DEGREE * Math.cos((center.latitude * Math.PI) / 180));
  return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
}

/** Length of each leg of the route, in metres (the steps are already in metres). */
export function legLengths(route: readonly DemoStep[]): number[] {
  return route.slice(1).map((step, i) => Math.hypot(step.east - route[i]!.east, step.north - route[i]!.north));
}

export type DemoPhase = 'to_pickup' | 'at_pickup' | 'to_dropoff' | 'delivered';

export type DemoFrame = {
  phase: DemoPhase;
  /** Where the driver is, in metres from the centre. */
  at: DemoStep;
  /** Metres of route already covered, for drawing the travelled part. */
  covered: number;
  total: number;
  /** Simulated minutes to the drop-off at the pretend speed; 0 once delivered. */
  etaMinutes: number;
};

/**
 * Where the demonstration stands after `elapsedSeconds` of playback. Pure and
 * deterministic: the same second always gives the same frame, which is what
 * makes it testable — and the same for everyone.
 */
export function demoFrame(elapsedSeconds: number, demo: typeof GO_DEMO = GO_DEMO): DemoFrame {
  const legs = legLengths(demo.route);
  const total = legs.reduce((sum, length) => sum + length, 0);
  const toPickup = legs.slice(0, demo.pickupIndex).reduce((sum, length) => sum + length, 0);
  const speed = demo.playbackMetresPerSecond;
  const reachPickup = toPickup / speed;
  const leavePickup = reachPickup + demo.pickupPauseSeconds;
  const t = Math.max(0, elapsedSeconds);

  let covered: number;
  let phase: DemoPhase;
  if (t < reachPickup) {
    covered = t * speed;
    phase = 'to_pickup';
  } else if (t < leavePickup) {
    covered = toPickup;
    phase = 'at_pickup';
  } else {
    covered = Math.min(total, toPickup + (t - leavePickup) * speed);
    phase = covered >= total ? 'delivered' : 'to_dropoff';
  }

  // Walk the legs to the point `covered` metres along.
  let left = covered;
  let at: DemoStep = demo.route[demo.route.length - 1]!;
  for (let i = 0; i < legs.length; i += 1) {
    const length = legs[i]!;
    if (left <= length) {
      const from = demo.route[i]!;
      const to = demo.route[i + 1]!;
      const k = length === 0 ? 0 : left / length;
      at = { east: from.east + (to.east - from.east) * k, north: from.north + (to.north - from.north) * k };
      break;
    }
    left -= length;
  }

  const metresPerMinute = (demo.simulatedSpeedKmh * 1000) / 60;
  const etaMinutes = phase === 'delivered' ? 0 : Math.max(1, Math.ceil((total - covered) / metresPerMinute));
  return { phase, at, covered, total, etaMinutes };
}

/** Seconds of playback from start to delivery. */
export function demoDurationSeconds(demo: typeof GO_DEMO = GO_DEMO): number {
  const total = legLengths(demo.route).reduce((sum, length) => sum + length, 0);
  return total / demo.playbackMetresPerSecond + demo.pickupPauseSeconds;
}
