import { describe, expect, it } from 'vitest';
import {
  daylight,
  formatClock,
  isDeepNight,
  isNight,
  normalizeClock,
  secondsUntilDawn,
  secondsUntilDusk,
  sunDirection,
} from '../src/game/daynight';

describe('day/night cycle', () => {
  it('identifies night on both sides of midnight', () => {
    expect(isNight(0.9)).toBe(true);
    expect(isNight(0.05)).toBe(true);
    expect(isNight(0.5)).toBe(false);
    expect(isNight(0.79)).toBe(true);
  });

  it('formats the local clock', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(0.5)).toBe('12:00');
    expect(formatClock(0.25)).toBe('06:00');
    expect(formatClock(0.999)).toMatch(/23:5/);
    expect(normalizeClock(-0.25)).toBe(0.75);
  });

  it('places the sun above the horizon at noon and below at night', () => {
    expect(sunDirection(0.5).y).toBeGreaterThan(0.9);
    expect(sunDirection(0).y).toBeLessThan(0);
    expect(daylight(0.5)).toBeGreaterThan(0.95);
    expect(daylight(0)).toBeLessThan(0.05);
  });

  it('provides countdowns that wrap across the night', () => {
    expect(secondsUntilDusk(0.5, 480)).toBeGreaterThan(0);
    expect(secondsUntilDawn(0.9, 480)).toBeGreaterThan(0);
    expect(secondsUntilDawn(0.1, 480)).toBeLessThan(480);
  });

  it('detects deep night for environmental danger', () => {
    expect(isDeepNight(0.9)).toBe(true);
    expect(isDeepNight(0.1)).toBe(true);
    expect(isDeepNight(0.5)).toBe(false);
  });
});
