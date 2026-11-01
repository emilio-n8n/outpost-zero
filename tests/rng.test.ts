import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 20; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces values in range', () => {
    const rng = new Rng('outpost-zero');
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const ranged = rng.range(-4, 9);
      expect(ranged).toBeGreaterThanOrEqual(-4);
      expect(ranged).toBeLessThanOrEqual(9);
    }
  });

  it('forks into different streams', () => {
    const rng = new Rng('seed');
    expect(rng.fork('terrain').next()).not.toBe(rng.fork('props').next());
  });
});
