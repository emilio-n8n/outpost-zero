import { describe, expect, it } from 'vitest';
import { ENEMY_BASE, chooseEnemyType, nightMaxAlive, scaledEnemyStats } from '../src/game/scaling';

describe('night scaling', () => {
  it('increases enemy health and damage across nights', () => {
    const first = scaledEnemyStats('stalker', 1);
    const fourth = scaledEnemyStats('stalker', 4);
    expect(first.health).toBe(ENEMY_BASE.stalker.health);
    expect(fourth.health).toBeGreaterThan(first.health);
    expect(fourth.damage).toBeGreaterThan(first.damage);
    expect(first.windup).toBe(ENEMY_BASE.stalker.windup);
  });

  it('scales the simultaneous threat', () => {
    expect(nightMaxAlive(1)).toBeGreaterThanOrEqual(3);
    expect(nightMaxAlive(8)).toBeGreaterThan(nightMaxAlive(1));
    expect(nightMaxAlive(50)).toBeLessThanOrEqual(11);
  });

  it('unlocks new archetypes on later nights', () => {
    expect(chooseEnemyType(1, 0.1)).toBe('stalker');
    expect(chooseEnemyType(3, 0.1)).toBe('brute');
    expect(chooseEnemyType(4, 0.1)).toBe('spitter');
    expect(chooseEnemyType(3, 0.9)).toBe('stalker');
  });
});
