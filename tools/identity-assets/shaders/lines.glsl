// Flowing lines: the contour lines of a slow, bent field, drawn as fine
// metallic threads — dense where the field is steep, open where it rests.
// Also the base of the topographic professional designs (no shine, index lines).
// uC: 0 ground, 1 ground lift, 2 line shadow, 3 line body, 4 line highlight.
// uP[0]: x scale, y lines per unit, z line width (pixels at 2160), w bend.
// uP[1]: x shine (0 flat .. 1 metallic), y index every N lines (0 none), z fade, w light angle.

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  vec2 p = c * uP[0].x + vec2(uSeed * 1.7, uSeed * 2.9);
  vec2 bend = vec2(fbm(p * 0.6, 4), fbm(p * 0.6 + 5.5, 4));
  // Few octaves: long, calm curves (uP[2].x; 3 unless a design asks for more).
  int octaves = uP[2].x > 0.5 ? int(uP[2].x + 0.5) : 3;
  float field = fbm(p * 0.5 + uP[0].w * bend, octaves) * 2.0 + 0.35 * p.y;
  float f = field * uP[0].y;

  float width = uP[0].z * uRes.y / 2160.0;
  float px = fwidth(f) + 1e-6;
  float d = abs(fract(f - 0.5) - 0.5);
  float line = 1.0 - smoothstep((width * 0.5) * px, (width * 0.5 + 1.0) * px, d);
  if (uP[1].y > 0.5) {
    // Every Nth line is an index line, drawn heavier.
    float n = floor(f + 0.5);
    float isIndex = step(abs(mod(n, uP[1].y)), 0.5);
    float heavy = 1.0 - smoothstep((width * 1.1) * px, (width * 1.1 + 1.0) * px, d);
    line = max(line, heavy * isIndex);
  }
  // Where the lines crowd together they fade, rather than merge into a smear.
  line *= 1.0 - smoothstep(110.0, 190.0, px * uRes.y);
  // Lines fade in and out across the picture, so it breathes.
  float fade = mix(1.0, smoothstep(-0.35, 0.45, fbm(p * 0.35 + 13.0, 3)), uP[1].z);
  line *= fade;

  float la = uP[1].w;
  float k = dot(c, vec2(cos(la), sin(la))) + 0.3 * fbm(p * 2.0, 3);
  vec3 thread = mix(uC[2], uC[3], smoothstep(-0.8, 0.3, k));
  thread = mix(thread, uC[4], uP[1].x * smoothstep(0.2, 0.9, k));
  thread = mix(uC[3], thread, uP[1].x);

  vec3 ground = mix(uC[0], uC[1], smoothstep(-0.8, 0.8, c.y + 0.3 * fbm(p * 0.4 + 2.0, 3)));
  return mix(ground, thread, line) * vignette(uv, 0.22);
}
