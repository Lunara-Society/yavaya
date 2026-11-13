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
  alegre: { eyeY: 146, eyeGap: 54, eye: 'round', brow: 'up', mouth: 'grin', lashes: false },
  tranquila: { eyeY: 148, eyeGap: 54, eye: 'calm', brow: 'soft', mouth: 'smile', lashes: true },
  decidido: { eyeY: 148, eyeGap: 54, eye: 'sharp', brow: 'down', mouth: 'smirk', lashes: false },
  picara: { eyeY: 146, eyeGap: 54, eye: 'sly', brow: 'arch', mouth: 'sly', lashes: true },
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
  c.fillStyle = 'rgba(232, 110, 110, 0.28)';
  for (const x of [left - 8, right + 8]) {
    c.beginPath();
    c.ellipse(x, y + 42, 17, 10, 0, 0, Math.PI * 2);
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
    const tall = style.eye === 'round' ? 28 : style.eye === 'sharp' ? 21 : 25;
    c.fillStyle = '#fbf7f0';
    c.beginPath();
    c.ellipse(x, y, 21, tall, 0, 0, Math.PI * 2);
    c.fill();
    // Where they look: a sly glance aside, everyone else ahead.
    const look = style.eye === 'sly' ? 5 : 0;
    c.fillStyle = IRIS;
    c.beginPath();
    c.ellipse(x + look, y + 3, 15, Math.min(tall - 4, 19), 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#140c08';
    c.beginPath();
    c.ellipse(x + look, y + 4, 8, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x + look - 5, y - 5, 5.2, 0, Math.PI * 2);
    c.arc(x + look + 5, y + 9, 2.4, 0, Math.PI * 2);
    c.fill();
    // Upper lid: heavier for a calm or determined look.
    c.strokeStyle = INK;
    c.lineWidth = style.eye === 'calm' || style.eye === 'sharp' ? 6 : 4;
    c.beginPath();
    const lid = style.eye === 'calm' ? 0.22 : style.eye === 'sharp' ? 0.3 : 0.12;
    c.ellipse(x, y, 21, tall, 0, Math.PI * (1 + lid), Math.PI * (2 - lid));
    c.stroke();
    if (style.eye === 'calm' || style.eye === 'sharp') {
      c.fillStyle = 'rgba(0,0,0,0.001)';
      // The lid covers the top of the eye.
      c.save();
      c.beginPath();
      c.ellipse(x, y, 22, tall + 1, 0, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = 'rgba(120, 70, 50, 0.55)';
      c.fillRect(x - 24, y - tall - 2, 48, tall * (style.eye === 'sharp' ? 0.75 : 0.6));
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
  c.lineWidth = 8;
  for (const [index, x] of [left, right].entries()) {
    const inner = index === 0 ? 1 : -1;
    const top = y - 42;
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

  // Mouth.
  const my = y + 62;
  c.strokeStyle = INK;
  c.fillStyle = '#7a2a2a';
  c.lineWidth = 5;
  const open = state === 'happy' || style.mouth === 'grin';
  if (open) {
    c.beginPath();
    c.moveTo(128 - 22, my - 4);
    c.quadraticCurveTo(128, my - 1, 128 + 22, my - 4);
    c.quadraticCurveTo(128, my + 30, 128 - 22, my - 4);
    c.fill();
    c.stroke();
    c.fillStyle = '#fbf7f0';
    c.fillRect(128 - 13, my - 3, 26, 5);
    c.fillStyle = '#e07a7a';
    c.beginPath();
    c.ellipse(128, my + 13, 9, 5, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.beginPath();
    if (style.mouth === 'smile') {
      c.moveTo(128 - 16, my);
      c.quadraticCurveTo(128, my + 12, 128 + 16, my);
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

/** The three pictures of one face (cached by the caller per look). */
export function faceTextures(face: string, browColor: number): Record<FaceState, THREE.CanvasTexture> {
  const style = STYLES[face] ?? STYLES.alegre!;
  const brow = `#${new THREE.Color(browColor).multiplyScalar(0.85).getHexString()}`;
  const make = (state: FaceState) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) drawFace(context, style, state, brow);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
  };
  return { normal: make('normal'), blink: make('blink'), happy: make('happy') };
}
