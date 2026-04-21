import type {
  ErrorCorrection,
  QrCodeOptions,
  QrCodeRenderOptions,
  ResolvedQrCodeOptions,
  ResolvedRenderOptions,
} from "./types.js";

export const QRCODE_DEFAULTS = {
  errorCorrection: "M" as ErrorCorrection,
  foreground: "#000",
  background: "#fff",
  rounded: true,
  margin: 0,
  scale: 8,
} as const;

export function resolveRenderOptions(opts: QrCodeRenderOptions = {}): ResolvedRenderOptions {
  return {
    errorCorrection: opts.errorCorrection ?? QRCODE_DEFAULTS.errorCorrection,
    foreground: opts.foreground ?? QRCODE_DEFAULTS.foreground,
    background: opts.background ?? QRCODE_DEFAULTS.background,
    rounded: opts.rounded ?? QRCODE_DEFAULTS.rounded,
    logo: opts.logo,
    margin: opts.margin ?? QRCODE_DEFAULTS.margin,
  };
}

export function resolveQrCodeOptions(opts: QrCodeOptions): ResolvedQrCodeOptions {
  return {
    ...resolveRenderOptions(opts),
    scale: opts.scale ?? QRCODE_DEFAULTS.scale,
  };
}
