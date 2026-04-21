import type { QrCodeFormat } from "./types.js";

type RasterFormat = Exclude<QrCodeFormat, "svg">;

type RasterBackend = {
  canRasterize: () => boolean;
  rasterize: (svg: string, size: number, format: RasterFormat) => Promise<Uint8Array>;
};

type BrowserBitmap = {
  close?: () => void;
};

type BrowserCanvasContext = {
  clearRect: (...args: number[]) => void;
  drawImage: (...args: unknown[]) => void;
};

type BrowserOffscreenCanvas = {
  getContext: (kind: "2d") => BrowserCanvasContext | null;
  convertToBlob: (options: { type: string }) => Promise<Blob>;
};

type BrowserRasterGlobals = {
  OffscreenCanvas?: new (width: number, height: number) => BrowserOffscreenCanvas;
  createImageBitmap?: (image: Blob) => Promise<BrowserBitmap>;
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
