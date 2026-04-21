export type ErrorCorrection = "L" | "M" | "Q" | "H";
export type QxFormat = "svg" | "png" | "webp";

export type LogoSpec = {
  source: string;
  width: number;
  height: number;
  padding?: number;
};

export type QxOptions = {
  errorCorrection?: ErrorCorrection;
  foreground?: string;
  background?: string;
  rounded?: boolean;
  logo?: LogoSpec;
  scale?: number;
  margin?: number;
};

export type QxRenderOptions = Omit<QxOptions, "scale">;

export type ResolvedRenderOptions = {
  errorCorrection: ErrorCorrection;
  foreground: string;
  background: string;
  rounded: boolean;
  logo?: LogoSpec;
  margin: number;
};

export type ResolvedQxOptions = ResolvedRenderOptions & {
  scale: number;
};

export type QrMatrix = {
  readonly version: number;
  readonly size: number;
  readonly errorCorrection: ErrorCorrection;
  readonly modules: readonly (readonly boolean[])[];
};
