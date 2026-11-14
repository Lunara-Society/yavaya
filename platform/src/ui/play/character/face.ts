import * as THREE from 'three';

/**
 * The faces, drawn rather than modelled.
 *
 * A face is a picture on a shell just over the front of the head: eyes,
 * brows, mouth and a little colour in the cheeks. A drawn face is what makes
 * a small character expressive at the size a phone shows it, costs one small
 * texture instead of dozens of meshes, and can change expression by swapping
 * the picture (a blink, a grin at the finish).
 *
 * The shell spans `FACE_SHELL` of the head sphere; the picture is laid out in
 * that frame (256 × 256, the middle of the face at about x 128, y 150).
 */
export const FACE_SHELL = { phiLength: 1.8, thetaStart: 0.75, thetaLength: 1.35 };

export type FaceState = 'normal' | 'blink' | 'happy';

/** Canvas height (0…256 down the face picture) to the angle down the head sphere, as the face shell maps it. */
export function faceTheta(y: number): number {
  return FACE_SHELL.thetaStart + (FACE_SHELL.thetaLength * y) / 256;
}

/*
 * Where the eyes and the top of the mouth are in a face's picture, so what
 * is worn over a face (a beard, face paint) can be placed on that face
 * rather than at one fixed height. The owner's painted faces are drawn
 * larger than the built-in ones: eyes higher, mouth lower.
 */
const PAINTED = { eyeY: 138, mouthTop: 222 };
export function faceLayout(face: string, painted: boolean): { eyeY: number; mouthTop: number } {
  if (painted) return PAINTED;
  const style = STYLES[face] ?? STYLES.alegre!;
  // The built-in mouth sits right under the nose: a beard's moustache there would hide the nose, so it
  // lies a little lower, over the top of the mouth, which is drawn over it.
  return { eyeY: style.eyeY, mouthTop: style.eyeY + 56 };
}

type Style = {
  /** Eye height in the picture, and their spread from the middle. */
  eyeY: number;
  eyeGap: number;
  eye: 'round' | 'calm' | 'sharp' | 'sly';
  brow: 'up' | 'soft' | 'down' | 'arch';
  mouth: 'grin' | 'smile' | 'smirk' | 'sly';
  lashes: boolean;
};

const STYLES: Record<string, Style> = {
  alegre: { eyeY: 150, eyeGap: 48, eye: 'round', brow: 'up', mouth: 'grin', lashes: false },
  tranquila: { eyeY: 151, eyeGap: 48, eye: 'calm', brow: 'soft', mouth: 'smile', lashes: true },
  decidido: { eyeY: 151, eyeGap: 48, eye: 'sharp', brow: 'down', mouth: 'smirk', lashes: false },
  picara: { eyeY: 150, eyeGap: 48, eye: 'sly', brow: 'arch', mouth: 'sly', lashes: true },
};

const INK = '#2a1a14';
const IRIS = '#5a3a22';

function drawFace(context: CanvasRenderingContext2D, style: Style, state: FaceState, brow: string) {
  const c = context;
  c.clearRect(0, 0, 256, 256);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const left = 128 - style.eyeGap;
  const right = 128 + style.eyeGap;
  const y = style.eyeY;

  // Cheeks.
  c.fillStyle = 'rgba(200, 110, 100, 0.12)';
  for (const x of [left - 8, right + 8]) {
    c.beginPath();
    c.ellipse(x, y + 34, 16, 9, 0, 0, Math.PI * 2);
    c.fill();
  }

  // Eyes.
  for (const [index, x] of [left, right].entries()) {
    const mirror = index === 0 ? -1 : 1;
    if (state === 'blink' || state === 'happy') {
      c.strokeStyle = INK;
      c.lineWidth = 6;
      c.beginPath();
      if (state === 'happy') c.arc(x, y + 6, 15, Math.PI * 1.15, Math.PI * 1.85);
      else c.arc(x, y - 4, 16, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
      continue;
    }
    const tall = style.eye === 'round' ? 15 : style.eye === 'sharp' ? 11 : 13;
    c.fillStyle = '#fbf7f0';
    c.beginPath();
    c.ellipse(x, y, 17, tall, 0, 0, Math.PI * 2);
    c.fill();
    // Where they look: a sly glance aside, everyone else ahead.
    const look = style.eye === 'sly' ? 5 : 0;
    c.fillStyle = IRIS;
    c.beginPath();
    c.ellipse(x + look, y + 1, 10, Math.min(tall - 1, 11), 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#140c08';
    c.beginPath();
    c.ellipse(x + look, y + 1, 5, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x + look - 3, y - 3, 2.6, 0, Math.PI * 2);
    c.fill();
    // Upper lid: heavier for a calm or determined look.
    c.strokeStyle = INK;
    c.lineWidth = style.eye === 'calm' || style.eye === 'sharp' ? 6 : 4;
    c.beginPath();
    const lid = style.eye === 'calm' ? 0.22 : style.eye === 'sharp' ? 0.3 : 0.12;
    c.ellipse(x, y, 17, tall, 0, Math.PI * (1 + lid), Math.PI * (2 - lid));
    c.stroke();
    if (style.eye === 'calm' || style.eye === 'sharp') {
      c.fillStyle = 'rgba(0,0,0,0.001)';
      // The lid covers the top of the eye.
      c.save();
      c.beginPath();
      c.ellipse(x, y, 18, tall + 1, 0, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = 'rgba(120, 70, 50, 0.55)';
      c.fillRect(x - 20, y - tall - 2, 40, tall * (style.eye === 'sharp' ? 0.75 : 0.6));
      c.restore();
    }
    if (style.lashes) {
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(x + mirror * 15, y - tall * 0.6);
      c.lineTo(x + mirror * 23, y - tall * 0.95);
      c.moveTo(x + mirror * 9, y - tall * 0.85);
      c.lineTo(x + mirror * 13, y - tall * 1.2);
      c.stroke();
    }
  }

  // Brows, in the hair's colour.
  c.strokeStyle = brow;
  c.lineWidth = 5;
  for (const [index, x] of [left, right].entries()) {
    const inner = index === 0 ? 1 : -1;
    const top = y - 28;
    c.beginPath();
    switch (style.brow) {
      case 'up':
        c.moveTo(x - 15, top + 2);
        c.quadraticCurveTo(x, top - 9, x + 15, top + 2);
        break;
      case 'soft':
        c.moveTo(x - 15, top + 3);
        c.quadraticCurveTo(x, top - 3, x + 15, top + 3);
        break;
      case 'down':
        c.moveTo(x - inner * 16, top - 4);
        c.lineTo(x + inner * 14, top + 6);
        break;
      case 'arch':
        c.moveTo(x - 15, top + (index === 0 ? 4 : 0));
        c.quadraticCurveTo(x, top - (index === 0 ? 4 : 12), x + 15, top + (index === 0 ? 4 : 0));
        break;
    }
    c.stroke();
  }

  // A hint of a nose.
  c.strokeStyle = 'rgba(90, 50, 35, 0.35)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(124, y + 30);
  c.quadraticCurveTo(128, y + 34, 133, y + 30);
  c.stroke();

  // Mouth.
  const my = y + 52;
  c.strokeStyle = INK;
  c.fillStyle = '#7a2a2a';
  c.lineWidth = 3.5;
  const open = state === 'happy' || style.mouth === 'grin';
  if (open) {
    c.beginPath();
    c.moveTo(128 - 15, my - 4);
    c.quadraticCurveTo(128, my - 1, 128 + 15, my - 4);
    c.quadraticCurveTo(128, my + 18, 128 - 15, my - 4);
    c.fill();
    c.stroke();
    c.fillStyle = '#fbf7f0';
    c.fillRect(128 - 9, my - 3, 18, 4);
    c.fillStyle = '#e07a7a';
    c.beginPath();
    c.ellipse(128, my + 8, 6, 3, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.beginPath();
    if (style.mouth === 'smile') {
      c.moveTo(128 - 12, my);
      c.quadraticCurveTo(128, my + 7, 128 + 12, my);
    } else if (style.mouth === 'smirk') {
      c.moveTo(128 - 14, my + 3);
      c.quadraticCurveTo(128 + 4, my + 6, 128 + 17, my - 4);
    } else {
      c.moveTo(128 - 18, my - 2);
      c.quadraticCurveTo(128 - 2, my + 14, 128 + 18, my - 6);
      c.stroke();
      c.fillStyle = '#e07a7a';
      c.beginPath();
      c.ellipse(128 + 6, my + 7, 6, 4, 0.3, 0, Math.PI * 2);
      c.fill();
      return;
    }
    c.stroke();
  }
}

/** A picture, fetched once and kept: the faces, beards and face paint drawn from the owner's artwork. */
const pictures = new Map<string, Promise<HTMLImageElement>>();
export function loadPicture(url: string): Promise<HTMLImageElement> {
  let found = pictures.get(url);
  if (!found) {
    found = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(url));
      image.src = url;
    });
    // A failed fetch is not kept: the next dressing tries again.
    found.catch(() => pictures.delete(url));
    pictures.set(url, found);
  }
  return found;
}

/**
 * The three pictures of one face (cached by the caller per look).
 *
 * A painted face (`faceImage`, the owner's artwork with its skin taken out)
 * is laid over the character's own skin; it blinks by a lid of that skin
 * drawn over each eye. Face paint and beards are layers of their own, under
 * the face (character/build.ts), so the eyes and the mouth stay on top.
 * Pictures arrive after the character is built: until then the face is the
 * plain drawn one (or empty), and each picture is drawn in when it lands.
 */
export function faceTextures(face: string, browColor: number, options: { skin?: number; faceImage?: string | null } = {}): Record<FaceState, THREE.CanvasTexture> {
  const style = STYLES[face] ?? STYLES.alegre!;
  const brow = `#${new THREE.Color(browColor).multiplyScalar(0.85).getHexString()}`;
  const skin = `#${new THREE.Color(options.skin ?? 0xc68a5f).getHexString()}`;
  let painted: HTMLImageElement | null = null;
  const draw = (context: CanvasRenderingContext2D, state: FaceState) => {
    if (!options.faceImage) drawFace(context, style, state, brow);
    else {
      context.clearRect(0, 0, 256, 256);
      if (painted) {
        context.drawImage(painted, 0, 0, 256, 256);
        if (state === 'blink') {
          // Lids of the character's own skin over both eyes, and the line of the lashes.
          for (const x of [76, 180]) {
            context.fillStyle = skin;
            context.beginPath();
            context.ellipse(x, PAINTED.eyeY, 30, 17, 0, 0, Math.PI * 2);
            context.fill();
            context.strokeStyle = INK;
            context.lineWidth = 4;
            context.beginPath();
            context.arc(x, PAINTED.eyeY - 8, 22, Math.PI * 0.2, Math.PI * 0.8);
            context.stroke();
          }
        }
      }
    }
  };
  const made: Array<[FaceState, CanvasRenderingContext2D | null, THREE.CanvasTexture]> = [];
  const make = (state: FaceState) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) draw(context, state);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    made.push([state, context, texture]);
    return texture;
  };
  const textures = { normal: make('normal'), blink: make('blink'), happy: make('happy') };
  const redraw = () => {
    for (const [state, context, texture] of made) {
      if (!context) continue;
      draw(context, state);
      texture.needsUpdate = true;
    }
  };
  if (options.faceImage) void loadPicture(options.faceImage).then((image) => ((painted = image), redraw())).catch(() => undefined);
  return textures;
}
