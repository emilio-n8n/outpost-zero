import { ENEMY_SCALING } from '../config';

export type EnemyType = 'stalker' | 'brute' | 'spitter' | 'warden';

export interface EnemyBaseStats {
  health: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  windup: number;
  detection: number;
  radius: number;
  height: number;
  structureDamage: number;
  score: number;
}

export interface EnemyStats extends EnemyBaseStats {
  night: number;
  type: EnemyType;
}

export const ENEMY_BASE: Record<EnemyType, EnemyBaseStats> = {
  stalker: {
    health: 52,
    speed: 4.1,
    damage: 10,
    attackRange: 1.95,
    attackCooldown: 1.35,
    windup: 0.52,
    detection: 23,
    radius: 0.52,
    height: 1.32,
    structureDamage: 12,
    score: 1,
  },
  brute: {
    health: 155,
    speed: 2.55,
    damage: 22,
    attackRange: 2.35,
    attackCooldown: 2.25,
    windup: 0.92,
    detection: 21,
    radius: 0.92,
    height: 2.2,
    structureDamage: 42,
    score: 4,
  },
  spitter: {
    health: 74,
    speed: 2.9,
    damage: 12,
    attackRange: 16,
    attackCooldown: 2.7,
    windup: 0.72,
    detection: 30,
    radius: 0.58,
    height: 1.75,
    structureDamage: 8,
    score: 2,
  },
  warden: {
    health: 620,
    speed: 3.0,
    damage: 32,
    attackRange: 3.1,
    attackCooldown: 2.1,
    windup: 1.05,
    detection: 44,
    radius: 1.3,
    height: 3.0,
    structureDamage: 70,
    score: 12,
  },
};

export function scaledEnemyStats(type: EnemyType, night: number): EnemyStats {
  const base = ENEMY_BASE[type];
  const tier = Math.max(0, night - 1);
  return {
    ...base,
    night,
    type,
    health: Math.round(base.health * (1 + tier * ENEMY_SCALING.xpScale)),
    damage: Math.round(base.damage * (1 + tier * ENEMY_SCALING.damageScale) * 10) / 10,
    speed: base.speed * (1 + Math.min(0.18, tier * 0.015)),
  };
}

export function nightMaxAlive(night: number): number {
  return Math.min(
    ENEMY_SCALING.maxAliveCap,
    Math.max(2, Math.floor(ENEMY_SCALING.baseMaxAlive + night * ENEMY_SCALING.maxAlivePerNight)),
  );
}

export function spawnIntervalForNight(night: number): number {
  return Math.max(
    ENEMY_SCALING.spawnIntervalMin,
    ENEMY_SCALING.spawnInterval - night * 0.55,
  );
}

export function chooseEnemyType(night: number, roll: number): EnemyType {
  if (night >= 4 && roll < 0.18) return 'spitter';
  if (night >= 3 && roll < 0.34) return 'brute';
  if (night >= 2 && roll < 0.42) return 'spitter';
  if (night >= 2 && roll < 0.62) return 'brute';
  return 'stalker';
}
