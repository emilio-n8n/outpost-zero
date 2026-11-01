const fade = (t: number): number => t * t * (3 - 2 * t);

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  const top = a + (b - a) * xf;
  const bottom = c + (d - c) * xf;
  return top + (bottom - top) * yf;
}

export function fbm2D(
  x: number,
  y: number,
  seed: number,
  octaves = 4,
  lacunarity = 2.03,
  gain = 0.5,
): number {
  let frequency = 1;
  let amplitude = 1;
  let value = 0;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, y * frequency, seed + i * 101) * amplitude;
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / total;
}

export function ridgeNoise(x: number, y: number, seed: number, octaves = 4): number {
  let frequency = 1;
  let amplitude = 0.5;
  let value = 0;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * frequency, y * frequency, seed + i * 73) * 2 - 1);
    value += n * n * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }
  return value / total;
}

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
