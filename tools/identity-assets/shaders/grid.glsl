// Grid: a fine drafting grid — minor lines, heavier major lines every few
// squares, small marks where majors cross — on a softly lit ground.
// uC: 0 ground, 1 ground lift, 2 minor line, 3 major line.
// uP[0]: x squares per picture height, y major every N, z minor width (px at 2160), w marks.
// uP[1]: x tilt (radians), y glow centre x, z glow centre y, w dot grid instead of lines (0/1).

float gridLine(float v, float width) {
  float px = fwidth(v) + 1e-6;
  float d = abs(fract(v - 0.5) - 0.5);
  return 1.0 - smoothstep(width * 0.5 * px, (width * 0.5 + 1.0) * px, d);
}

vec3 render(vec2 uv, vec2 frag) {
  vec2 c = centred(uv);
  float a = uP[1].x;
  vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * c * uP[0].x;
  float scale = uRes.y / 2160.0;
  float minorW = uP[0].z * scale;
  vec3 ground = mix(uC[0], uC[1], exp(-dot(c - uP[1].yz, c - uP[1].yz) * 1.6));
  vec3 color = ground;
  if (uP[1].w > 0.5) {
    // Dots at every crossing instead of lines.
    vec2 f = abs(fract(p - 0.5) - 0.5);
    float r = length(f / fwidth(p));
    float dotMinor = 1.0 - smoothstep(minorW * 1.2, minorW * 1.2 + 1.0, r);
    vec2 fm = abs(fract(p / uP[0].y - 0.5) - 0.5) * uP[0].y;
    float dotMajor = 1.0 - smoothstep(minorW * 2.4, minorW * 2.4 + 1.0, length(fm / fwidth(p)));
    color = mix(color, uC[2], dotMinor);
    color = mix(color, uC[3], dotMajor);
    return color;
  }
  float minor = max(gridLine(p.x, minorW), gridLine(p.y, minorW));
  float major = max(gridLine(p.x / uP[0].y, minorW * 2.2), gridLine(p.y / uP[0].y, minorW * 2.2));
  color = mix(color, uC[2], minor);
  color = mix(color, uC[3], major);
  // Small crosses where major lines meet.
  vec2 fm = abs(fract(p / uP[0].y - 0.5) - 0.5) * uP[0].y;
  float cross_ = step(max(fm.x, fm.y), 0.18) * max(gridLine(p.x / uP[0].y, minorW * 4.0), gridLine(p.y / uP[0].y, minorW * 4.0));
  color = mix(color, uC[3], cross_ * uP[0].w);
  return color;
}
