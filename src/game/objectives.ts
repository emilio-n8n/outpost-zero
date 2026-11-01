import { SITES } from '../config';
import type { BlueprintId } from './data';

export interface ObjectiveState {
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

export interface PrimaryObjective {
  id: string;
  index: number;
  title: string;
  description: string;
  hint: string;
  progress?: { current: number; target: number };
  target?: { x: number; z: number; label: string };
}

export function createObjectives(): ObjectiveState {
  return {
    woodGathered: 0,
    metalGathered: 0,
    energyGathered: 0,
    foodGathered: 0,
    craftedAxe: false,
    craftedPick: false,
    builtCampfire: false,
    builtShelter: false,
    builtTurret: false,
    blueprints: [],
    beaconPlaced: false,
    beaconActivated: false,
    nightsSurvived: 0,
  };
}

const site = (id: string) => SITES.find((entry) => entry.id === id);

export function primaryObjective(state: ObjectiveState): PrimaryObjective {
  if (!state.craftedAxe && state.woodGathered < 8) {
    return {
      id: 'gather-wood',
      index: 1,
      title: 'Gather xeno timber',
      description: 'Harvest the pale trees surrounding the crash site. You need enough material to build a cutting tool.',
      hint: 'Look for the branch markers. Press E near a tree.',
      progress: { current: Math.min(8, state.woodGathered), target: 8 },
    };
  }
  if (!state.craftedAxe) {
    return {
      id: 'craft-axe',
      index: 2,
      title: 'Craft a salvage axe',
      description: 'A proper cutting head will double the timber you recover from every tree.',
      hint: 'Open the Field Terminal with C, then craft the Salvage Axe.',
    };
  }
  if (!state.builtCampfire) {
    return {
      id: 'build-campfire',
      index: 3,
      title: 'Build a campfire',
      description: 'Night temperatures on this world are lethal. A fire creates a warm pocket and lets you cook biomass.',
      hint: 'Press B, choose Campfire, and place it on open ground outside.',
    };
  }
  if (!state.blueprints.includes('rifle')) {
    const targetSite = site('survey');
    return {
      id: 'survey-wreck',
      index: 4,
      title: 'Search the Survey Wreck',
      description: 'A damaged survey module went down east of the outpost. Its data core may hold a weapon schematic.',
      hint: 'Follow the waypoint on your minimap.',
      target: targetSite ? { x: targetSite.x, z: targetSite.z, label: targetSite.label } : undefined,
    };
  }
  if (!state.builtShelter) {
    return {
      id: 'build-shelter',
      index: 5,
      title: 'Build a shelter core',
      description: 'A heated shelter is the difference between a long night and a last one. It also becomes your respawn point.',
      hint: 'Press B, choose Shelter Core, and clear enough flat ground for it.',
    };
  }
  if (!state.blueprints.includes('beacon')) {
    const targetSite = site('relay');
    return {
      id: 'relay-wreck',
      index: 6,
      title: 'Reach the Relay Wreck',
      description: 'The long-range relay carried the only copy of the orbital beacon schematic. It lies south of the basin.',
      hint: 'The relay is dangerous ground. Carry food, charge and a weapon.',
      target: targetSite ? { x: targetSite.x, z: targetSite.z, label: targetSite.label } : undefined,
    };
  }
  if (!state.beaconPlaced) {
    return {
      id: 'place-beacon',
      index: 7,
      title: 'Deploy the signal beacon',
      description: 'Build the beacon on the marked landing pad at the outpost. Rescue cannot find you without it.',
      hint: 'Press B and choose Signal Beacon. It only fits on the lit landing pad.',
    };
  }
  if (!state.beaconActivated) {
    return {
      id: 'activate-beacon',
      index: 8,
      title: 'Activate the beacon',
      description: 'Start the uplink and hold position until rescue locks on. Every creature on the ridge will come for you.',
      hint: 'Return to the beacon pad and press E. Keep enemies away from the uplink.',
    };
  }
  return {
    id: 'complete',
    index: 9,
    title: 'Signal acquired',
    description: 'The rescue carrier is on approach. Outpost Zero is no longer a grave.',
    hint: 'Hold the line until extraction.',
  };
}

export function objectiveCompletion(state: ObjectiveState): number {
  const checks = [
    state.craftedAxe,
    state.builtCampfire,
    state.blueprints.includes('rifle'),
    state.builtShelter,
    state.blueprints.includes('beacon'),
    state.beaconPlaced,
    state.beaconActivated,
  ];
  return checks.filter(Boolean).length / checks.length;
}
