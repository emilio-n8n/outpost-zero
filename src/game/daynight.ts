import { GAME } from '../config';

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface SkyDirection {
  x: number;
  y: number;
  z: number;
}

const TAU = Math.PI * 2;

export function normalizeClock(clock: number): number {
  return ((clock % 1) + 1) % 1;
}

export function sunDirection(clock: number): SkyDirection {
  const angle = (normalizeClock(clock) - 0.25) * TAU;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const z = -0.32;
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

export function moonDirection(clock: number): SkyDirection {
  const sun = sunDirection(clock);
  return { x: -sun.x, y: -sun.y, z: -sun.z };
}

export function daylight(clock: number): number {
  const sun = sunDirection(clock);
  const t = Math.min(1, Math.max(0, (sun.y + 0.08) / 0.32));
  return t * t * (3 - 2 * t);
}

export function nightStrength(clock: number): number {
  return 1 - daylight(clock);
}

export function isNight(clock: number): boolean {
  const c = normalizeClock(clock);
  return c >= GAME.nightStart || c < GAME.nightEnd;
}

export function isDeepNight(clock: number): boolean {
  const c = normalizeClock(clock);
  return c >= 0.845 || c < 0.195;
}

export function phase(clock: number): DayPhase {
  const c = normalizeClock(clock);
  if (c >= GAME.nightStart || c < GAME.nightEnd) return 'night';
  if (c < 0.305) return 'dawn';
  if (c >= 0.705) return 'dusk';
  return 'day';
}

export function formatClock(clock: number): string {
  const c = normalizeClock(clock);
  const totalMinutes = Math.floor(c * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function nightFraction(clock: number): number {
  const c = normalizeClock(clock);
  if (c < GAME.nightEnd) {
    return (c + (1 - GAME.nightStart)) / (1 - GAME.nightStart + GAME.nightEnd);
  }
  if (c >= GAME.nightStart) {
    return (c - GAME.nightStart) / (1 - GAME.nightStart + GAME.nightEnd);
  }
  return 0;
}

export function secondsUntilDusk(clock: number, cycleSeconds = GAME.cycleSeconds): number {
  const c = normalizeClock(clock);
  const remaining = c < GAME.nightStart ? GAME.nightStart - c : 1 - c + GAME.nightStart;
  return remaining * cycleSeconds;
}

export function secondsUntilDawn(clock: number, cycleSeconds = GAME.cycleSeconds): number {
  const c = normalizeClock(clock);
  return (c < GAME.nightEnd ? GAME.nightEnd - c : 1 - c + GAME.nightEnd) * cycleSeconds;
}

export function phaseLabel(clock: number): string {
  const p = phase(clock);
  return p === 'day' ? 'DAYLIGHT' : p === 'night' ? 'NIGHT' : p === 'dawn' ? 'FIRST LIGHT' : 'FALLING LIGHT';
}

export function skyPalette(clock: number): {
  top: number;
  horizon: number;
  bottom: number;
  fog: number;
  sun: number;
  ambient: number;
} {
  const d = daylight(clock);
  const night = 1 - d;
  const dusk = Math.max(0, 1 - Math.abs(sunDirection(clock).y) * 4.5) * (1 - night * 0.55);

  const nightTop = 0x03080d;
  const dayTop = 0x2b5c6e;
  const nightHorizon = 0x0b1a20;
  const dayHorizon = 0xb6b19a;
  const duskHorizon = 0xb45d3f;

  const mix = (a: number, b: number, t: number): number => {
    const ar = (a >> 16) & 255;
    const ag = (a >> 8) & 255;
    const ab = a & 255;
    const br = (b >> 16) & 255;
    const bg = (b >> 8) & 255;
    const bb = b & 255;
    return (
      (Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)
    );
  };

  return {
    top: mix(nightTop, dayTop, d),
    horizon: mix(mix(nightHorizon, dayHorizon, d), duskHorizon, dusk * 0.62),
    bottom: mix(0x050b0e, 0x323c38, d),
    fog: mix(mix(0x07121a, 0x8b9c93, d), 0x6b443c, dusk * 0.35),
    sun: mix(0x9fc6ff, 0xffc286, Math.min(1, dusk * 1.4 + 0.15)),
    ambient: 0.22 + d * 0.78,
  };
}
