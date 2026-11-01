import { describe, expect, it } from 'vitest';
import { createInventory } from '../src/game/data';
import { createObjectives } from '../src/game/objectives';
import { SAVE_VERSION, validateSaveData, type SaveData } from '../src/game/save';

function makeSave(): SaveData {
  const inventory = createInventory();
  return {
    version: SAVE_VERSION,
    seed: 'OZ-TEST',
    savedAt: 1234,
    clock: 0.42,
    day: 3,
    nightNumber: 2,
    playTime: 87.5,
    player: {
      x: 10,
      y: 2.5,
      z: -4,
      yaw: 1.2,
      health: 78,
      hunger: 63,
      stamina: 88,
      battery: 42,
      flashlight: true,
    },
    inventory: {
      resources: { ...inventory.resources, wood: 12, metal: 7 },
      hotbar: inventory.hotbar,
      selected: 1,
      tools: { axe: true, pick: false },
    },
    objectives: {
      ...createObjectives(),
      woodGathered: 22,
      craftedAxe: true,
      blueprints: ['rifle', 'beacon'],
    },
    stats: { kills: 9, resourcesGathered: 44, structuresBuilt: 3, nightsSurvived: 2, deaths: 1 },
    structures: [
      {
        id: 'structure-1',
        type: 'campfire',
        x: 2,
        z: 3,
        rotation: 0,
        health: 120,
        fuel: 80,
        charge: 0,
      },
    ],
    nodeCooldowns: { 'wood-3': 42.5 },
    looted: ['survey-cache'],
  };
}

describe('save validation', () => {
  it('round-trips a valid save while preserving progression', () => {
    const save = makeSave();
    const result = validateSaveData(save);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.seed).toBe('OZ-TEST');
    expect(result.inventory.resources.wood).toBe(12);
    expect(result.objectives.blueprints).toEqual(['rifle', 'beacon']);
    expect(result.structures[0]?.type).toBe('campfire');
    expect(result.player.flashlight).toBe(true);
    expect(result.nodeCooldowns['wood-3']).toBe(42.5);
  });

  it('rejects incompatible versions', () => {
    const save = { ...makeSave(), version: SAVE_VERSION + 1 };
    expect(validateSaveData(save)).toBeNull();
  });

  it('rejects malformed payloads and unknown hotbar items', () => {
    expect(validateSaveData(null)).toBeNull();
    expect(validateSaveData({ version: SAVE_VERSION })).toBeNull();
    const save = makeSave();
    (save.inventory.hotbar as unknown[]) = [{ item: 'not-an-item', qty: 1 }];
    const result = validateSaveData(save);
    expect(result).not.toBeNull();
    expect(result?.inventory.hotbar).toHaveLength(6);
    expect(result?.inventory.hotbar.every((slot) => slot === null)).toBe(true);
  });
});
