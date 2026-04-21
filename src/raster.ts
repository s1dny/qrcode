import type { QrCodeFormat } from "./types.js";

type RasterFormat = Exclude<QrCodeFormat, "svg">;

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
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: "low" | "medium" | "high";
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
      const supersampleScale = shouldSupersampleSvg(svg) ? DOM_RASTER_SUPERSAMPLE_SCALE : 1;
      const rasterSize = size * supersampleScale;

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
      if (outputCanvas !== rasterCanvas) {
        outputCanvas.width = size;
        outputCanvas.height = size;

        const outputContext = outputCanvas.getContext("2d");
        if (!outputContext) {
          throw new Error("Failed to acquire a 2D rendering context for QR rasterization.");
        }

        outputContext.imageSmoothingEnabled = true;
        outputContext.imageSmoothingQuality = "high";
        outputContext.clearRect(0, 0, size, size);
        outputContext.drawImage(rasterCanvas, 0, 0, size, size);
      }

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

    try {
      const canvas = new OffscreenCanvasCtor(size, size);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to acquire a 2D rendering context for QR rasterization.");
      }

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(bitmap, 0, 0, size, size);

      const blob = await canvas.convertToBlob({
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
