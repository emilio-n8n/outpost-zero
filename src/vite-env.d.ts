/// <reference types="vite/client" />

interface OutpostDebugApi {
  getState: () => {
    state: string;
    seed: string;
    day: number;
    clock: number;
    night: number;
    player: { x: number; y: number; z: number; health: number; hunger: number };
    enemies: number;
    structures: number;
    pointerLocked: boolean;
    inventory: Record<string, number> & { tools: { axe: boolean; pick: boolean }; selected: number };
    lastSaveAttempt: { manual: boolean; result: string; at: number } | null;
    lastUiAction: { action: string; value: string; at: number } | null;
  };
  setTime: (clock: number) => void;
  enterNight: () => void;
  spawnWave: (count?: number) => void;
  spawnWaveAt: (count: number, distance: number) => void;
  giveResources: (resources: Record<string, number>) => void;
  teleport: (x: number, z: number) => void;
  nearestNodeOfType: (type: string) => { id: string; type: string; x: number; z: number } | null;
  interact: () => void;
  openTerminal: (tab: 'inventory' | 'crafting' | 'build') => void;
  closeTerminal: () => void;
  startBuild: (type: string) => void;
  save: () => boolean;
  setQuality: (quality: 'low' | 'medium' | 'high') => void;
}

interface Window {
  __OUTPOST__?: OutpostDebugApi;
}
