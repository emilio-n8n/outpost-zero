import { describe, expect, it } from 'vitest';
import {
  BUILDS,
  ITEMS,
  RECIPES,
  addHotbarItem,
  addResource,
  buildState,
  canAddHotbarItem,
  craftRecipe,
  createInventory,
  recipeState,
  selectedSlot,
} from '../src/game/data';

describe('inventory and crafting', () => {
  it('starts with a cutter and a med stim', () => {
    const inventory = createInventory();
    expect(selectedSlot(inventory)?.item).toBe('blade');
    expect(inventory.hotbar[1]?.item).toBe('medkit');
    expect(inventory.resources.wood).toBe(0);
  });

  it('stacks and consumes hotbar items', () => {
    const inventory = createInventory();
    addHotbarItem(inventory, 'medkit', 4);
    expect(inventory.hotbar[1]?.qty).toBe(5);
    addResource(inventory, 'wood', 4);
    expect(inventory.resources.wood).toBe(4);
    expect(canAddHotbarItem(inventory, 'battery', 1)).toBe(true);
  });

  it('crafts the axe and applies tool progression', () => {
    const inventory = createInventory();
    addResource(inventory, 'wood', 8);
    addResource(inventory, 'metal', 3);
    const axe = RECIPES.find((recipe) => recipe.id === 'axe');
    expect(axe).toBeTruthy();
    if (!axe) return;
    expect(recipeState(axe, inventory, { blueprints: [], nearFire: false }).ok).toBe(true);
    const result = craftRecipe(axe, inventory, { blueprints: [], nearFire: false });
    expect(result.ok).toBe(true);
    expect(inventory.tools.axe).toBe(true);
    expect(inventory.resources.wood).toBe(0);
    expect(recipeState(axe, inventory, { blueprints: [], nearFire: false }).reason).toBe(
      'Already crafted',
    );
  });

  it('blocks the rifle without its schematic', () => {
    const inventory = createInventory();
    addResource(inventory, 'metal', 14);
    addResource(inventory, 'energy', 8);
    const rifle = RECIPES.find((recipe) => recipe.id === 'rifle');
    expect(rifle).toBeTruthy();
    if (!rifle) return;
    expect(recipeState(rifle, inventory, { blueprints: [], nearFire: false }).reason).toBe(
      'Schematic not recovered',
    );
    expect(recipeState(rifle, inventory, { blueprints: ['rifle'], nearFire: false }).ok).toBe(true);
  });

  it('requires fire for rations', () => {
    const inventory = createInventory();
    addResource(inventory, 'food', 2);
    const ration = RECIPES.find((recipe) => recipe.id === 'ration');
    expect(ration).toBeTruthy();
    if (!ration) return;
    expect(recipeState(ration, inventory, { blueprints: [], nearFire: false }).reason).toContain(
      'campfire',
    );
    expect(recipeState(ration, inventory, { blueprints: [], nearFire: true }).ok).toBe(true);
  });

  it('validates building costs, limits and blueprints', () => {
    const inventory = createInventory();
    addResource(inventory, 'wood', 20);
    addResource(inventory, 'metal', 10);
    expect(buildState(BUILDS.campfire, inventory, [], 0).ok).toBe(true);
    expect(buildState(BUILDS.campfire, inventory, [], 5).reason).toBe('Build limit reached');
    expect(buildState(BUILDS.turret, inventory, [], 0).reason).toBe('Schematic not recovered');
  });

  it('knows item stack sizes', () => {
    expect(ITEMS.rifle.stack).toBe(1);
    expect(ITEMS.medkit.stack).toBeGreaterThan(1);
  });
});

