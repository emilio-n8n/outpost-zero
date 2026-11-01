import * as THREE from 'three';
import { BUILDS, buildState, type BlueprintId, type BuildType, type InventoryState } from '../game/data';
import { OUTPOST } from '../config';
import type { Terrain } from './Terrain';
import type { World } from './World';
import type { StructureManager } from './Structures';

export interface PlacementInfo {
  type: BuildType;
  x: number;
  z: number;
  y: number;
  rotation: number;
  valid: boolean;
  reason: string | null;
}

export class BuildSystem {
  activeType: BuildType | null = null;
  rotation = 0;
  private readonly scene: THREE.Scene;
  private readonly terrain: Terrain;
  private ghost: THREE.Group | null = null;
  private ghostMaterials: THREE.MeshBasicMaterial[] = [];
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  private current: PlacementInfo | null = null;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.scene = scene;
    this.terrain = terrain;
  }

  start(type: BuildType): void {
    this.stop();
    this.activeType = type;
    this.rotation = 0;
    this.ghost = new THREE.Group();
    this.ghost.name = 'build-ghost';
    this.createGhostGeometry(type);
    this.scene.add(this.ghost);
  }

  private addGhostMesh(geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0): void {
    if (!this.ghost) return;
    const material = new THREE.MeshBasicMaterial({
      color: 0x7dffe7,
      transparent: true,
      opacity: 0.27,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.ghostMaterials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.renderOrder = 5;
    this.ghost.add(mesh);
  }

  private createGhostGeometry(type: BuildType): void {
    if (!this.ghost) return;
    if (type === 'wall') {
      this.addGhostMesh(new THREE.BoxGeometry(2.8, 2.2, 0.2), 0, 1.1, 0);
      this.addGhostMesh(new THREE.BoxGeometry(2.95, 0.2, 0.52), 0, 0.1, 0);
    } else if (type === 'campfire') {
      this.addGhostMesh(new THREE.CylinderGeometry(0.8, 0.9, 0.22, 12), 0, 0.11, 0);
      this.addGhostMesh(new THREE.CylinderGeometry(0.16, 0.32, 1.4, 6), 0, 0.8, 0);
    } else if (type === 'shelter') {
      this.addGhostMesh(new THREE.CylinderGeometry(2.1, 2.2, 0.16, 10), 0, 0.08, 0);
      this.addGhostMesh(new THREE.ConeGeometry(2.7, 1.2, 8, 1, true), 0, 3.0, 0);
      this.addGhostMesh(new THREE.CylinderGeometry(0.28, 0.34, 1.2, 7), 0, 0.6, 0);
    } else if (type === 'turret') {
      this.addGhostMesh(new THREE.CylinderGeometry(0.7, 0.85, 0.18, 10), 0, 0.09, 0);
      this.addGhostMesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 7), 0, 0.8, 0);
      this.addGhostMesh(new THREE.BoxGeometry(0.8, 0.5, 1.1), 0, 1.6, 0.2);
    } else if (type === 'beacon') {
      this.addGhostMesh(new THREE.CylinderGeometry(1.35, 1.5, 0.45, 12), 0, 0.23, 0);
      this.addGhostMesh(new THREE.CylinderGeometry(0.18, 0.32, 5.5, 7), 0, 3.0, 0);
      this.addGhostMesh(new THREE.TorusGeometry(1.1, 0.04, 6, 28), 0, 3.7, 0, 0);
    }

    const footprint = BUILDS[type];
    const ring = new THREE.RingGeometry(
      Math.max(0.5, footprint.radius - 0.08),
      footprint.radius,
      Math.max(16, Math.round(footprint.radius * 12)),
    );
    ring.rotateX(-Math.PI / 2);
    this.addGhostMesh(ring, 0, 0.035, 0);
  }

  cancel(): void {
    this.stop();
  }

  stop(): void {
    this.activeType = null;
    this.current = null;
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      this.ghost = null;
    }
    for (const material of this.ghostMaterials) material.dispose();
    this.ghostMaterials = [];
  }

  rotate(): void {
    this.rotation = (this.rotation + Math.PI / 2) % (Math.PI * 2);
  }

  update(
    camera: THREE.Camera,
    playerPosition: THREE.Vector3,
    playerRadius: number,
    world: World,
    structures: StructureManager,
    inventory: InventoryState,
    blueprints: readonly BlueprintId[],
    reach = 11,
  ): PlacementInfo | null {
    if (!this.activeType || !this.ghost) return null;
    this.raycaster.setFromCamera(this.center, camera);
    const hits = this.raycaster.intersectObject(this.terrain.mesh, false);
    const hit = hits[0];
    const def = BUILDS[this.activeType];
    if (!hit) {
      this.ghost.visible = false;
      this.current = null;
      return null;
    }

    let x = Math.round(hit.point.x * 4) / 4;
    let z = Math.round(hit.point.z * 4) / 4;
    if (this.activeType === 'wall') {
      x = Math.round(x * 2) / 2;
      z = Math.round(z * 2) / 2;
    }
    if (this.activeType === 'beacon') {
      const padDistance = Math.hypot(x - OUTPOST.beaconPad.x, z - OUTPOST.beaconPad.z);
      if (padDistance < OUTPOST.beaconPad.radius) {
        x = OUTPOST.beaconPad.x;
        z = OUTPOST.beaconPad.z;
      }
    }
    const y = this.terrain.heightAt(x, z);
    this.ghost.visible = true;
    this.ghost.position.set(x, y + 0.03, z);
    this.ghost.rotation.y = this.rotation;

    let reason: string | null = null;
    const distance = Math.hypot(x - playerPosition.x, z - playerPosition.z);
    if (distance > reach) reason = 'Out of build range';
    if (Math.hypot(x - OUTPOST.x, z - OUTPOST.z) > 92) reason = 'Outside the basin';
    if (!reason && distance < def.radius + playerRadius + 0.35) reason = 'Too close to you';

    const slopeRadius = this.activeType === 'wall' ? 1.25 : def.radius;
    if (!reason && !this.terrain.isFlat(x, z, slopeRadius, 0.23)) {
      reason = 'Ground too uneven';
    }

    if (!reason) {
      if (this.activeType === 'wall') {
        const rotated = Math.abs(Math.sin(this.rotation)) > 0.5;
        const hx = rotated ? def.depth / 2 : def.width / 2;
        const hz = rotated ? def.width / 2 : def.depth / 2;
        if (!world.isBoxFree(x, z, hx, hz)) reason = 'Blocked by terrain or structure';
      } else if (!world.isAreaFree(x, z, def.radius)) {
        reason = 'Blocked by terrain or structure';
      }
    }

    if (!reason) {
      const state = buildState(def, inventory, blueprints, structures.countOf(this.activeType));
      if (!state.ok) reason = state.reason;
    }

    if (!reason && def.requiresPad) {
      const padDistance = Math.hypot(x - OUTPOST.beaconPad.x, z - OUTPOST.beaconPad.z);
      if (padDistance > OUTPOST.beaconPad.radius - 0.3) reason = 'Must be placed on the landing pad';
    }

    const valid = reason === null;
    const color = valid ? 0x7dffe7 : 0xff6255;
    for (const material of this.ghostMaterials) {
      material.color.setHex(color);
      material.opacity = valid ? 0.25 : 0.3;
    }

    this.current = {
      type: this.activeType,
      x,
      z,
      y,
      rotation: this.rotation,
      valid,
      reason,
    };
    return this.current;
  }

  getPlacement(): PlacementInfo | null {
    return this.current;
  }
}
