import { encode } from "./core.js";
import { normalizeLogo } from "./logo.js";
import { resolveQrCodeOptions } from "./options.js";
import { getAlignedRasterSize, rasterizeSvg } from "./raster.js";
import { toSvg } from "./svg.js";

import type { ErrorCorrection, LogoSpec, QrCodeFormat, QrCodeOptions, QrMatrix } from "./types.js";

export type { ErrorCorrection, LogoSpec, QrCodeOptions, QrMatrix };

export { encode, getAlignedRasterSize, rasterizeSvg, toSvg };

export async function qrcode(data: string, opts: QrCodeOptions & { format: "svg" }): Promise<string>;
export async function qrcode(data: string, opts: QrCodeOptions & { format: "png" }): Promise<Uint8Array>;
export async function qrcode(data: string, opts: QrCodeOptions & { format: "webp" }): Promise<Uint8Array>;
export async function qrcode(
  data: string,
  opts: QrCodeOptions & { format: QrCodeFormat },
): Promise<string | Uint8Array> {
  const resolved = resolveQrCodeOptions(opts);
  const matrix = encode(data, resolved.errorCorrection);
  const logo = await normalizeLogo(resolved.logo);
  const svg = toSvg(matrix, {
    ...resolved,
    logo,
  });

  if (opts.format === "svg") {
    return svg;
  }

  const size = (matrix.size + resolved.margin * 2) * resolved.scale;
  return rasterizeSvg(svg, size, opts.format);
}
