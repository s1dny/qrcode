import type { ErrorCorrection } from "../types.ts";

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

const ECC_CODEWORDS_PER_BLOCK: Record<ErrorCorrection, readonly number[]> = {
  L: [
    -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 28, 30, 26, 28, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};

const NUM_ERROR_CORRECTION_BLOCKS: Record<ErrorCorrection, readonly number[]> = {
  L: [
    -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20,
    21, 22, 24, 25,
  ],
  M: [
    -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35,
    37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48,
    51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54,
    57, 60, 63, 66, 70, 74, 77, 81,
  ],
};

const FORMAT_ECL_BITS: Record<ErrorCorrection, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

export function getCharCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

export function getNumErrorCorrectionBlocks(version: number, ecl: ErrorCorrection): number {
  return NUM_ERROR_CORRECTION_BLOCKS[ecl][version]!;
}

export function getErrorCorrectionCodewordsPerBlock(version: number, ecl: ErrorCorrection): number {
  return ECC_CODEWORDS_PER_BLOCK[ecl][version]!;
}

export function getNumDataCodewords(version: number, ecl: ErrorCorrection): number {
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  return rawCodewords - getErrorCorrectionCodewordsPerBlock(version, ecl) * getNumErrorCorrectionBlocks(version, ecl);
}

export function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) {
      result -= 36;
    }
  }
  return result;
}

export function getAlignmentPatternPositions(version: number): number[] {
  if (version === 1) {
    return [];
  }

  const numAlign = Math.floor(version / 7) + 2;
  const size = getSizeForVersion(version);
  const step = version === 32 ? 26 : Math.floor((version * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;
  const result = [6];

  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }

  return result;
}

export function getFormatBits(ecl: ErrorCorrection, mask: number): number {
  const data = (FORMAT_ECL_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

export function getVersionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
  }
  return (version << 12) | rem;
}

export function getSizeForVersion(version: number): number {
  return version * 4 + 17;
}
