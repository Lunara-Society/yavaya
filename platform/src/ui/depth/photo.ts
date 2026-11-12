/**
 * A photograph with near and far.
 *
 * Each district card's picture comes with a small greyscale map of how far
 * away each part of it is (public/art/depth/home-card-<district>.webp, white
 * near; tools/depth/make-depth.py). Drawn through the shader below, the near
 * parts of the picture shift one way and the far parts the other as the
 * viewer's eye moves, which is what a real place does behind a window.
 *
 * One WebGL context draws every card. A browser allows a page only a handful
 * of contexts, and a single canvas laid behind all the cards would lag a
 * frame behind them while the page scrolls; so each card has a plain 2D
 * canvas of its own, which scrolls with it for free, and this context draws
 * into its own unseen canvas and copies the result across.
 *
 * Everything here may fail — no WebGL, a context the browser takes back, a
 * picture that never arrives — and every failure leaves the card showing its
 * ordinary photograph, which is still underneath.
 */

/** How the card crops its photograph: `object-fit: cover` at the `object-position` the stylesheet gives it. */
export type Crop = {
  /** The card's size in CSS pixels. */
  width: number;
  height: number;
  /** `object-position`, as fractions. */
  focusX: number;
  focusY: number;
  /** The most the nearest and farthest parts shift apart, in CSS pixels; a share of the width (SHIFT) when not given. */
  reach?: number;
};

/**
 * The picture is drawn this much larger than its frame, so that when it
 * shifts there is picture, not edge, to show. The stylesheet enlarges the
 * ordinary photograph by the same amount (styles.ts), so the two can be
 * exchanged without a jump.
 */
export const PHOTO_ZOOM = 1.035;

/** How far the nearest and farthest parts shift apart at the most, as a share of the card's width. */
const SHIFT = 0.05;

const VERTEX = `
attribute vec2 p;
varying vec2 v;
void main() {
  v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/*
 * For each point of the card: which point of the picture has moved here? A
 * point moves by its depth, so the answer depends on the depth at the answer.
 * Two rounds of asking settle it closely enough; one alone smears the line
 * where near meets far.
 *
 * highp where the phone has it: at mediump an older graphics chip counts
 * picture coordinates in steps of about a pixel, and the picture shimmers.
 */
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D photo;
uniform sampler2D depth;
uniform vec4 crop;
uniform vec2 eye;
varying vec2 v;
void main() {
  vec2 uv = v * crop.xy + crop.zw;
  float d = texture2D(depth, uv).r - 0.5;
  d = texture2D(depth, uv + eye * d).r - 0.5;
  gl_FragColor = vec4(texture2D(photo, uv + eye * d).rgb, 1.0);
}`;

type Entry = { photo: WebGLTexture | null; depth: WebGLTexture | null; width: number; height: number; cancelled: boolean };

export type PhotoRenderer = {
  /** Fetches a card's depth map and prepares its photograph. Safe to call again. */
  prepare(key: string, photograph: HTMLImageElement, depthUrl: string): void;
  /** Draws the card's photograph into its canvas as seen from `eye` (−1…1 each way). False until its pictures are ready. */
  draw(key: string, target: CanvasRenderingContext2D, crop: Crop, eyeX: number, eyeY: number): boolean;
  /** Lets go of a card's pictures (it has scrolled far away). */
  release(key: string): void;
  /** Whether the browser has taken the context back. */
  lost(): boolean;
  dispose(): void;
};

/** A renderer, or null where WebGL is not available or the browser says it would be slow. */
export function createPhotoRenderer(): PhotoRenderer | null {
  const surface = document.createElement('canvas');
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = surface.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      // A browser drawing WebGL in software says so here: such a device gets the still photograph.
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const context = gl;

  const compile = (type: number, source: string) => {
    const shader = context.createShader(type);
    if (!shader) return null;
    context.shaderSource(shader, source);
    context.compileShader(shader);
    return context.getShaderParameter(shader, context.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(context.VERTEX_SHADER, VERTEX);
  const fragment = compile(context.FRAGMENT_SHADER, FRAGMENT);
  const program = context.createProgram();
  if (!vertex || !fragment || !program) return null;
  context.attachShader(program, vertex);
  context.attachShader(program, fragment);
  context.linkProgram(program);
  if (!context.getProgramParameter(program, context.LINK_STATUS)) return null;
  context.useProgram(program);

  // One triangle that covers the whole view: nothing to index, no seam down the middle.
  const buffer = context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER, buffer);
  context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), context.STATIC_DRAW);
  const position = context.getAttribLocation(program, 'p');
  context.enableVertexAttribArray(position);
  context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);
  context.uniform1i(context.getUniformLocation(program, 'photo'), 0);
  context.uniform1i(context.getUniformLocation(program, 'depth'), 1);
  const cropAt = context.getUniformLocation(program, 'crop');
  const eyeAt = context.getUniformLocation(program, 'eye');

  let gone = false;
  const onLost = (event: Event) => {
    event.preventDefault();
    gone = true;
  };
  surface.addEventListener('webglcontextlost', onLost);

  const entries = new Map<string, Entry>();

  /** A picture as a texture. Photographs are any size, so: no mipmaps, no repeat. */
  const texture = (source: HTMLImageElement, format: number) => {
    const made = context.createTexture();
    context.bindTexture(context.TEXTURE_2D, made);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texImage2D(context.TEXTURE_2D, 0, format, format, context.UNSIGNED_BYTE, source);
    return made;
  };

  const release = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    entry.cancelled = true;
    if (!gone) {
      if (entry.photo) context.deleteTexture(entry.photo);
      if (entry.depth) context.deleteTexture(entry.depth);
    }
    entries.delete(key);
  };

  return {
    prepare(key, photograph, depthUrl) {
      if (gone || entries.has(key)) return;
      const entry: Entry = { photo: null, depth: null, width: 0, height: 0, cancelled: false };
      entries.set(key, entry);
      const usePhotograph = () => {
        if (entry.cancelled || gone || entry.photo || !photograph.naturalWidth) return;
        try {
          entry.photo = texture(photograph, context.RGB);
          entry.width = photograph.naturalWidth;
          entry.height = photograph.naturalHeight;
        } catch {
          entry.cancelled = true;
        }
      };
      // The photograph is the card's own <img>: whatever size the browser chose for this screen, and never fetched twice.
      if (photograph.complete && photograph.naturalWidth) usePhotograph();
      else photograph.addEventListener('load', usePhotograph, { once: true });
      const map = new Image();
      map.decoding = 'async';
      map.onload = () => {
        if (entry.cancelled || gone) return;
        try {
          entry.depth = texture(map, context.LUMINANCE);
        } catch {
          entry.cancelled = true;
        }
      };
      map.src = depthUrl;
    },

    draw(key, target, crop, eyeX, eyeY) {
      const entry = entries.get(key);
      if (gone || !entry || !entry.photo || !entry.depth) return false;
      const width = target.canvas.width;
      const height = target.canvas.height;
      if (!width || !height) return false;
      // The unseen canvas only ever grows: resizing it throws its picture away and costs a frame.
      if (surface.width < width || surface.height < height) {
        surface.width = Math.max(surface.width, width);
        surface.height = Math.max(surface.height, height);
      }
      // Where the card's corners fall on the photograph: object-fit: cover, at the card's focus, enlarged by PHOTO_ZOOM.
      const scale = Math.max(crop.width / entry.width, crop.height / entry.height) * PHOTO_ZOOM;
      const shownW = entry.width * scale;
      const shownH = entry.height * scale;
      const left = (crop.width - shownW) * crop.focusX;
      const top = (crop.height - shownH) * crop.focusY;
      context.viewport(0, 0, width, height);
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, entry.photo);
      context.activeTexture(context.TEXTURE1);
      context.bindTexture(context.TEXTURE_2D, entry.depth);
      context.uniform4f(cropAt, crop.width / shownW, crop.height / shownH, -left / shownW, -top / shownH);
      // The same distance on the card in both directions, whatever the picture's shape.
      const reach = crop.reach ?? crop.width * SHIFT;
      context.uniform2f(eyeAt, (eyeX * reach) / shownW, (eyeY * reach) / shownH);
      context.drawArrays(context.TRIANGLES, 0, 3);
      // WebGL counts rows from the bottom, a 2D canvas from the top.
      target.drawImage(surface, 0, surface.height - height, width, height, 0, 0, width, height);
      return true;
    },

    release,

    lost: () => gone,

    dispose() {
      for (const key of [...entries.keys()]) release(key);
      surface.removeEventListener('webglcontextlost', onLost);
      // Hand the context back now rather than when the collector gets round to it.
      if (!gone) context.getExtension('WEBGL_lose_context')?.loseContext();
      gone = true;
    },
  };
}
