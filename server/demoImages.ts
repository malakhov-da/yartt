// Pictures for the demo data (server/demo.ts), drawn pixel by pixel without
// dependencies: a gradient for a mockup in a comment, and avatars — a simple
// portrait for a person, a robot for the bot.
import { crc32, deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];

/** An RGB PNG of `width`×`height` whose pixel colors come from `color(x, y)`. */
export function png(width: number, height: number, color: (x: number, y: number) => Rgb): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows = Buffer.alloc(height * (width * 3 + 1));
  let at = 0;
  for (let y = 0; y < height; y++) {
    rows[at++] = 0; // no filter
    for (let x = 0; x < width; x++) {
      for (const c of color(x, y)) rows[at++] = Math.max(0, Math.min(255, Math.round(c)));
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A gradient from `base`: stands in for a screenshot or a mockup. */
export function gradient(width: number, height: number, base: Rgb = [40, 110, 220]): Buffer {
  return png(width, height, (x, y) => [base[0] + (x * 180) / width, base[1] + (y * 100) / height, base[2] - (x * 120) / width]);
}

/** How a person in the demo looks. */
export type Look = {
  background: Rgb;
  skin: Rgb;
  hair: Rgb;
  shirt: Rgb;
  /** Hair down to the shoulders. */
  long?: boolean;
};

const SIZE = 128;
const SAMPLES = 3; // per side: edges are smoothed by averaging 3×3 points per pixel

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const darker = (c: Rgb, by: number): Rgb => mix(c, [0, 0, 0], by);
const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** Draws `point(x, y)` (in pixel units, fractional) smoothed into a SIZE×SIZE PNG. */
function smooth(point: (x: number, y: number) => Rgb): Buffer {
  return png(SIZE, SIZE, (px, py) => {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < SAMPLES; i++) {
      for (let j = 0; j < SAMPLES; j++) {
        const c = point(px + (i + 0.5) / SAMPLES, py + (j + 0.5) / SAMPLES);
        r += c[0]; g += c[1]; b += c[2];
      }
    }
    const n = SAMPLES * SAMPLES;
    return [r / n, g / n, b / n];
  });
}

/** A head-and-shoulders portrait: shoulders, neck, face with eyes, hair. */
export function portrait(look: Look): Buffer {
  return smooth((x, y) => {
    const face = inEllipse(x, y, 64, 60, 23, 28);
    const hair = inEllipse(x, y, 64, 54, 27, 31);
    // Front: the face, but the hair covers its top (a fringe with a parting).
    if (face) {
      if (hair && y < 44 + Math.abs(x - 58) * 0.25) return look.hair;
      if (inEllipse(x, y, 55, 62, 2.6, 2.6) || inEllipse(x, y, 73, 62, 2.6, 2.6)) return [45, 35, 35];
      if (inEllipse(x, y, 64, 75, 7, 2.2) && y > 75) return darker(look.skin, 0.35); // a smile
      return look.skin;
    }
    if (y > 80 && y < 98 && Math.abs(x - 64) < 9) return darker(look.skin, 0.12); // the neck
    if (inEllipse(x, y, 64, 140, 52, 50)) {
      // A collar: a V of the skin at the neck.
      if (y < 104 && Math.abs(x - 64) < (104 - y) * 0.6) return darker(look.skin, 0.12);
      return look.shirt;
    }
    // Behind: hair over the head, and down to the shoulders when long.
    if (hair && y < 60) return look.hair;
    if (look.long && y < 100 && inEllipse(x, y, 64, 70, 30, 34)) return look.hair;
    return mix(look.background, darker(look.background, 0.35), y / SIZE);
  });
}

/** The bot's avatar: a rounded robot head with an antenna. */
export function robot(): Buffer {
  const metal: Rgb = [176, 186, 197];
  return smooth((x, y) => {
    const dx = Math.max(Math.abs(x - 64) - 26, 0), dy = Math.max(Math.abs(y - 70) - 20, 0);
    if (dx * dx + dy * dy <= 100) {
      if (inEllipse(x, y, 52, 66, 6, 6) || inEllipse(x, y, 76, 66, 6, 6)) return [0, 229, 255];
      if (y > 82 && y < 86 && Math.abs(x - 64) < 14) return darker(metal, 0.4);
      return metal;
    }
    if (inEllipse(x, y, 64, 28, 6, 6)) return [255, 82, 82];
    if (y > 32 && y < 44 && Math.abs(x - 64) < 2) return darker(metal, 0.3);
    return mix([55, 71, 79], [38, 50, 56], y / SIZE);
  });
}
