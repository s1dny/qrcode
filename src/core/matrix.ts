import { getAlignmentPatternPositions, getSizeForVersion, getVersionBits } from "./spec.js";

export function buildFunctionPatterns(version: number): {
  modules: boolean[][];
  functionModules: boolean[][];
} {
  const size = getSizeForVersion(version);
  const modules = makeGrid(size, false);
  const functionModules = makeGrid(size, false);

  const setFunction = (x: number, y: number, dark: boolean): void => {
    modules[y]![x] = dark;
    functionModules[y]![x] = true;
  };

  const reserveFunction = (x: number, y: number): void => {
    functionModules[y]![x] = true;
  };

  drawFinderPattern(modules, functionModules, 3, 3);
  drawFinderPattern(modules, functionModules, size - 4, 3);
  drawFinderPattern(modules, functionModules, 3, size - 4);

  for (let i = 0; i < size; i++) {
    if (!functionModules[6]![i]) {
      setFunction(i, 6, i % 2 === 0);
    }
    if (!functionModules[i]![6]) {
      setFunction(6, i, i % 2 === 0);
    }
  }

  const alignmentPositions = getAlignmentPatternPositions(version);
  for (const y of alignmentPositions) {
    for (const x of alignmentPositions) {
      if (functionModules[y]![x]) {
        continue;
      }
      drawAlignmentPattern(modules, functionModules, x, y);
    }
  }

  for (let i = 0; i <= 5; i++) {
    reserveFunction(8, i);
    reserveFunction(i, 8);
  }
  reserveFunction(8, 7);
  reserveFunction(8, 8);
  reserveFunction(7, 8);
  for (let i = 0; i < 8; i++) {
    reserveFunction(size - 1 - i, 8);
  }
  for (let i = 0; i < 7; i++) {
    reserveFunction(8, size - 1 - i);
  }
  setFunction(8, size - 8, true);

  if (version >= 7) {
    drawVersionBits(modules, functionModules, version);
  }

  return { modules, functionModules };
}

export function placeCodewords(modules: boolean[][], functionModules: boolean[][], codewords: Uint8Array): void {
  const size = modules.length;
  const bits = expandCodewordsToBits(codewords);
  let bitIndex = 0;
  let upwards = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right--;
    }

    for (let i = 0; i < size; i++) {
      const y = upwards ? size - 1 - i : i;
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx;
        if (functionModules[y]![x]) {
          continue;
        }

        modules[y]![x] = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        bitIndex++;
      }
    }

    upwards = !upwards;
  }
}

function drawFinderPattern(modules: boolean[][], functionModules: boolean[][], centerX: number, centerY: number): void {
  const size = modules.length;

  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) {
        continue;
      }

      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const dark = dist !== 2 && dist !== 4;
      modules[y]![x] = dark;
      functionModules[y]![x] = true;
    }
  }
}

function drawAlignmentPattern(modules: boolean[][], functionModules: boolean[][], centerX: number, centerY: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      modules[centerY + dy]![centerX + dx] = dark;
      functionModules[centerY + dy]![centerX + dx] = true;
    }
  }
}

function drawVersionBits(modules: boolean[][], functionModules: boolean[][], version: number): void {
  const size = modules.length;
  const bits = getVersionBits(version);

  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);

    modules[b]![a] = bit;
    functionModules[b]![a] = true;
    modules[a]![b] = bit;
    functionModules[a]![b] = true;
  }
}

function expandCodewordsToBits(codewords: Uint8Array): number[] {
  const bits: number[] = [];

  for (const codeword of codewords) {
    for (let bit = 7; bit >= 0; bit--) {
      bits.push((codeword >>> bit) & 1);
    }
  }

  return bits;
}

function makeGrid(size: number, initial: boolean): boolean[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => initial));
}
