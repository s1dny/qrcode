import type { ErrorCorrection, QxOptions, QxRenderOptions, ResolvedQxOptions, ResolvedRenderOptions } from "./types.ts";

export const QX_DEFAULTS = {
  errorCorrection: "M" as ErrorCorrection,
  foreground: "#000",
  background: "#fff",
  rounded: true,
  margin: 0,
  scale: 8,
};

export function resolveRenderOptions(opts: QxRenderOptions = {}): ResolvedRenderOptions {
  return {
    errorCorrection: opts.errorCorrection ?? QX_DEFAULTS.errorCorrection,
    foreground: opts.foreground ?? QX_DEFAULTS.foreground,
    background: opts.background ?? QX_DEFAULTS.background,
    rounded: opts.rounded ?? QX_DEFAULTS.rounded,
    logo: opts.logo,
    margin: opts.margin ?? QX_DEFAULTS.margin,
  };
}

export function resolveQxOptions(opts: QxOptions): ResolvedQxOptions {
  return {
    ...resolveRenderOptions(opts),
    scale: opts.scale ?? QX_DEFAULTS.scale,
  };
}
