export type ResourceId = 'wood' | 'metal' | 'energy' | 'food';
export type ToolId = 'axe' | 'pick';
export type WeaponId = 'blade' | 'rifle';
export type ConsumableId = 'medkit' | 'battery' | 'ration';
export type HotbarItemId = WeaponId | ConsumableId;
export type BlueprintId = 'rifle' | 'turret' | 'beacon';
export type BuildType = 'campfire' | 'wall' | 'shelter' | 'turret' | 'beacon';
export type IconId =
  | ResourceId
  | HotbarItemId
  | ToolId
  | BlueprintId
  | BuildType
  | 'spark'
  | 'shield'
  | 'clock'
  | 'compass'
  | 'save'
  | 'menu';

export interface HotbarSlot {
  item: HotbarItemId;
  qty: number;
}

export interface InventoryState {
  resources: Record<ResourceId, number>;
  hotbar: Array<HotbarSlot | null>;
  selected: number;
  tools: Record<ToolId, boolean>;
}

export interface ItemDefinition {
  id: HotbarItemId;
  name: string;
  short: string;
  description: string;
  kind: 'weapon' | 'consumable';
  stack: number;
  icon: IconId;
}

export interface ResourceDefinition {
  id: ResourceId;
  name: string;
  short: string;
  description: string;
  icon: IconId;
  color: string;
}

export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  icon: IconId;
}

export interface Cost {
  wood?: number;
  metal?: number;
  energy?: number;
  food?: number;
}

export type RecipeResult =
  | { kind: 'tool'; tool: ToolId }
  | { kind: 'item'; item: HotbarItemId; qty: number };

export interface RecipeDefinition {
  id: string;
  name: string;
  category: 'field' | 'weapons' | 'survival';
  description: string;
  cost: Cost;
  result: RecipeResult;
  blueprint?: BlueprintId;
  requiresFire?: boolean;
  once?: boolean;
  icon: IconId;
}

export interface BuildDefinition {
  type: BuildType;
  name: string;
  description: string;
  cost: Cost;
  health: number;
  footprint: 'circle' | 'box';
  radius: number;
  width: number;
  depth: number;
  limit: number;
  blueprint?: BlueprintId;
  requiresPad?: boolean;
  warmthRadius?: number;
  icon: IconId;
  role: string;
}

export const RESOURCE_ORDER: readonly ResourceId[] = ['wood', 'metal', 'energy', 'food'] as const;

export const RESOURCES: Record<ResourceId, ResourceDefinition> = {
  wood: {
    id: 'wood',
    name: 'Xeno Timber',
    short: 'WOOD',
    description: 'Dense, resinous growth from the lichen forests. Burns well and builds light structures.',
    icon: 'wood',
    color: '#d7a86a',
  },
  metal: {
    id: 'metal',
    name: 'Salvaged Alloy',
    short: 'METAL',
    description: 'Hull plating reclaimed from the wrecks. Essential for tools, weapons and fortifications.',
    icon: 'metal',
    color: '#a9c3c8',
  },
  energy: {
    id: 'energy',
    name: 'Lumen Crystal',
    short: 'ENERGY',
    description: 'Bio-luminescent crystal carrying a usable charge. Powers weapons, turrets and the beacon.',
    icon: 'energy',
    color: '#75f4e4',
  },
  food: {
    id: 'food',
    name: 'Xeno Biomass',
    short: 'FOOD',
    description: 'Edible fungal pods. Safe in small amounts, but cooking makes it far more nourishing.',
    icon: 'food',
    color: '#d38fd2',
  },
};

export const ITEMS: Record<HotbarItemId, ItemDefinition> = {
  blade: {
    id: 'blade',
    name: 'Arc Cutter',
    short: 'ARC CUTTER',
    description: 'A short industrial blade with a live edge. Reliable when the charge runs dry.',
    kind: 'weapon',
    stack: 1,
    icon: 'blade',
  },
  rifle: {
    id: 'rifle',
    name: 'Pulse Rifle',
    short: 'PULSE RIFLE',
    description: 'A salvage-built directed-energy rifle. Each shot consumes one unit of Lumen charge.',
    kind: 'weapon',
    stack: 1,
    icon: 'rifle',
  },
  medkit: {
    id: 'medkit',
    name: 'Med Stim',
    short: 'MED STIM',
    description: 'A single-use auto-injector. Restores 45 suit integrity.',
    kind: 'consumable',
    stack: 9,
    icon: 'medkit',
  },
  battery: {
    id: 'battery',
    name: 'Charge Cell',
    short: 'CHARGE CELL',
    description: 'A compact cell that restores 55% of the suit flashlight battery.',
    kind: 'consumable',
    stack: 9,
    icon: 'battery',
  },
  ration: {
    id: 'ration',
    name: 'Cooked Ration',
    short: 'RATION',
    description: 'Cooked biomass. Restores 45 hunger when consumed.',
    kind: 'consumable',
    stack: 9,
    icon: 'ration',
  },
};

export const TOOLS: Record<ToolId, ToolDefinition> = {
  axe: {
    id: 'axe',
    name: 'Salvage Axe',
    description: 'Permanent upgrade. Doubles timber gained from xeno trees.',
    icon: 'axe',
  },
  pick: {
    id: 'pick',
    name: 'Salvage Pick',
    description: 'Permanent upgrade. Doubles alloy and crystal yield from deposits.',
    icon: 'pick',
  },
};

export const BLUEPRINTS: Record<BlueprintId, { name: string; description: string; site: string }> = {
  rifle: {
    name: 'PULSE RIFLE SCHEMATIC',
    description: 'Directed-energy weapon. Unlocks the Pulse Rifle at the field terminal.',
    site: 'Survey Wreck',
  },
  turret: {
    name: 'TESLA TURRET SCHEMATIC',
    description: 'Autonomous defence platform. Unlocks construction of Tesla Turrets.',
    site: 'Freighter Wreck',
  },
  beacon: {
    name: 'SIGNAL BEACON SCHEMATIC',
    description: 'Orbital distress transmitter. Unlocks the Signal Beacon at the outpost pad.',
    site: 'Relay Wreck',
  },
};

export const RECIPES: readonly RecipeDefinition[] = [
  {
    id: 'axe',
    name: 'Salvage Axe',
    category: 'field',
    description: 'A weighted cutting head for harvesting xeno timber. Permanently doubles wood yield.',
    cost: { wood: 8, metal: 3 },
    result: { kind: 'tool', tool: 'axe' },
    once: true,
    icon: 'axe',
  },
  {
    id: 'pick',
    name: 'Salvage Pick',
    category: 'field',
    description: 'Hardened extraction spikes. Permanently doubles metal and crystal yield.',
    cost: { wood: 6, metal: 5 },
    result: { kind: 'tool', tool: 'pick' },
    once: true,
    icon: 'pick',
  },
  {
    id: 'rifle',
    name: 'Pulse Rifle',
    category: 'weapons',
    description: 'A focused-energy carbine. Requires one unit of Lumen charge per shot.',
    cost: { metal: 14, energy: 8 },
    result: { kind: 'item', item: 'rifle', qty: 1 },
    blueprint: 'rifle',
    once: true,
    icon: 'rifle',
  },
  {
    id: 'medkit',
    name: 'Med Stim',
    category: 'survival',
    description: 'An emergency auto-injector. Restores 45 suit integrity when used.',
    cost: { food: 2, energy: 1, metal: 1 },
    result: { kind: 'item', item: 'medkit', qty: 1 },
    icon: 'medkit',
  },
  {
    id: 'battery',
    name: 'Charge Cell',
    category: 'survival',
    description: 'A compact power cell. Restores 55% of the suit flashlight battery.',
    cost: { metal: 3, energy: 2 },
    result: { kind: 'item', item: 'battery', qty: 1 },
    icon: 'battery',
  },
  {
    id: 'ration',
    name: 'Cooked Ration',
    category: 'survival',
    description: 'Cooked biomass. Restores 45 hunger. Requires a lit campfire nearby.',
    cost: { food: 2 },
    result: { kind: 'item', item: 'ration', qty: 1 },
    requiresFire: true,
    icon: 'ration',
  },
];

export const BUILDS: Record<BuildType, BuildDefinition> = {
  campfire: {
    type: 'campfire',
    name: 'Campfire',
    description: 'A sheltered flame for warmth, cooking and light. Burns for 4 minutes, and can be refuelled.',
    cost: { wood: 8, metal: 3 },
    health: 160,
    footprint: 'circle',
    radius: 0.95,
    width: 1.9,
    depth: 1.9,
    limit: 5,
    warmthRadius: 7.5,
    icon: 'campfire',
    role: 'WARMTH',
  },
  wall: {
    type: 'wall',
    name: 'Barricade',
    description: 'A reinforced alloy panel. Blocks creature movement and buys you time during a night assault.',
    cost: { wood: 6, metal: 4 },
    health: 260,
    footprint: 'box',
    radius: 1.5,
    width: 2.8,
    depth: 0.4,
    limit: 60,
    icon: 'shield',
    role: 'DEFENCE',
  },
  shelter: {
    type: 'shelter',
    name: 'Shelter Core',
    description: 'A heated field shelter. Creates a warm safe zone, sets your respawn point and blocks night cold.',
    cost: { wood: 22, metal: 12, energy: 8 },
    health: 520,
    footprint: 'circle',
    radius: 2.1,
    width: 4.2,
    depth: 4.2,
    limit: 1,
    warmthRadius: 10,
    icon: 'shelter',
    role: 'SHELTER',
  },
  turret: {
    type: 'turret',
    name: 'Tesla Turret',
    description: 'An autonomous arc emplacement. Consumes charge to burn down nearby creatures.',
    cost: { metal: 18, energy: 14 },
    health: 220,
    footprint: 'circle',
    radius: 0.9,
    width: 1.8,
    depth: 1.8,
    limit: 3,
    blueprint: 'turret',
    icon: 'turret',
    role: 'DEFENCE',
  },
  beacon: {
    type: 'beacon',
    name: 'Signal Beacon',
    description: 'The only way home. Must be deployed on the outpost landing pad, then activated to call rescue.',
    cost: { metal: 45, energy: 30, wood: 25 },
    health: 1200,
    footprint: 'circle',
    radius: 1.7,
    width: 3.4,
    depth: 3.4,
    limit: 1,
    blueprint: 'beacon',
    requiresPad: true,
    icon: 'beacon',
    role: 'EXTRACTION',
  },
};

export const NODE_INFO: Record<
  ResourceId,
  { action: string; label: string; hint: string; color: number; emissive: number }
> = {
  wood: {
    action: 'HARVEST',
    label: 'Xeno Tree',
    hint: 'Timber',
    color: 0x4e7c68,
    emissive: 0x1d6b57,
  },
  metal: {
    action: 'SALVAGE',
    label: 'Alloy Debris',
    hint: 'Alloy',
    color: 0x7c8c90,
    emissive: 0x243d46,
  },
  energy: {
    action: 'EXTRACT',
    label: 'Lumen Cluster',
    hint: 'Lumen',
    color: 0x79ffe8,
    emissive: 0x3dffe0,
  },
  food: {
    action: 'FORAGE',
    label: 'Fungal Pod',
    hint: 'Biomass',
    color: 0xc87bbd,
    emissive: 0x8d2c7c,
  },
};

export function createInventory(): InventoryState {
  return {
    resources: { wood: 0, metal: 0, energy: 0, food: 0 },
    hotbar: [
      { item: 'blade', qty: 1 },
      { item: 'medkit', qty: 1 },
      null,
      null,
      null,
      null,
    ],
    selected: 0,
    tools: { axe: false, pick: false },
  };
}

export function resourceTotal(cost: Cost): number {
  return RESOURCE_ORDER.reduce((total, id) => total + (cost[id] ?? 0), 0);
}

export function canAfford(cost: Cost, resources: Record<ResourceId, number>): boolean {
  return RESOURCE_ORDER.every((id) => resources[id] >= (cost[id] ?? 0));
}

export function missingResources(
  cost: Cost,
  resources: Record<ResourceId, number>,
): Array<{ id: ResourceId; amount: number }> {
  return RESOURCE_ORDER.filter((id) => resources[id] < (cost[id] ?? 0)).map((id) => ({
    id,
    amount: (cost[id] ?? 0) - resources[id],
  }));
}

export function payCost(cost: Cost, resources: Record<ResourceId, number>): boolean {
  if (!canAfford(cost, resources)) return false;
  for (const id of RESOURCE_ORDER) resources[id] -= cost[id] ?? 0;
  return true;
}

export function addResource(
  inventory: InventoryState,
  id: ResourceId,
  amount: number,
): number {
  if (amount <= 0) return 0;
  inventory.resources[id] += amount;
  return amount;
}

export function addHotbarItem(
  inventory: InventoryState,
  item: HotbarItemId,
  qty: number,
): number {
  if (qty <= 0) return 0;
  const def = ITEMS[item];
  let remaining = qty;

  for (const slot of inventory.hotbar) {
    if (!slot || slot.item !== item || slot.qty >= def.stack) continue;
    const moved = Math.min(remaining, def.stack - slot.qty);
    slot.qty += moved;
    remaining -= moved;
    if (remaining === 0) return 0;
  }

  while (remaining > 0) {
    const index = inventory.hotbar.findIndex((slot) => slot === null);
    if (index === -1) break;
    const moved = Math.min(remaining, def.stack);
    inventory.hotbar[index] = { item, qty: moved };
    remaining -= moved;
  }
  return remaining;
}

export function canAddHotbarItem(
  inventory: InventoryState,
  item: HotbarItemId,
  qty: number,
): boolean {
  const copy: InventoryState = {
    resources: { ...inventory.resources },
    hotbar: inventory.hotbar.map((slot) => (slot ? { ...slot } : null)),
    selected: inventory.selected,
    tools: { ...inventory.tools },
  };
  return addHotbarItem(copy, item, qty) === 0;
}

export function hotbarHas(inventory: InventoryState, item: HotbarItemId): boolean {
  return inventory.hotbar.some((slot) => slot?.item === item);
}

export function selectedSlot(inventory: InventoryState): HotbarSlot | null {
  return inventory.hotbar[inventory.selected] ?? null;
}

export function consumeSelected(inventory: InventoryState, qty = 1): boolean {
  const slot = inventory.hotbar[inventory.selected];
  if (!slot || slot.qty < qty) return false;
  slot.qty -= qty;
  if (slot.qty <= 0) inventory.hotbar[inventory.selected] = null;
  return true;
}

export function hasBlueprint(blueprints: readonly BlueprintId[], blueprint: BlueprintId): boolean {
  return blueprints.includes(blueprint);
}

export interface CraftContext {
  blueprints: readonly BlueprintId[];
  nearFire: boolean;
}

export function recipeState(
  recipe: RecipeDefinition,
  inventory: InventoryState,
  context: CraftContext,
): { ok: boolean; reason: string | null } {
  if (recipe.blueprint && !hasBlueprint(context.blueprints, recipe.blueprint)) {
    return { ok: false, reason: 'Schematic not recovered' };
  }
  if (recipe.requiresFire && !context.nearFire) {
    return { ok: false, reason: 'Requires a lit campfire' };
  }
  if (recipe.once) {
    if (recipe.result.kind === 'tool' && inventory.tools[recipe.result.tool]) {
      return { ok: false, reason: 'Already crafted' };
    }
    if (recipe.result.kind === 'item' && hotbarHas(inventory, recipe.result.item)) {
      return { ok: false, reason: 'Already crafted' };
    }
  }
  if (recipe.result.kind === 'item' && !canAddHotbarItem(inventory, recipe.result.item, recipe.result.qty)) {
    return { ok: false, reason: 'Hotbar full' };
  }
  if (!canAfford(recipe.cost, inventory.resources)) {
    return { ok: false, reason: 'Insufficient resources' };
  }
  return { ok: true, reason: null };
}

export function craftRecipe(
  recipe: RecipeDefinition,
  inventory: InventoryState,
  context: CraftContext,
): { ok: boolean; reason: string | null } {
  const state = recipeState(recipe, inventory, context);
  if (!state.ok) return state;
  if (!payCost(recipe.cost, inventory.resources)) {
    return { ok: false, reason: 'Insufficient resources' };
  }
  if (recipe.result.kind === 'tool') {
    inventory.tools[recipe.result.tool] = true;
  } else {
    const leftover = addHotbarItem(inventory, recipe.result.item, recipe.result.qty);
    if (leftover > 0) {
      return { ok: false, reason: 'Hotbar full' };
    }
  }
  return { ok: true, reason: null };
}

export function buildState(
  def: BuildDefinition,
  inventory: InventoryState,
  blueprints: readonly BlueprintId[],
  existingCount: number,
): { ok: boolean; reason: string | null } {
  if (def.blueprint && !hasBlueprint(blueprints, def.blueprint)) {
    return { ok: false, reason: 'Schematic not recovered' };
  }
  if (existingCount >= def.limit) {
    return { ok: false, reason: 'Build limit reached' };
  }
  if (!canAfford(def.cost, inventory.resources)) {
    return { ok: false, reason: 'Insufficient resources' };
  }
  return { ok: true, reason: null };
}
