export type QualityLevel = 'low' | 'medium' | 'high';

export interface SiteConfig {
  id: 'survey' | 'freighter' | 'relay';
  label: string;
  x: number;
  z: number;
  radius: number;
  blueprint: 'rifle' | 'turret' | 'beacon';
}

export const GAME = {
  title: 'OUTPOST ZERO',
  version: '1.0.0',
  saveKey: 'outpost-zero:save:v1',
  settingsKey: 'outpost-zero:settings:v1',
  cycleSeconds: 480,
  startClock: 0.315,
  nightStart: 0.78,
  nightEnd: 0.235,
  autosaveInterval: 60,
} as const;

export const WORLD = {
  size: 200,
  half: 100,
  segments: 160,
  playableRadius: 94,
  seed: 'outpost-zero',
} as const;

export const OUTPOST = {
  x: 0,
  z: 0,
  flattenRadius: 24,
  beaconPad: { x: 6.5, z: -2.5, radius: 3.8 },
  playerSpawn: { x: -6.5, z: 16.5 },
} as const;

export const SITES: readonly SiteConfig[] = [
  {
    id: 'survey',
    label: 'Survey Wreck',
    x: 30,
    z: 38,
    radius: 9,
    blueprint: 'rifle',
  },
  {
    id: 'freighter',
    label: 'Freighter Wreck',
    x: -48,
    z: 33,
    radius: 10,
    blueprint: 'turret',
  },
  {
    id: 'relay',
    label: 'Relay Wreck',
    x: 12,
    z: -69,
    radius: 11,
    blueprint: 'beacon',
  },
] as const;

export const PLAYER = {
  radius: 0.42,
  height: 1.78,
  walkSpeed: 5.1,
  sprintSpeed: 8.4,
  acceleration: 28,
  jumpSpeed: 7.8,
  gravity: 25,
  maxHealth: 100,
  maxHunger: 100,
  maxStamina: 100,
  hungerDrain: 0.22,
  starvationDamage: 1.4,
  staminaDrain: 16,
  staminaRegen: 20,
  staminaDelay: 0.8,
  jumpStamina: 8,
  healthRegen: 0.35,
  healthRegenDelay: 12,
  fallDamageThreshold: 15,
  fallDamageScale: 4.5,
  coldDelay: 6,
  coldDamage: 0.85,
  coldDamagePerNight: 0.08,
  flashlightDrain: 0.9,
  flashlightSolar: 0.9,
} as const;

export const COMBAT = {
  bladeDamage: 26,
  bladeCooldown: 0.55,
  bladeRange: 3.05,
  bladeArc: 0.2,
  bladeStamina: 7,
  rifleDamage: 44,
  rifleCooldown: 0.26,
  rifleRange: 95,
  rifleEnergyCost: 1,
  rifleCritMultiplier: 1.6,
  meleeStagger: 0.22,
} as const;

export const RESOURCE_NODES = {
  wood: { baseYield: 2, toolYield: 2, respawn: 210, radius: 0.68 },
  metal: { baseYield: 2, toolYield: 2, respawn: 240, radius: 0.85 },
  energy: { baseYield: 2, toolYield: 2, respawn: 270, radius: 0.9 },
  food: { baseYield: 2, toolYield: 1, respawn: 180, radius: 0.62 },
} as const;

export const ENEMY_SCALING = {
  baseMaxAlive: 2,
  maxAlivePerNight: 1.35,
  maxAliveCap: 11,
  spawnInterval: 6.4,
  spawnIntervalMin: 2.6,
  initialDelay: 4,
  xpScale: 0.11,
  damageScale: 0.07,
} as const;

export const SIEGE = {
  duration: 80,
  radius: 15,
  spawnInterval: 2.2,
  maxAlive: 11,
  wardenAt: 0.48,
} as const;

export const CAMERA = {
  baseFov: 62,
  minPitch: -0.72,
  maxPitch: 0.42,
  defaultPitch: -0.16,
  distance: 5.6,
  height: 1.55,
  sensitivity: 1,
} as const;

export const QUALITY = {
  low: {
    pixelRatio: 1,
    shadows: false,
    bloom: false,
    shadowMapSize: 512,
    drawDistance: 180,
  },
  medium: {
    pixelRatio: 1.25,
    shadows: true,
    bloom: true,
    shadowMapSize: 1024,
    drawDistance: 260,
  },
  high: {
    pixelRatio: 1.6,
    shadows: true,
    bloom: true,
    shadowMapSize: 2048,
    drawDistance: 340,
  },
} as const;
