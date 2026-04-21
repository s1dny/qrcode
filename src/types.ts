export type ErrorCorrection = "L" | "M" | "Q" | "H";
export type QrCodeFormat = "svg" | "png" | "webp";

export type LogoSpec = {
  source: string;
  width: number;
  height: number;
  padding?: number;
};

export type QrCodeOptions = {
  errorCorrection?: ErrorCorrection;
  foreground?: string;
  background?: string;
  rounded?: boolean;
  logo?: LogoSpec;
  scale?: number;
  margin?: number;
};

export type QrCodeRenderOptions = Omit<QrCodeOptions, "scale">;

export type ResolvedRenderOptions = {
  errorCorrection: ErrorCorrection;
  foreground: string;
  background: string;
  rounded: boolean;
  logo?: LogoSpec;
  margin: number;
};

export type ResolvedQrCodeOptions = ResolvedRenderOptions & {
  scale: number;
};

export type QrMatrix = {
  readonly version: number;
  readonly size: number;
  readonly errorCorrection: ErrorCorrection;
  readonly modules: readonly (readonly boolean[])[];
};
