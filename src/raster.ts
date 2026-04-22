import type { QrCodeFormat } from "./types.js";

export type RasterFormat = Exclude<QrCodeFormat, "svg">;

type RasterBackend = {
  canRasterize: () => boolean;
  rasterize: (svg: string, size: number, format: RasterFormat) => Promise<Uint8Array>;
};

type BrowserCanvasLike = {
  width: number;
  height: number;
  getContext: (kind: "2d") => BrowserCanvasContext | null;
};

type BrowserBitmap = {
  close?: () => void;
};

type BrowserImageElement = {
  decoding?: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
};

type BrowserCanvasContext = {
  clearRect: (...args: number[]) => void;
  drawImage: (...args: unknown[]) => void;
  getImageData?: (sx: number, sy: number, sw: number, sh: number) => BrowserImageData;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: "low" | "medium" | "high";
  putImageData?: (imageData: BrowserImageData, dx: number, dy: number) => void;
};

type BrowserImageData = {
  data: Uint8ClampedArray;
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type BrowserOffscreenCanvas = {
  getContext: (kind: "2d") => BrowserCanvasContext | null;
  convertToBlob: (options: { type: string }) => Promise<Blob>;
};

type BrowserRasterGlobals = {
  OffscreenCanvas?: new (width: number, height: number) => BrowserOffscreenCanvas;
  createImageBitmap?: (image: Blob) => Promise<BrowserBitmap>;
  document?: {
    createElement: (tagName: "canvas") => BrowserDomCanvas;
  };
  Image?: new () => BrowserImageElement;
};

type BrowserDomCanvas = BrowserCanvasLike & {
  toBlob: (callback: (blob: Blob | null) => void, type: string) => void;
};

const DOM_RASTER_SUPERSAMPLE_SCALE = 4;

const browserDomRasterBackend: RasterBackend = {
  canRasterize() {
    const globals = getBrowserRasterGlobals();
    return typeof globals.document?.createElement === "function" && typeof globals.Image === "function";
  },
  async rasterize(svg, size, format) {
    const globals = getBrowserRasterGlobals();
    const documentCtor = globals.document;
    const ImageCtor = globals.Image;

    if (!documentCtor || !ImageCtor) {
      throw new Error("This browser runtime cannot rasterize QR codes because DOM canvas primitives are unavailable.");
    }

    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await loadSvgImage(svgUrl, ImageCtor);
      const { rasterSize, supersampleScale } = getRasterDimensions(svg, size);

      const rasterCanvas = documentCtor.createElement("canvas");
      rasterCanvas.width = rasterSize;
      rasterCanvas.height = rasterSize;

      const rasterContext = rasterCanvas.getContext("2d");
      if (!rasterContext) {
        throw new Error("Failed to acquire a 2D rendering context for QR rasterization.");
      }

      rasterContext.clearRect(0, 0, rasterSize, rasterSize);
      rasterContext.drawImage(image, 0, 0, rasterSize, rasterSize);

      const outputCanvas = supersampleScale === 1 ? rasterCanvas : documentCtor.createElement("canvas");
      let outputContext = rasterContext;
      if (outputCanvas !== rasterCanvas) {
        outputCanvas.width = size;
        outputCanvas.height = size;

        const downsampleContext = outputCanvas.getContext("2d");
        if (!downsampleContext) {
          throw new Error("Failed to acquire a 2D rendering context for QR rasterization.");
        }

        outputContext = downsampleContext;
        configureRasterScaling(outputContext, true);
        outputContext.clearRect(0, 0, size, size);
        outputContext.drawImage(rasterCanvas, 0, 0, size, size);
      }

      snapSolidSvgFillPixels(outputContext, size, svg);
      const blob = await canvasToBlob(outputCanvas, format);
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  },
};

const browserRasterBackend: RasterBackend = {
  canRasterize() {
    const globals = getBrowserRasterGlobals();
    return typeof globals.OffscreenCanvas === "function" && typeof globals.createImageBitmap === "function";
  },
  async rasterize(svg, size, format) {
    const globals = getBrowserRasterGlobals();
    const OffscreenCanvasCtor = globals.OffscreenCanvas;
    const createImageBitmapFn = globals.createImageBitmap;

    if (!OffscreenCanvasCtor || !createImageBitmapFn) {
      throw new Error(
        `This browser runtime cannot export ${format.toUpperCase()} because OffscreenCanvas and createImageBitmap are both required.`,
      );
    }

    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const bitmap = await createImageBitmapFn(svgBlob);
    const { rasterSize, supersampleScale } = getRasterDimensions(svg, size);

    try {
      const rasterCanvas = new OffscreenCanvasCtor(rasterSize, rasterSize);
      const rasterContext = rasterCanvas.getContext("2d");
      if (!rasterContext) {
        throw new Error("Failed to acquire a 2D rendering context for QR rasterization.");
      }

      rasterContext.clearRect(0, 0, rasterSize, rasterSize);
      rasterContext.drawImage(bitmap, 0, 0, rasterSize, rasterSize);

      const outputCanvas = supersampleScale === 1 ? rasterCanvas : new OffscreenCanvasCtor(size, size);
      let outputContext = rasterContext;
      if (outputCanvas !== rasterCanvas) {
        const downsampleContext = outputCanvas.getContext("2d");
        if (!downsampleContext) {
          throw new Error("Failed to acquire a 2D rendering context for QR rasterization.");
        }

        outputContext = downsampleContext;
        configureRasterScaling(outputContext, true);
        outputContext.clearRect(0, 0, size, size);
        outputContext.drawImage(rasterCanvas, 0, 0, size, size);
      }

      snapSolidSvgFillPixels(outputContext, size, svg);
      const blob = await outputCanvas.convertToBlob({
        type: format === "png" ? "image/png" : "image/webp",
      });
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      if (typeof bitmap.close === "function") {
        bitmap.close();
      }
    }
  },
};

const sharpRasterBackend: RasterBackend = {
  canRasterize() {
    return !hasBrowserRasterPrimitives();
  },
  async rasterize(svg, size, format) {
    let sharpImport: unknown;
    try {
      sharpImport = await import("sharp");
    } catch {
      throw new Error(
        `Raster output requires the optional "sharp" dependency in Bun/Node. Install it to export ${format.toUpperCase()}.`,
      );
    }

    const sharpFactory = ((sharpImport as { default?: unknown }).default ?? sharpImport) as (input: Uint8Array) => {
      resize: (width: number, height: number, options?: Record<string, unknown>) => unknown;
    };

    const source = new TextEncoder().encode(svg);
    const pipeline = sharpFactory(source).resize(size, size, { fit: "fill" }) as {
      png: () => { toBuffer: () => Promise<Uint8Array | ArrayBuffer> };
      webp: () => { toBuffer: () => Promise<Uint8Array | ArrayBuffer> };
    };

    const buffer = await (format === "png" ? pipeline.png() : pipeline.webp()).toBuffer();
    return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  },
};

export async function rasterizeSvg(svg: string, size: number, format: RasterFormat): Promise<Uint8Array> {
  const backend = getRasterBackend();
  return backend.rasterize(svg, size, format);
}

export function getAlignedRasterSize(svg: string, minimumSize: number): number {
  if (!Number.isFinite(minimumSize) || minimumSize <= 0) {
    throw new Error("minimumSize must be a positive finite number.");
  }

  const { width, height } = parseSvgViewBox(svg);
  const viewBoxSize = Math.max(width, height);
  const roundedMinimumSize = Math.ceil(minimumSize);

  return Math.ceil(roundedMinimumSize / viewBoxSize) * viewBoxSize;
}

function getRasterBackend(): RasterBackend {
  if (browserDomRasterBackend.canRasterize()) {
    return browserDomRasterBackend;
  }

  if (browserRasterBackend.canRasterize()) {
    return browserRasterBackend;
  }

  if (sharpRasterBackend.canRasterize()) {
    return sharpRasterBackend;
  }

  return browserRasterBackend;
}

function hasBrowserRasterPrimitives(): boolean {
  const globals = getBrowserRasterGlobals();
  return typeof globals.OffscreenCanvas === "function" || typeof globals.createImageBitmap === "function";
}

function getBrowserRasterGlobals(): BrowserRasterGlobals {
  return globalThis as unknown as BrowserRasterGlobals;
}

async function loadSvgImage(svgUrl: string, ImageCtor: new () => BrowserImageElement): Promise<BrowserImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new ImageCtor();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode the SVG QR image for rasterization."));
    image.src = svgUrl;
  });
}

function shouldSupersampleSvg(svg: string): boolean {
  return svg.includes('shape-rendering="geometricPrecision"');
}

function getRasterDimensions(svg: string, size: number): { rasterSize: number; supersampleScale: number } {
  const supersampleScale = shouldSupersampleSvg(svg) ? DOM_RASTER_SUPERSAMPLE_SCALE : 1;
  return {
    rasterSize: size * supersampleScale,
    supersampleScale,
  };
}

function configureRasterScaling(context: BrowserCanvasContext, smooth: boolean): void {
  context.imageSmoothingEnabled = smooth;
  if (smooth) {
    context.imageSmoothingQuality = "high";
  }
}

function snapSolidSvgFillPixels(context: BrowserCanvasContext, size: number, svg: string): void {
  if (!context.getImageData || !context.putImageData) {
    return;
  }

  const colors = getSolidSvgFillColors(svg);
  if (colors.length === 0) {
    return;
  }

  const image = context.getImageData(0, 0, size, size);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3]! < 250) {
      continue;
    }

    const color = getNearestSnapColor(data[index]!, data[index + 1]!, data[index + 2]!, colors);
    if (!color) {
      continue;
    }

    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = 255;
  }

  context.putImageData(image, 0, 0);
}

function getNearestSnapColor(r: number, g: number, b: number, colors: readonly Rgb[]): Rgb | undefined {
  let nearest: Rgb | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const color of colors) {
    const redDistance = Math.abs(r - color.r);
    const greenDistance = Math.abs(g - color.g);
    const blueDistance = Math.abs(b - color.b);
    const maxChannelDistance = Math.max(redDistance, greenDistance, blueDistance);
    if (maxChannelDistance > 4) {
      continue;
    }

    const distance = redDistance * redDistance + greenDistance * greenDistance + blueDistance * blueDistance;
    if (distance < nearestDistance) {
      nearest = color;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function getSolidSvgFillColors(svg: string): Rgb[] {
  const colors = new Map<string, Rgb>();

  for (const match of svg.matchAll(/\sfill="(#[0-9a-fA-F]{3,8})"/g)) {
    const color = parseHexColor(match[1]!);
    if (!color) {
      continue;
    }

    colors.set(`${color.r},${color.g},${color.b}`, color);
  }

  return [...colors.values()];
}

function parseHexColor(value: string): Rgb | undefined {
  const hex = value.slice(1);

  if (hex.length === 3 || hex.length === 4) {
    return {
      r: Number.parseInt(hex[0]! + hex[0]!, 16),
      g: Number.parseInt(hex[1]! + hex[1]!, 16),
      b: Number.parseInt(hex[2]! + hex[2]!, 16),
    };
  }

  if (hex.length === 6 || hex.length === 8) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  return undefined;
}

function parseSvgViewBox(svg: string): { width: number; height: number } {
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
  const viewBox = viewBoxMatch?.[1];
  if (!viewBox) {
    throw new Error("The SVG is missing a valid viewBox and cannot be aligned for raster export.");
  }

  const rawParts = viewBox.split(/[\s,]+/).map((value) => Number.parseFloat(value));
  if (rawParts.length !== 4 || rawParts.some((value) => !Number.isFinite(value))) {
    throw new Error("The SVG viewBox could not be parsed for raster export.");
  }

  const width = rawParts[2]!;
  const height = rawParts[3]!;
  if (width <= 0 || height <= 0) {
    throw new Error("The SVG viewBox could not be parsed for raster export.");
  }

  return { width, height };
}

async function canvasToBlob(canvas: BrowserDomCanvas, format: RasterFormat): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob: Blob | null) => {
        if (!blob) {
          reject(new Error("Failed to encode the QR raster output."));
          return;
        }

        resolve(blob);
      },
      format === "png" ? "image/png" : "image/webp",
    );
  });
}
