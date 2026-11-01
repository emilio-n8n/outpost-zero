import { GAME, type QualityLevel } from '../config';
import { readJson, writeJson } from './storage';

export interface Settings {
  quality: QualityLevel;
  sensitivity: number;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  sensitivity: 1,
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  showFps: false,
};

const QUALITIES: QualityLevel[] = ['low', 'medium', 'high'];

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function loadSettings(): Settings {
  const stored = readJson<Partial<Settings>>(GAME.settingsKey);
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS };
  return {
    quality:
      typeof stored.quality === 'string' && QUALITIES.includes(stored.quality as QualityLevel)
        ? (stored.quality as QualityLevel)
        : DEFAULT_SETTINGS.quality,
    sensitivity: clamp(stored.sensitivity, 0.35, 2.2, DEFAULT_SETTINGS.sensitivity),
    masterVolume: clamp(stored.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
    musicVolume: clamp(stored.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clamp(stored.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
    showFps: typeof stored.showFps === 'boolean' ? stored.showFps : DEFAULT_SETTINGS.showFps,
  };
}

export function saveSettings(settings: Settings): void {
  writeJson(GAME.settingsKey, settings);
}
