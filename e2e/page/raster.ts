/**
 * Draws text and glyph outlines on canvases of the same size and compares the covered pixels.
 * Outlines match when every covered pixel of one drawing lies within `TOLERANCE_PX` of a covered
 * pixel of the other, apart from `MAX_MISMATCH` of them, which absorbs hinting and antialiasing.
 * The tolerance alone would let a glyph moved or grown by up to `TOLERANCE_PX` pass, so the ink
 * boxes of both drawings must also agree within `BOX_TOLERANCE_PX` on every side.
 * Resolution: outlines that differ by about 1% of the em (4px) fail; smaller drift can pass.
 */

/** Font size of every drawing: glyphs that differ by 1% of the em differ by 4 pixels. */
export const FONT_SIZE = 400;
export const TOLERANCE_PX = 2;
export const MAX_MISMATCH = 0.002;
export const BOX_TOLERANCE_PX = 1;
/** A path filled with Path2D against the text rasterizer: WebKit puts sharp tips 2px apart. */
export const PATH_BOX_TOLERANCE_PX = 2;

const PADDING = FONT_SIZE / 2;
const HEIGHT = FONT_SIZE * 3;
const BASELINE = FONT_SIZE * 2;
const COVERED_ALPHA = 128;
/** The em of the SVG font, `EM` in src/engines/svg-font.ts. */
export const SVG_UNITS_PER_EM = 1000;

export interface Drawing {
  canvas: HTMLCanvasElement;
  mask: Uint8Array;
}

export interface Comparison {
  mismatch: number;
  covered: number;
  /** The largest distance between matching sides of the ink boxes; 0 when both are blank. */
  boxShift: number;
  reference: Drawing;
  output: Drawing;
}

function newContext(width: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D context is not available");
  }
  return context;
}

function toDrawing(context: CanvasRenderingContext2D): Drawing {
  const { width, height } = context.canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index++) {
    mask[index] = data[index * 4 + 3] >= COVERED_ALPHA ? 1 : 0;
  }
  return { canvas: context.canvas, mask };
}

export const fontOf = (family: string, size: number): string => `${size}px "${family}"`;

export function measure(family: string, size: number, text: string): TextMetrics {
  const context = newContext(1);
  context.font = fontOf(family, size);
  return context.measureText(text);
}

/** Width a drawing of `text` needs, so both drawings of a comparison share one canvas size. */
export const canvasWidth = (advance: number): number => Math.ceil(advance + PADDING * 2);

export function drawText(family: string, size: number, text: string, width: number): Drawing {
  const context = newContext(width);
  context.font = fontOf(family, size);
  context.textBaseline = "alphabetic";
  context.fillText(text, PADDING, BASELINE);
  return toDrawing(context);
}

/** A glyph of an SVG font: path data in font units, y up, on an em of 1000 units. */
export function drawSvgGlyph(d: string, size: number, width: number): Drawing {
  const context = newContext(width);
  const scale = size / SVG_UNITS_PER_EM;
  context.setTransform(scale, 0, 0, -scale, PADDING, BASELINE);
  // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type -- CanvasRenderingContext2D.fill, not Array#fill
  context.fill(new Path2D(d));
  return toDrawing(context);
}

/** The mask grown by `radius` pixels in every direction: a square max filter, row then column. */
function dilate(mask: Uint8Array, width: number, radius: number): Uint8Array {
  const height = mask.length / width;
  const rows = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = Math.max(0, x - radius);
      const to = Math.min(width - 1, x + radius);
      for (let at = from; at <= to && rows[y * width + x] === 0; at++) {
        rows[y * width + x] = mask[y * width + at];
      }
    }
  }
  const grown = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const from = Math.max(0, y - radius);
    const to = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      for (let at = from; at <= to && grown[y * width + x] === 0; at++) {
        grown[y * width + x] = rows[at * width + x];
      }
    }
  }
  return grown;
}

export function compare(reference: Drawing, output: Drawing): Comparison {
  const { width } = reference.canvas;
  const nearReference = dilate(reference.mask, width, TOLERANCE_PX);
  const nearOutput = dilate(output.mask, width, TOLERANCE_PX);
  let mismatch = 0;
  let covered = 0;
  for (let index = 0; index < reference.mask.length; index++) {
    const inReference = reference.mask[index] === 1;
    const inOutput = output.mask[index] === 1;
    covered += inReference || inOutput ? 1 : 0;
    mismatch +=
      (inOutput && nearReference[index] === 0) || (inReference && nearOutput[index] === 0) ? 1 : 0;
  }
  return { mismatch, covered, boxShift: boxShift(reference, output), reference, output };
}

/** Left, top, right and bottom of the covered pixels, or null for a blank drawing. */
function inkBox({ canvas, mask }: Drawing): number[] | null {
  const { width } = canvas;
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === 1) {
      const x = index % width;
      const y = Math.floor(index / width);
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  return box[0] === Infinity ? null : box;
}

function boxShift(reference: Drawing, output: Drawing): number {
  const [referenceBox, outputBox] = [inkBox(reference), inkBox(output)];
  if (!referenceBox || !outputBox) {
    return referenceBox === outputBox ? 0 : Infinity;
  }
  return Math.max(...referenceBox.map((side, index) => Math.abs(side - outputBox[index])));
}

/** Share of covered pixels too far from the other drawing; two blank drawings match. */
export const mismatchRatio = ({ mismatch, covered }: Comparison): number =>
  covered === 0 ? 0 : mismatch / covered;

const BOTH = [0, 0, 0];
const REFERENCE_ONLY = [37, 99, 235];
const OUTPUT_ONLY = [220, 38, 38];
const NEITHER = [255, 255, 255];

function diffColor(inReference: boolean, inOutput: boolean): number[] {
  if (inReference) {
    return inOutput ? BOTH : REFERENCE_ONLY;
  }
  return inOutput ? OUTPUT_ONLY : NEITHER;
}

/** Reference in blue, output in red, both in black: where the drawings disagree stands out. */
export function diffImage({ reference, output }: Comparison): HTMLCanvasElement {
  const { width, height } = reference.canvas;
  const context = newContext(width);
  const image = context.createImageData(width, height);
  for (let index = 0; index < reference.mask.length; index++) {
    const inReference = reference.mask[index] === 1;
    const inOutput = output.mask[index] === 1;
    const [red, green, blue] = diffColor(inReference, inOutput);
    image.data.set([red, green, blue, 255], index * 4);
  }
  context.putImageData(image, 0, 0);
  return context.canvas;
}
