// Art deco: repeating geometry in fine metallic line, on a deep ground.
// Patterns (uP[1].x): 0 fans, 1 sunburst, 2 chevrons, 3 diamond lattice, 4 arches.
// The line is foil: its colour runs from shadow to highlight across the
// picture, as gold leaf catches a raking light.
// uC: 0 ground, 1 ground lift, 2 foil shadow, 3 foil body, 4 foil highlight.
// uP[0]: x tile size (picture heights), y line width (pixels at 2160), z inner lines, w ground texture.
// uP[1]: x pattern, y light angle, z glow, w dots.

float aaLine(float d, float width) {
  float w = width * uRes.y / 2160.0;
  float px = fwidth(d) + 1e-5;
  return 1.0 - smoothstep(w * 0.5 * px, (w * 0.5 + 1.0) * px, abs(d));
}

// Each pattern returns the distance (in tile units) to its nearest line.
float fans(vec2 p, float rings) {
  // Overlapping waves of concentric circles on a staggered lattice, the
  // lower rows in front: each shows only its upper arcs, as in a fan screen.
  float bestY = 1e9;
  float bestR = 2.0;
  float j0 = floor(p.y / 0.5);
  for (int dj = -2; dj <= 2; dj++) {
    float j = j0 + float(dj);
    float cy = j * 0.5;
    float off = mod(j, 2.0) * 0.5;
    float cx = floor(p.x - off + 0.5) + off;
    for (int di = -1; di <= 1; di++) {
      vec2 cc = vec2(cx + float(di), cy);
      float r = length(p - cc);
      if (r < 1.0 && cc.y < bestY) {
        bestY = cc.y;
        bestR = r;
      }
    }
  }
  float ring = abs(fract(bestR * rings) - 0.5) / rings;
  return min(ring, abs(bestR - 1.0));
}
float sunburst(vec2 p, float rings) {
  // Rays fan out from below the picture: half as many near the source, the
  // rest joining further out, the change hidden under an arc.
  float r = length(p);
  float ang = atan(p.y, p.x);
  float count = r < 1.2 ? 80.0 : 160.0;
  float ray = abs(fract(ang / (2.0 * PI) * count) - 0.5) * r * 2.0 * PI / count;
  float arcs = abs(r - 1.2);
  for (int i = 1; i <= 3; i++) {
    if (float(i) > rings) break;
    arcs = min(arcs, abs(r - 0.4 * float(i)));
  }
  return min(ray, arcs);
}
float chevrons(vec2 p, float rings) {
  float y = p.y + abs(fract(p.x) - 0.5) * 1.2;
  return abs(fract(y * rings * 0.5) - 0.5) / (rings * 0.5);
}
float lattice(vec2 p, float rings) {
  vec2 d = vec2(p.x + p.y, p.x - p.y) * 0.7071;
  vec2 f = abs(fract(d) - 0.5);
  float main = min(f.x, f.y);
  vec2 g = abs(fract(d * rings * 0.5 + 0.5) - 0.5) / (rings * 0.5);
  return min(main, max(min(g.x, g.y), 0.0) + 0.02);
}
float arches(vec2 p, float rings) {
  // Rows of nested arched windows: straight sides below, a half circle above.
  vec2 f = fract(p) - vec2(0.5, 0.0);
  float best = abs(f.y);
  for (int i = 0; i < 4; i++) {
    if (float(i) >= rings) break;
    float w = 0.42 - float(i) * 0.09;
    float spring = 0.45;
    float d = f.y < spring ? abs(abs(f.x) - w) : abs(length(f - vec2(0.0, spring)) - w);
    best = min(best, d);
  }
  return best;
}

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  int pattern = int(uP[1].x + 0.5);
  vec2 p = c / uP[0].x + vec2(uSeed * 0.37, 0.0);
  float d;
  if (pattern == 0) d = fans(p, uP[0].z);
  else if (pattern == 1) d = sunburst(c / uP[0].x - vec2(0.0, -0.9 / uP[0].x), uP[0].z);
  else if (pattern == 2) d = chevrons(p, uP[0].z);
  else if (pattern == 3) d = lattice(p, uP[0].z);
  else d = arches(p, uP[0].z);
  float line = aaLine(d, uP[0].y);

  // Foil: shadow to highlight along a raking light, with a fine shimmer.
  float la = uP[1].y;
  float k = dot(c, vec2(cos(la), sin(la)));
  float shimmer = fbm(c * 6.0 + uSeed, 3);
  vec3 foil = mix(uC[2], uC[3], smoothstep(-0.9, 0.2, k + 0.3 * shimmer));
  foil = mix(foil, uC[4], smoothstep(0.25, 0.9, k + 0.4 * shimmer));

  vec3 ground = mix(uC[0], uC[1], smoothstep(-0.8, 0.7, c.y + 0.25 * fbm(c * 1.5 + 4.0, 4)));
  ground *= 1.0 - uP[0].w * 0.06 * noise(frag / (uRes.y / 700.0));
  // A soft glow around the foil, as in a lit room.
  ground += uC[3] * uP[1].z * 0.05 * smoothstep(0.08, 0.0, d);
  vec3 color = mix(ground, foil, line);
  return color * vignette(uv, 0.3);
}
