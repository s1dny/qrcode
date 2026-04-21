const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

for (let i = 0, x = 1; i < 255; i++) {
  GF_EXP[i] = x;
  GF_LOG[x] = i;
  x <<= 1;
  if (x & 0x100) {
    x ^= 0x11d;
  }
}

for (let i = 255; i < GF_EXP.length; i++) {
  GF_EXP[i] = getByte(GF_EXP, i - 255);
}

export function reedSolomonComputeDivisor(degree: number): Uint8Array {
  let result = new Uint8Array([1]);

  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(result.length + 1);
    const factor = getByte(GF_EXP, i);

    for (let j = 0; j < result.length; j++) {
      const value = getByte(result, j);
      xorInto(next, j, value);
      xorInto(next, j + 1, multiplyGf(value, factor));
    }

    result = next;
  }

  return result;
}

export function reedSolomonComputeRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length - 1);

  for (const byte of data) {
    const factor = byte ^ getByte(result, 0);
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;

    for (let i = 0; i < result.length; i++) {
      xorInto(result, i, multiplyGf(getByte(divisor, i + 1), factor));
    }
  }

  return result;
}

function multiplyGf(x: number, y: number): number {
  if (x === 0 || y === 0) {
    return 0;
  }

  return getByte(GF_EXP, getByte(GF_LOG, x) + getByte(GF_LOG, y));
}

function xorInto(target: Uint8Array, index: number, value: number): void {
  target[index] = getByte(target, index) ^ value;
}

function getByte(source: Uint8Array, index: number): number {
  const value = source[index];
  if (value === undefined) {
    throw new RangeError(`Expected byte at index ${index}.`);
  }

  return value;
}
