import type { ErrorCorrection, QrMatrix } from "./types.ts";

import { applyMask, drawFormatBits, pickBestMask } from "./core/mask.ts";
import { buildFunctionPatterns, placeCodewords } from "./core/matrix.ts";
import { reedSolomonComputeDivisor, reedSolomonComputeRemainder } from "./core/reed-solomon.ts";
import {
  MAX_VERSION,
  MIN_VERSION,
  getCharCountBits,
  getErrorCorrectionCodewordsPerBlock,
  getNumDataCodewords,
  getNumErrorCorrectionBlocks,
  getNumRawDataModules,
} from "./core/spec.ts";

export function encode(data: string, ecl: ErrorCorrection = "M"): QrMatrix {
  const payload = new TextEncoder().encode(data);
  const version = pickVersion(payload.length, ecl);
  const dataCodewords = buildDataCodewords(payload, version, ecl);
  const allCodewords = addErrorCorrection(dataCodewords, version, ecl);
  const { modules, functionModules } = buildFunctionPatterns(version);

  placeCodewords(modules, functionModules, allCodewords);

  const chosenMask = pickBestMask(modules, functionModules, ecl);
  applyMask(modules, functionModules, chosenMask);
  drawFormatBits(modules, functionModules, ecl, chosenMask);

  return {
    version,
    size: modules.length,
    errorCorrection: ecl,
    modules,
  };
}

function pickVersion(byteLength: number, ecl: ErrorCorrection): number {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    const capacityBits = getNumDataCodewords(version, ecl) * 8;
    const lengthBits = getCharCountBits(version);
    const requiredBits = 4 + lengthBits + byteLength * 8;
    if (requiredBits <= capacityBits) {
      return version;
    }
  }

  throw new Error(`Input is too long to fit in a QR code at error correction level ${ecl}.`);
}

function buildDataCodewords(bytes: Uint8Array, version: number, ecl: ErrorCorrection): Uint8Array {
  const capacity = getNumDataCodewords(version, ecl);
  const capacityBits = capacity * 8;
  const bits: number[] = [];

  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, getCharCountBits(version));
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const result = new Uint8Array(capacity);
  const dataByteLength = bits.length / 8;

  for (let i = 0; i < dataByteLength; i++) {
    let value = 0;
    for (let bit = 0; bit < 8; bit++) {
      value = (value << 1) | bits[i * 8 + bit]!;
    }
    result[i] = value;
  }

  for (let i = dataByteLength; i < result.length; i++) {
    result[i] = (i - dataByteLength) % 2 === 0 ? 0xec : 0x11;
  }

  return result;
}

function addErrorCorrection(dataCodewords: Uint8Array, version: number, ecl: ErrorCorrection): Uint8Array {
  const numBlocks = getNumErrorCorrectionBlocks(version, ecl);
  const blockEccLen = getErrorCorrectionCodewordsPerBlock(version, ecl);
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = reedSolomonComputeDivisor(blockEccLen);
  const blocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let cursor = 0;
  let maxDataLen = 0;

  for (let blockIndex = 0; blockIndex < numBlocks; blockIndex++) {
    const dataLen = shortBlockLen - blockEccLen + (blockIndex >= numShortBlocks ? 1 : 0);
    const block = dataCodewords.slice(cursor, cursor + dataLen);
    cursor += dataLen;
    blocks.push(block);
    eccBlocks.push(reedSolomonComputeRemainder(block, divisor));
    maxDataLen = Math.max(maxDataLen, block.length);
  }

  const output = new Uint8Array(rawCodewords);
  let out = 0;

  for (let i = 0; i < maxDataLen; i++) {
    for (const block of blocks) {
      if (i < block.length) {
        output[out++] = block[i]!;
      }
    }
  }

  for (let i = 0; i < blockEccLen; i++) {
    for (const block of eccBlocks) {
      output[out++] = block[i]!;
    }
  }

  return output;
}

function appendBits(bits: number[], value: number, length: number): void {
  if (length < 0 || length > 31 || value >>> length !== 0) {
    throw new RangeError(`Cannot append ${length} bits from value ${value}.`);
  }

  for (let i = length - 1; i >= 0; i--) {
    bits.push((value >>> i) & 1);
  }
}
