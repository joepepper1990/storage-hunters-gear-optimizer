import type { GearOcrVisualLine, OcrLineColor } from './types';

export interface GearOcrResult {
  text: string;
  previewUrl: string;
  lines: GearOcrVisualLine[];
}

export type GearOcrProgress = (progress: number, status: string) => void;

type BBox = { x0: number; y0: number; x1: number; y1: number };
type TesseractLineLike = { text?: string; bbox?: BBox };
type TesseractParagraphLike = { lines?: TesseractLineLike[] };
type TesseractBlockLike = { paragraphs?: TesseractParagraphLike[] };

async function fileToBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dimensions(image: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if ('naturalWidth' in image) return { width: image.naturalWidth, height: image.naturalHeight };
  return { width: image.width, height: image.height };
}

function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas image processing is not available in this browser.');
  context.drawImage(source, 0, 0);
  return copy;
}

async function prepareScreenshot(file: File): Promise<{ colorCanvas: HTMLCanvasElement; ocrCanvas: HTMLCanvasElement }> {
  const image = await fileToBitmap(file);
  try {
    const { width, height } = dimensions(image);
    const longEdge = Math.max(width, height);
    const scale = Math.min(1, 2200 / Math.max(1, longEdge));
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = Math.max(1, Math.round(width * scale));
    colorCanvas.height = Math.max(1, Math.round(height * scale));
    const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
    if (!colorContext) throw new Error('Canvas image processing is not available in this browser.');
    colorContext.imageSmoothingEnabled = true;
    colorContext.drawImage(image, 0, 0, colorCanvas.width, colorCanvas.height);

    const ocrCanvas = copyCanvas(colorCanvas);
    const ocrContext = ocrCanvas.getContext('2d', { willReadFrequently: true });
    if (!ocrContext) throw new Error('Canvas image processing is not available in this browser.');
    const pixels = ocrContext.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
    const data = pixels.data;
    for (let index = 0; index < data.length; index += 4) {
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
      data[index] = contrasted;
      data[index + 1] = contrasted;
      data[index + 2] = contrasted;
    }
    ocrContext.putImageData(pixels, 0, 0);
    return { colorCanvas, ocrCanvas };
  } finally {
    if ('close' in image && typeof image.close === 'function') image.close();
  }
}

function safeBBox(raw: BBox | undefined, width: number, height: number): BBox | undefined {
  if (!raw) return undefined;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(raw.x0)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(raw.y0)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil(raw.x1)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil(raw.y1)));
  return { x0, y0, x1, y1 };
}

function classifyLineColor(canvas: HTMLCanvasElement, bbox: BBox): OcrLineColor {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 'neutral';
  const safe = safeBBox(bbox, canvas.width, canvas.height);
  if (!safe) return 'neutral';
  const image = context.getImageData(safe.x0, safe.y0, safe.x1 - safe.x0, safe.y1 - safe.y0);
  let blue = 0;
  let green = 0;
  let coloured = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const r = image.data[index];
    const g = image.data[index + 1];
    const b = image.data[index + 2];
    const brightness = Math.max(r, g, b);
    if (brightness < 95) continue;
    if (b > 135 && b > r + 45 && b > g + 15) { blue += 1; coloured += 1; continue; }
    if (g > 115 && g > r + 28 && g >= b - 8) { green += 1; coloured += 1; }
  }
  const area = Math.max(1, (safe.x1 - safe.x0) * (safe.y1 - safe.y0));
  const minimum = Math.max(6, area * 0.004);
  if (blue >= minimum && blue > green * 1.12) return 'blue';
  if (green >= minimum && green > blue * 1.05) return 'green';
  if (coloured >= minimum && blue > green) return 'blue';
  return 'neutral';
}

function visualLinesFromBlocks(colorCanvas: HTMLCanvasElement, blocks: TesseractBlockLike[] | undefined): GearOcrVisualLine[] {
  const output: GearOcrVisualLine[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = String(line.text ?? '').trim();
        const bbox = safeBBox(line.bbox, colorCanvas.width, colorCanvas.height);
        if (!text || !bbox) continue;
        output.push({ text, bbox, color: classifyLineColor(colorCanvas, bbox) });
      }
    }
  }
  return output;
}

export async function recogniseGearScreenshot(file: File, onProgress?: GearOcrProgress): Promise<GearOcrResult> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a screenshot or other image file.');
  onProgress?.(0.03, 'Preparing screenshot');
  const { colorCanvas, ocrCanvas } = await prepareScreenshot(file);
  const previewUrl = colorCanvas.toDataURL('image/jpeg', 0.9);

  onProgress?.(0.08, 'Loading local OCR');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', undefined, {
    logger(message: { progress?: number; status?: string }) {
      const progress = typeof message.progress === 'number' ? message.progress : 0;
      const status = String(message.status || 'Reading screenshot');
      const scaled = status.toLowerCase().includes('recognizing') ? 0.25 + progress * 0.72 : 0.08 + progress * 0.17;
      onProgress?.(Math.min(0.97, scaled), status);
    }
  });

  try {
    const result = await worker.recognize(ocrCanvas, {}, { blocks: true });
    const data = result.data as typeof result.data & { blocks?: TesseractBlockLike[] };
    const lines = visualLinesFromBlocks(colorCanvas, data.blocks);
    onProgress?.(1, 'Scan complete');
    return { text: data.text, previewUrl, lines };
  } finally {
    await worker.terminate();
  }
}
