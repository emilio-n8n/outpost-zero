import { describe, expect, it } from 'vitest';
import { createObjectives, objectiveCompletion, primaryObjective } from '../src/game/objectives';

describe('objective progression', () => {
  it('walks from timber to the beacon', () => {
    const state = createObjectives();
    expect(primaryObjective(state).id).toBe('gather-wood');
    state.woodGathered = 8;
    expect(primaryObjective(state).id).toBe('craft-axe');
    state.craftedAxe = true;
    expect(primaryObjective(state).id).toBe('build-campfire');
    state.builtCampfire = true;
    expect(primaryObjective(state).id).toBe('survey-wreck');
    state.blueprints.push('rifle');
    expect(primaryObjective(state).id).toBe('build-shelter');
    state.builtShelter = true;
    expect(primaryObjective(state).id).toBe('relay-wreck');
    state.blueprints.push('beacon');
    expect(primaryObjective(state).id).toBe('place-beacon');
    state.beaconPlaced = true;
    expect(primaryObjective(state).id).toBe('activate-beacon');
    state.beaconActivated = true;
    expect(primaryObjective(state).id).toBe('complete');
  });

  it('tracks completion', () => {
    const state = createObjectives();
    expect(objectiveCompletion(state)).toBe(0);
    state.craftedAxe = true;
    state.builtCampfire = true;
    state.blueprints.push('rifle');
    expect(objectiveCompletion(state)).toBeCloseTo(3 / 7);
  });
});
