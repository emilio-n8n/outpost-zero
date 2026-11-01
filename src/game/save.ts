import type { BlueprintId, BuildType, HotbarItemId, ResourceId, ToolId } from './data';

export const SAVE_VERSION = 1;

export interface SaveStats {
  kills: number;
  resourcesGathered: number;
  structuresBuilt: number;
  nightsSurvived: number;
  deaths: number;
}

export interface PlayerSave {
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  hunger: number;
  stamina: number;
  battery: number;
  flashlight: boolean;
}

export interface InventorySave {
  resources: Record<ResourceId, number>;
  hotbar: Array<{ item: HotbarItemId; qty: number } | null>;
  selected: number;
  tools: Record<ToolId, boolean>;
}

export interface ObjectiveSave {
  woodGathered: number;
  metalGathered: number;
  energyGathered: number;
  foodGathered: number;
  craftedAxe: boolean;
  craftedPick: boolean;
  builtCampfire: boolean;
  builtShelter: boolean;
  builtTurret: boolean;
  blueprints: BlueprintId[];
  beaconPlaced: boolean;
  beaconActivated: boolean;
  nightsSurvived: number;
}

export interface StructureSave {
  id: string;
  type: BuildType;
  x: number;
  z: number;
  rotation: number;
  health: number;
  fuel: number;
  charge: number;
}

export interface SaveData {
  version: number;
  seed: string;
  savedAt: number;
  clock: number;
  day: number;
  nightNumber: number;
  playTime: number;
  player: PlayerSave;
  inventory: InventorySave;
  objectives: ObjectiveSave;
  stats: SaveStats;
  structures: StructureSave[];
  nodeCooldowns: Record<string, number>;
  looted: string[];
}

const RESOURCE_IDS: ResourceId[] = ['wood', 'metal', 'energy', 'food'];
const ITEM_IDS: HotbarItemId[] = ['blade', 'rifle', 'medkit', 'battery', 'ration'];
const BLUEPRINT_IDS: BlueprintId[] = ['rifle', 'turret', 'beacon'];
const BUILD_TYPES: BuildType[] = ['campfire', 'wall', 'shelter', 'turret', 'beacon'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function validateSaveData(raw: unknown): SaveData | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== SAVE_VERSION) return null;
  if (typeof raw.seed !== 'string' || raw.seed.length === 0) return null;
  if (!isRecord(raw.player) || !isRecord(raw.inventory) || !isRecord(raw.objectives)) return null;

  const playerRaw = raw.player;
  const inventoryRaw = raw.inventory;
  const objectiveRaw = raw.objectives;
  const resourcesRaw = isRecord(inventoryRaw.resources) ? inventoryRaw.resources : null;
  if (!resourcesRaw) return null;

  const resources = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) resources[id] = Math.max(0, numberOr(resourcesRaw[id], 0));

  const hotbarRaw = Array.isArray(inventoryRaw.hotbar) ? inventoryRaw.hotbar : [];
  const hotbar = Array.from({ length: 6 }, (_, index) => {
    const slot = hotbarRaw[index];
    if (!isRecord(slot)) return null;
    const item = slot.item;
    if (typeof item !== 'string' || !ITEM_IDS.includes(item as HotbarItemId)) return null;
    const qty = Math.max(1, Math.floor(numberOr(slot.qty, 1)));
    return { item: item as HotbarItemId, qty };
  });

  const toolsRaw = isRecord(inventoryRaw.tools) ? inventoryRaw.tools : {};
  const blueprintsRaw = Array.isArray(objectiveRaw.blueprints) ? objectiveRaw.blueprints : [];
  const blueprints = blueprintsRaw.filter(
    (value): value is BlueprintId =>
      typeof value === 'string' && BLUEPRINT_IDS.includes(value as BlueprintId),
  );

  const structuresRaw = Array.isArray(raw.structures) ? raw.structures : [];
  const structures: StructureSave[] = [];
  for (const entry of structuresRaw) {
    if (!isRecord(entry)) continue;
    if (typeof entry.type !== 'string' || !BUILD_TYPES.includes(entry.type as BuildType)) continue;
    if (typeof entry.id !== 'string') continue;
    structures.push({
      id: entry.id,
      type: entry.type as BuildType,
      x: numberOr(entry.x, 0),
      z: numberOr(entry.z, 0),
      rotation: numberOr(entry.rotation, 0),
      health: Math.max(1, numberOr(entry.health, 100)),
      fuel: Math.max(0, numberOr(entry.fuel, 0)),
      charge: Math.max(0, numberOr(entry.charge, 0)),
    });
  }

  const cooldownRaw = isRecord(raw.nodeCooldowns) ? raw.nodeCooldowns : {};
  const nodeCooldowns: Record<string, number> = {};
  for (const [key, value] of Object.entries(cooldownRaw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      nodeCooldowns[key] = value;
    }
  }

  const statsRaw = isRecord(raw.stats) ? raw.stats : {};
  const objectives: ObjectiveSave = {
    woodGathered: Math.max(0, numberOr(objectiveRaw.woodGathered, 0)),
    metalGathered: Math.max(0, numberOr(objectiveRaw.metalGathered, 0)),
    energyGathered: Math.max(0, numberOr(objectiveRaw.energyGathered, 0)),
    foodGathered: Math.max(0, numberOr(objectiveRaw.foodGathered, 0)),
    craftedAxe: boolOr(objectiveRaw.craftedAxe, false),
    craftedPick: boolOr(objectiveRaw.craftedPick, false),
    builtCampfire: boolOr(objectiveRaw.builtCampfire, false),
    builtShelter: boolOr(objectiveRaw.builtShelter, false),
    builtTurret: boolOr(objectiveRaw.builtTurret, false),
    blueprints,
    beaconPlaced: boolOr(objectiveRaw.beaconPlaced, false),
    beaconActivated: boolOr(objectiveRaw.beaconActivated, false),
    nightsSurvived: Math.max(0, Math.floor(numberOr(objectiveRaw.nightsSurvived, 0))),
  };

  const looted = Array.isArray(raw.looted)
    ? raw.looted.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    version: SAVE_VERSION,
    seed: raw.seed,
    savedAt: numberOr(raw.savedAt, Date.now()),
    clock: Math.min(0.9999, Math.max(0, numberOr(raw.clock, 0.29))),
    day: Math.max(1, Math.floor(numberOr(raw.day, 1))),
    nightNumber: Math.max(0, Math.floor(numberOr(raw.nightNumber, 0))),
    playTime: Math.max(0, numberOr(raw.playTime, 0)),
    player: {
      x: numberOr(playerRaw.x, 0),
      y: numberOr(playerRaw.y, 0),
      z: numberOr(playerRaw.z, 0),
      yaw: numberOr(playerRaw.yaw, 0),
      health: Math.min(100, Math.max(1, numberOr(playerRaw.health, 100))),
      hunger: Math.min(100, Math.max(0, numberOr(playerRaw.hunger, 100))),
      stamina: Math.min(100, Math.max(0, numberOr(playerRaw.stamina, 100))),
      battery: Math.min(100, Math.max(0, numberOr(playerRaw.battery, 100))),
      flashlight: boolOr(playerRaw.flashlight, false),
    },
    inventory: {
      resources,
      hotbar,
      selected: Math.min(5, Math.max(0, Math.floor(numberOr(inventoryRaw.selected, 0)))),
      tools: {
        axe: boolOr(toolsRaw.axe, false),
        pick: boolOr(toolsRaw.pick, false),
      },
    },
    objectives,
    stats: {
      kills: Math.max(0, Math.floor(numberOr(statsRaw.kills, 0))),
      resourcesGathered: Math.max(0, Math.floor(numberOr(statsRaw.resourcesGathered, 0))),
      structuresBuilt: Math.max(0, Math.floor(numberOr(statsRaw.structuresBuilt, 0))),
      nightsSurvived: Math.max(0, Math.floor(numberOr(statsRaw.nightsSurvived, 0))),
      deaths: Math.max(0, Math.floor(numberOr(statsRaw.deaths, 0))),
    },
    structures,
    nodeCooldowns,
    looted,
  };
}
