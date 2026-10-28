import { countStars, type PanelLine, type PanelLineColor, type PanelRead } from './panel';

/** Panel regions as fractions of the screenshot (left, top, right, bottom). */
const STATS: Rect = [0.28, 0.265, 0.505, 0.5];
const INFO: Rect = [0.495, 0.255, 0.735, 0.52];
const STARS: Rect = [0.33, 0.235, 0.43, 0.28];
const PREVIEW: Rect = [0.27, 0.225, 0.74, 0.53];
type Rect = [number, number, number, number];

type BBox = { x0: number; y0: number; x1: number; y1: number };
type Block = { paragraphs?: Array<{ lines?: Array<{ text?: string; bbox?: BBox }> }> };
type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

export interface PanelImage { read: PanelRead; previewUrl: string; fullUrl: string }

function crop(image: ImageBitmap, rect: Rect, scale = 1): HTMLCanvasElement {
  const [l, t, r, b] = rect;
  const x = Math.round(l * image.width), y = Math.round(t * image.height);
  const w = Math.max(1, Math.round((r - l) * image.width)), h = Math.max(1, Math.round((b - t) * image.height));
  const canvas = document.createElement('canvas');
  canvas.width = w * scale; canvas.height = h * scale;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingEnabled = true;
  context.drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Dark text on white for OCR: any bright (coloured or white) game text becomes dark. */
function forOcr(colour: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = colour.width; canvas.height = colour.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(colour, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) { const v = 255 - Math.max(d[i], d[i + 1], d[i + 2]); d[i] = d[i + 1] = d[i + 2] = v; }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function lineColour(colour: HTMLCanvasElement, box: BBox): PanelLineColor {
  const w = Math.max(1, box.x1 - box.x0), h = Math.max(1, box.y1 - box.y0);
  const d = colour.getContext('2d', { willReadFrequently: true })!.getImageData(box.x0, box.y0, w, h).data;
  let green = 0, red = 0, blue = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.max(r, g, b) < 95) continue;
    if (b > 135 && b > r + 45 && b > g + 15) blue++;
    else if (g > 115 && g > r + 28 && g >= b - 8) green++;
    else if (r > 150 && r > g + 60 && r > b + 60) red++;
  }
  const minimum = Math.max(6, w * h * 0.004);
  const best = Math.max(green, red, blue);
  if (best < minimum) return 'neutral';
  return best === blue ? 'blue' : best === green ? 'green' : 'red';
}

function starCount(image: ImageBitmap): number {
  const strip = crop(image, STARS);
  const d = strip.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, strip.width, strip.height).data;
  const columns: number[] = [];
  for (let x = 0; x < strip.width; x++) {
    let n = 0;
    for (let y = 0; y < strip.height; y++) { const i = (y * strip.width + x) * 4; if (Math.max(d[i], d[i + 1], d[i + 2]) > 140) n++; }
    columns.push(n);
  }
  // A star icon is about 1% of the screenshot width.
  return countStars(columns, Math.max(4, Math.round(image.width * 0.006)));
}

async function lines(worker: Worker, colour: HTMLCanvasElement): Promise<PanelLine[]> {
  const result = await worker.recognize(forOcr(colour), {}, { blocks: true });
  const blocks = (result.data as unknown as { blocks?: Block[] }).blocks ?? [];
  return blocks.flatMap(b => b.paragraphs ?? []).flatMap(p => p.lines ?? [])
    .filter(l => l.text?.trim() && l.bbox)
    .map(l => ({ text: l.text!.trim(), color: lineColour(colour, l.bbox!) }));
}

export async function createPanelReader(onStatus?: (status: string) => void) {
  onStatus?.('Loading text reader');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  return {
    async read(file: File): Promise<PanelImage> {
      if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
      const image = await createImageBitmap(file);
      try {
        const statLines = await lines(worker, crop(image, STATS, 2));
        const infoLines = (await lines(worker, crop(image, INFO, 2))).map(l => l.text);
        return {
          read: { infoLines, statLines, stars: starCount(image) },
          previewUrl: crop(image, PREVIEW).toDataURL('image/jpeg', 0.85),
          fullUrl: URL.createObjectURL(file)
        };
      } finally { image.close(); }
    },
    close: () => worker.terminate()
  };
}
