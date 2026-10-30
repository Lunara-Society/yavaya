// Liquid metal: folds of molten metal flowing across a dark ground.
// A smooth wave field, bent by slow noise, is a surface of folds; its crests
// are metal, lit as a polished surface (a dark flank, a bright reflected
// streak, a soft secondary glow), and its valleys fall away into the ground.
// uC: 0 ground, 1 ground lift, 2 metal shadow, 3 metal body, 4 highlight.
// uP[0]: x scale, y fold frequency, z metal coverage (0..1), w flow bend.
// uP[1]: x flow angle (radians), y sparkle amount, z relief, w light angle.

float waveField(vec2 p, float freq, float bend) {
  vec2 flow = vec2(fbm(p * 0.55, 4), fbm(p * 0.55 + vec2(3.1, 7.4), 4));
  vec2 w = p + bend * flow;
  return w.y * freq + 2.4 * fbm(w * 0.7 + 1.3, 4);
}

// Polished metal: shaded by which way the surface faces, like the reflection of a bright horizon.
vec3 polished(vec3 n, vec2 lightDir) {
  float k = dot(n.xy, lightDir);
  vec3 base = mix(uC[2], uC[3], smoothstep(-0.75, 0.5, k));
  float streak = exp(-pow((k - 0.5) / 0.09, 2.0));
  float glow = exp(-pow((k + 0.45) / 0.25, 2.0));
  // The reflected glow on the shadow side keeps the metal's own colour, never grey.
  return base * (0.72 + 0.28 * n.z) + uC[4] * streak * 1.4 + uC[3] * glow * 0.25;
}

vec3 render(vec2 uv, vec2 frag) {
  float a = uP[1].x;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * centred(uv) * uP[0].x + vec2(uSeed * 1.37, uSeed * 0.71);
  float la = uP[1].w;
  vec2 lightDir = vec2(cos(la), sin(la));

  float t = waveField(p, uP[0].y, uP[0].w);
  // The field's slope in picture units; the folds' relief is sin(t).
  vec2 gt = vec2(dFdx(t), dFdy(t)) * uRes.y;
  float s = 0.5 + 0.5 * sin(t);
  vec3 n = normalize(vec3(-gt * cos(t) * uP[1].z, 1.0));
  vec3 metal = polished(n, lightDir);
  // Faint flow lines, as poured metal has.
  metal *= 0.95 + 0.05 * sin(t * 19.0 + 4.0 * fbm(p * 3.0, 2));

  // Ribbons swell and thin along their length, and now and then merge.
  float edge = 1.0 - uP[0].z + 0.16 * fbm(p * 0.7 + 20.0, 3);
  // Crisp at every size: the edge is one pixel of the field wide.
  float fw = fwidth(s) * 1.2;
  float body = smoothstep(edge - fw, edge + fw, s);

  vec2 c = centred(uv);
  vec3 ground = mix(uC[0], uC[1], smoothstep(-0.6, 0.8, fbm(p * 0.35 + 9.0, 3) + 0.5 * c.y));
  // A faint warmth from the metal further out, and a tight contact shadow at its edge.
  ground += uC[3] * 0.035 * smoothstep(edge - 0.45, edge - 0.15, s) * (1.0 - smoothstep(edge - 0.15, edge, s));
  ground *= 1.0 - 0.6 * smoothstep(edge - 0.06, edge, s) * (1.0 - body);
  vec3 color = mix(ground, metal, body);

  // Fine sparks of light near the metal, sized to the picture.
  vec2 sp = frag / (uRes.y / 240.0);
  vec2 cell = floor(sp);
  vec2 jitter = 0.2 + 0.6 * hash22(cell + uSeed);
  float d = length(sp - cell - jitter);
  float near = smoothstep(edge - 0.4, edge - 0.05, s) * (1.0 - body);
  float spark = step(1.0 - 0.16 * uP[1].y, hash12(cell * 1.7 + uSeed)) * smoothstep(0.14, 0.0, d) * near;
  color += uC[4] * spark * (0.6 + hash12(cell + 3.3));
  return color * vignette(uv, 0.3);
}
