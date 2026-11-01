import type * as THREE from 'three';
import type { BlueprintId, Cost } from '../game/data';

export type ColliderTag = 'scatter' | 'node' | 'structure' | 'landmark';

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  enabled: boolean;
  blocksSight: boolean;
  tag: ColliderTag;
  id?: string;
}

export interface BoxCollider {
  x: number;
  z: number;
  hx: number;
  hz: number;
  enabled: boolean;
  blocksSight: boolean;
  tag: ColliderTag;
  id?: string;
}

export type POIKind = 'outpost' | 'wreck' | 'pad';

export interface WorldPOI {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: POIKind;
  discovered?: boolean;
}

export interface WorldInteractable {
  id: string;
  kind: 'blueprint' | 'loot';
  position: THREE.Vector3;
  radius: number;
  label: string;
  detail: string;
  blueprint?: BlueprintId;
  loot?: Cost;
  object: THREE.Object3D;
  looted: boolean;
}
