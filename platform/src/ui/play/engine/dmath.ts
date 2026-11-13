/**
 * Mathematics that gives the same answer on every phone and on the server
 * (docs/PLAY.md, "Verified runs").
 *
 * A run is kept as the thumbs' input, step by step, and the server plays it
 * again to learn the real time. That only works if both sides compute the
 * very same numbers. `+ - * /` and `Math.sqrt` are exact to the last bit by
 * the IEEE 754 standard everywhere; `Math.sin`, `Math.cos`, `Math.atan2`,
 * `Math.exp` and `Math.hypot` are not (each browser engine has its own), so
 * the simulation uses these instead. They are accurate to about 1e-15,
 * which is far below anything a player can see; what matters is that they
 * are identical.
 */

const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;
const QUARTER_PI = 0.7853981633974483;
const TWO_PI = 6.283185307179586;
const LN2 = 0.6931471805599453;

/** sin and cos on [-π/4, π/4], by their series (enough terms for double precision). */
function sinCore(r: number) {
  const r2 = r * r;
  let term = r;
  let sum = r;
  for (let n = 1; n <= 10; n += 1) {
    term *= -r2 / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}
function cosCore(r: number) {
  const r2 = r * r;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 10; n += 1) {
    term *= -r2 / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}

/** Splits x into a quadrant and a remainder in [-π/4, π/4]. */
function reduce(x: number): [number, number] {
  const turns = Math.round(x / TWO_PI);
  let r = x - turns * TWO_PI;
  const q = Math.round(r / HALF_PI);
  r -= q * HALF_PI;
  return [((q % 4) + 4) % 4, r];
}

export function dsin(x: number): number {
  const [q, r] = reduce(x);
  return q === 0 ? sinCore(r) : q === 1 ? cosCore(r) : q === 2 ? -sinCore(r) : -cosCore(r);
}

export function dcos(x: number): number {
  const [q, r] = reduce(x);
  return q === 0 ? cosCore(r) : q === 1 ? -sinCore(r) : q === 2 ? -cosCore(r) : sinCore(r);
}

/** atan on [0, tan(π/8)], by its series. */
function atanCore(t: number) {
  const t2 = t * t;
  let power = t;
  let sum = t;
  for (let n = 1; n <= 24; n += 1) {
    power *= -t2;
    sum += power / (2 * n + 1);
  }
  return sum;
}

function datan(x: number): number {
  const sign = x < 0 ? -1 : 1;
  let t = x * sign;
  let base = 0;
  if (t > 1) {
    base = HALF_PI;
    t = 1 / t;
    const inner = t > 0.41421356237309503 ? QUARTER_PI + atanCore((t - 1) / (t + 1)) : atanCore(t);
    return sign * (base - inner);
  }
  const value = t > 0.41421356237309503 ? QUARTER_PI + atanCore((t - 1) / (t + 1)) : atanCore(t);
  return sign * value;
}

export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export function dexp(x: number): number {
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 18; n += 1) {
    term *= r / n;
    sum += term;
  }
  // Times 2^k, by doubling or halving: exact.
  let scale = 1;
  for (let i = 0; i < Math.abs(k); i += 1) scale *= k > 0 ? 2 : 0.5;
  return sum * scale;
}

export function dhypot(a: number, b: number, c = 0): number {
  return Math.sqrt(a * a + b * b + c * c);
}
