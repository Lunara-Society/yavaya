// Silk: draped satin. A field of soft folds, bent by slow noise and crossed
// by a second, shallower drape, lit with satin's wide sheen and a narrower
// highlight along each crest.
// uC: 0 deep shadow, 1 body, 2 sheen, 3 highlight.
// uP[0]: x scale, y fold frequency, z relief, w bend.
// uP[1]: x fold angle (radians), y light angle, z cross-drape, w sheen strength.

vec3 render(vec2 uv, vec2 frag) {
  float a = uP[1].x;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 p = rot * centred(uv) * uP[0].x + vec2(uSeed * 1.9, uSeed * 0.6);
  vec2 bend = vec2(fbm(p * 0.45, 4), fbm(p * 0.45 + 6.3, 4));
  vec2 w = p + uP[0].w * bend;

  // Height of the cloth: main folds plus a shallow cross drape.
  float t = w.y * uP[0].y + 1.6 * fbm(w * 0.6 + 2.0, 3);
  float t2 = (w.x * 0.8 - w.y * 0.6) * uP[0].y * 0.45 + 2.0 * fbm(w * 0.5 + 8.0, 3);
  float h = sin(t) + uP[1].z * 0.6 * sin(t2);
  vec2 g = (vec2(dFdx(t), dFdy(t)) * cos(t) + uP[1].z * 0.6 * vec2(dFdx(t2), dFdy(t2)) * cos(t2)) * uRes.y;
  vec3 n = normalize(vec3(-g * uP[0].z, 1.0));

  float la = uP[1].y;
  vec3 light = normalize(vec3(cos(la), sin(la), 1.2));
  float diffuse = clamp(dot(n, light) * 0.6 + 0.4, 0.0, 1.0);
  vec3 half_ = normalize(light + vec3(0.0, 0.0, 1.0));
  float nh = clamp(dot(n, half_), 0.0, 1.0);
  float wide = pow(nh, 10.0);
  float narrow = pow(nh, 70.0);
  float valley = smoothstep(-1.4, 0.4, h);

  vec3 color = mix(uC[0], uC[1], diffuse * valley);
  color += uC[2] * wide * 0.55 * uP[1].w;
  color += uC[3] * narrow * 0.7 * uP[1].w;
  return color * vignette(uv, 0.32);
}
