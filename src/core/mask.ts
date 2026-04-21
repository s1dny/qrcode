import type { ErrorCorrection } from "../types.ts";

import { getFormatBits } from "./spec.ts";

export function pickBestMask(modules: boolean[][], functionModules: boolean[][], ecl: ErrorCorrection): number {
  const size = modules.length;
  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row) => row.slice());
    applyMask(candidate, functionModules, mask);
    drawFormatBits(candidate, functionModules, ecl, mask);
    const penalty = getPenaltyScore(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
  }

  return bestMask;
}

export function applyMask(modules: boolean[][], functionModules: boolean[][], mask: number): void {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (functionModules[y]![x]) {
        continue;
      }
      if (getMaskBit(mask, x, y)) {
        modules[y]![x] = !modules[y]![x];
      }
    }
  }
}

export function drawFormatBits(modules: boolean[][], functionModules: boolean[][], ecl: ErrorCorrection, mask: number): void {
  const size = modules.length;
  const bits = getFormatBits(ecl, mask);
  const setFunction = (x: number, y: number, dark: boolean): void => {
    modules[y]![x] = dark;
    functionModules[y]![x] = true;
  };

  for (let i = 0; i <= 5; i++) {
    setFunction(8, i, ((bits >>> i) & 1) !== 0);
  }
  setFunction(8, 7, ((bits >>> 6) & 1) !== 0);
  setFunction(8, 8, ((bits >>> 7) & 1) !== 0);
  setFunction(7, 8, ((bits >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i++) {
    setFunction(14 - i, 8, ((bits >>> i) & 1) !== 0);
  }

  for (let i = 0; i < 8; i++) {
    setFunction(size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
  }
  for (let i = 8; i < 15; i++) {
    setFunction(8, size - 15 + i, ((bits >>> i) & 1) !== 0);
  }
  setFunction(8, size - 8, true);
}

function getPenaltyScore(modules: boolean[][], size: number): number {
  let result = 0;

  for (let y = 0; y < size; y++) {
    let runColor = modules[y]![0]!;
    let runLength = 1;

    for (let x = 1; x < size; x++) {
      const color = modules[y]![x]!;
      if (color === runColor) {
        runLength++;
      } else {
        result += getRunPenalty(runLength);
        runColor = color;
        runLength = 1;
      }
    }
    result += getRunPenalty(runLength);
  }

  for (let x = 0; x < size; x++) {
    let runColor = modules[0]![x]!;
    let runLength = 1;

    for (let y = 1; y < size; y++) {
      const color = modules[y]![x]!;
      if (color === runColor) {
        runLength++;
      } else {
        result += getRunPenalty(runLength);
        runColor = color;
        runLength = 1;
      }
    }
    result += getRunPenalty(runLength);
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y]![x]!;
      if (color === modules[y]![x + 1] && color === modules[y + 1]![x] && color === modules[y + 1]![x + 1]) {
        result += 3;
      }
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x <= size - 11; x++) {
      if (hasFinderLikePatternAt((index) => modules[y]![x + index]!)) {
        result += 40;
      }
    }
  }

  for (let x = 0; x < size; x++) {
    for (let y = 0; y <= size - 11; y++) {
      if (hasFinderLikePatternAt((index) => modules[y + index]![x]!)) {
        result += 40;
      }
    }
  }

  let darkCount = 0;
  for (const row of modules) {
    for (const cell of row) {
      if (cell) {
        darkCount++;
      }
    }
  }

  const total = size * size;
  const k = Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1;
  result += k * 10;

  return result;
}

function getRunPenalty(runLength: number): number {
  if (runLength < 5) {
    return 0;
  }
  return runLength - 2;
}

function hasFinderLikePatternAt(getBit: (index: number) => boolean): boolean {
  const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pattern2 = [false, false, false, false, true, false, true, true, true, false, true];

  for (let i = 0; i < 11; i++) {
    if (getBit(i) !== pattern1[i]) {
      break;
    }
    if (i === 10) {
      return true;
    }
  }

  for (let i = 0; i < 11; i++) {
    if (getBit(i) !== pattern2[i]) {
      return false;
    }
  }

  return true;
}

function getMaskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new RangeError(`Unsupported QR mask: ${mask}`);
  }
}
