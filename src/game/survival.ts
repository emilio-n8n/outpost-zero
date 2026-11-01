import { PLAYER } from '../config';
import { isDeepNight } from './daynight';

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function tickHunger(hunger: number, dt: number): number {
  return clamp(hunger - PLAYER.hungerDrain * dt, 0, PLAYER.maxHunger);
}

export function starvationDamage(hunger: number, dt: number): number {
  return hunger <= 0 ? PLAYER.starvationDamage * dt : 0;
}

export function coldDamage(
  clock: number,
  dt: number,
  nearWarmth: boolean,
  nightNumber: number,
  exposureSeconds: number,
): number {
  if (!isDeepNight(clock) || nearWarmth || exposureSeconds < PLAYER.coldDelay) return 0;
  const intensity = 1 + Math.max(0, nightNumber - 1) * PLAYER.coldDamagePerNight;
  return PLAYER.coldDamage * intensity * dt;
}

export function tickStamina(
  stamina: number,
  dt: number,
  sprinting: boolean,
  moving: boolean,
  sinceSprint: number,
): number {
  if (sprinting && moving) {
    return clamp(stamina - PLAYER.staminaDrain * dt, 0, PLAYER.maxStamina);
  }
  if (sinceSprint >= PLAYER.staminaDelay) {
    return clamp(stamina + PLAYER.staminaRegen * dt, 0, PLAYER.maxStamina);
  }
  return stamina;
}

export function healthRegen(
  health: number,
  hunger: number,
  dt: number,
  sinceDamage: number,
  inCombat: boolean,
): number {
  if (health <= 0 || hunger < 60 || sinceDamage < PLAYER.healthRegenDelay || inCombat) {
    return health;
  }
  return clamp(health + PLAYER.healthRegen * dt, 0, PLAYER.maxHealth);
}

export function fallDamage(impactSpeed: number): number {
  if (impactSpeed <= PLAYER.fallDamageThreshold) return 0;
  return (impactSpeed - PLAYER.fallDamageThreshold) * PLAYER.fallDamageScale;
}

export function applyDamage(health: number, amount: number): number {
  return clamp(health - Math.max(0, amount), 0, PLAYER.maxHealth);
}

export function applyHeal(health: number, amount: number): number {
  return clamp(health + Math.max(0, amount), 0, PLAYER.maxHealth);
}

export function applyFood(hunger: number, amount: number): number {
  return clamp(hunger + Math.max(0, amount), 0, PLAYER.maxHunger);
}
