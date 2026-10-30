// Glass: soft fields of colour blending into one another, seen through
// frosted glass — a fine grain, a few long diagonal reflections, a gentle
// light from one corner. Also the base of the calm professional gradients.
// uC: 0 ground, 1..4 the colours that float in it.
// uP[0]: x blob size, y saturation of blobs, z grain, w reflections.
// uP[1]: x blob count (1..6), y light corner angle, z drift, w ground share.

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  vec2 p = c + 0.12 * vec2(fbm(c * 1.2 + uSeed, 4), fbm(c * 1.2 + uSeed + 7.0, 4)) * uP[1].z;
  vec3 sum = uC[0] * uP[1].w;
  float weight = uP[1].w;
  int count = int(uP[1].x + 0.5);
  for (int i = 0; i < 6; i++) {
    if (i >= count) break;
    vec2 at = (hash22(vec2(float(i) * 3.7 + uSeed, uSeed * 1.3)) - 0.5) * vec2(1.6, 0.95);
    float size = uP[0].x * (0.7 + 0.6 * hash12(vec2(float(i), uSeed + 9.0)));
    float w = exp(-dot(p - at, p - at) / (size * size));
    vec3 tint = uC[1 + i % 4];
    sum += tint * w * uP[0].y;
    weight += w * uP[0].y;
  }
  vec3 color = sum / max(weight, 1e-4);

  // Light from a corner.
  float la = uP[1].y;
  color *= 0.9 + 0.18 * smoothstep(-1.0, 1.0, dot(c, vec2(cos(la), sin(la))));
  // One broad, soft reflection across the glass.
  float diag = dot(c, normalize(vec2(1.0, 0.55)));
  color += vec3(1.0) * 0.07 * uP[0].w * exp(-pow((diag - 0.12) / 0.16, 2.0));
  // Frosted grain, sized to the picture.
  color *= 1.0 + uP[0].z * 0.05 * (hash12(floor(frag / max(uRes.y / 2160.0, 0.25))) - 0.5);
  return color;
}
