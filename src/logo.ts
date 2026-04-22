import type { LogoSpec } from "./types.js";

export async function normalizeLogo(logo?: LogoSpec): Promise<LogoSpec | undefined> {
  if (!logo) {
    return undefined;
  }

  return {
    ...logo,
    source: logo.source === undefined ? undefined : await normalizeLogoSource(logo.source),
  };
}

async function normalizeLogoSource(source: string): Promise<string> {
  if (source.startsWith("data:")) {
    return source;
  }

  if (isServerRuntime()) {
    return normalizeServerLogoSource(source);
  }

  return normalizeBrowserLogoSource(source);
}

async function normalizeServerLogoSource(source: string): Promise<string> {
  if (isHttpUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch logo URL: ${source} (${response.status} ${response.statusText})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") ?? inferMimeType(source);
    return toDataUrl(bytes, mimeType);
  }

  const fs = await import("node:fs/promises");
  const file = await fs.readFile(source);
  return toDataUrl(new Uint8Array(file), inferMimeType(source));
}

async function normalizeBrowserLogoSource(source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch logo URL: ${source} (${response.status} ${response.statusText})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") ?? inferMimeType(source);
  return toDataUrl(bytes, mimeType);
}

function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const chunk = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);

    output += alphabet[(chunk >>> 18) & 63];
    output += alphabet[(chunk >>> 12) & 63];
    output += b === undefined ? "=" : alphabet[(chunk >>> 6) & 63];
    output += c === undefined ? "=" : alphabet[chunk & 63];
  }

  return output;
}

function inferMimeType(source: string): string {
  const value = source.toLowerCase();
  if (value.endsWith(".png")) {
    return "image/png";
  }
  if (value.endsWith(".webp")) {
    return "image/webp";
  }
  if (value.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (value.endsWith(".jpg") || value.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (value.endsWith(".gif")) {
    return "image/gif";
  }
  return "application/octet-stream";
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isServerRuntime(): boolean {
  return typeof process !== "undefined" && !!(process.versions?.node || process.versions?.bun);
}
