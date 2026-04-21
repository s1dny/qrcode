import { encode } from "./core.ts";
import { normalizeLogo } from "./logo.ts";
import { resolveQxOptions } from "./options.ts";
import { rasterizeSvg } from "./raster.ts";
import { toSvg } from "./svg.ts";

import type { ErrorCorrection, LogoSpec, QrMatrix, QxFormat, QxOptions } from "./types.ts";

export type { ErrorCorrection, LogoSpec, QrMatrix, QxOptions };

export { encode, toSvg };

export async function qxcode(data: string, opts: QxOptions & { format: "svg" }): Promise<string>;
export async function qxcode(data: string, opts: QxOptions & { format: "png" }): Promise<Uint8Array>;
export async function qxcode(data: string, opts: QxOptions & { format: "webp" }): Promise<Uint8Array>;
export async function qxcode(data: string, opts: QxOptions & { format: QxFormat }): Promise<string | Uint8Array> {
  const resolved = resolveQxOptions(opts);
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
