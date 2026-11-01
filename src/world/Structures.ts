import * as THREE from 'three';
import { BUILDS, type BuildType } from '../game/data';
import type { StructureSave } from '../game/save';
import { Rng } from '../core/Rng';
import { boxPart, cylinderPart, mergeGeometryParts } from '../core/merge';
import type { Terrain } from './Terrain';
import type { BoxCollider, CircleCollider } from './types';
import type { FX } from '../fx/FX';

export interface Structure {
  id: string;
  type: BuildType;
  x: number;
  z: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  fuel: number;
  charge: number;
  group: THREE.Group;
  light: THREE.PointLight | null;
  flames: THREE.Mesh[];
  turretHead: THREE.Group | null;
  turretCore: THREE.Mesh | null;
  beaconRing: THREE.Mesh | null;
  beaconBeam: THREE.Mesh | null;
  beaconLight: THREE.PointLight | null;
  heater: THREE.Mesh | null;
  active: boolean;
  emberTimer: number;
  turretTimer: number;
  phase: number;
  collision: CircleCollider | BoxCollider;
}

export interface WarmthResult {
  near: boolean;
  radius: number;
  source: 'campfire' | 'shelter' | null;
}

interface StructureHooks {
  addCircle: (collider: CircleCollider) => void;
  addBox: (collider: BoxCollider) => void;
  removeCircle: (collider: CircleCollider) => void;
  removeBox: (collider: BoxCollider) => void;
}

interface StructureVisuals {
  group: THREE.Group;
  light: THREE.PointLight | null;
  flames: THREE.Mesh[];
  turretHead: THREE.Group | null;
  turretCore: THREE.Mesh | null;
  beaconRing: THREE.Mesh | null;
  beaconBeam: THREE.Mesh | null;
  beaconLight: THREE.PointLight | null;
  heater: THREE.Mesh | null;
}

function merged(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometryParts(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

export class StructureManager {
  readonly structures: Structure[] = [];
  private readonly scene: THREE.Scene;
  private readonly terrain: Terrain;
  private readonly hooks: StructureHooks;
  private readonly rng = new Rng('structures');
  private nextId = 1;

  private readonly metalMaterial: THREE.MeshStandardMaterial;
  private readonly darkMaterial: THREE.MeshStandardMaterial;
  private readonly woodMaterial: THREE.MeshStandardMaterial;
  private readonly stoneMaterial: THREE.MeshStandardMaterial;
  private readonly fabricMaterial: THREE.MeshStandardMaterial;
  private readonly accentMaterial: THREE.MeshStandardMaterial;
  private readonly amberMaterial: THREE.MeshStandardMaterial;
  private readonly flameMaterial: THREE.MeshBasicMaterial;
  private readonly flameCoreMaterial: THREE.MeshBasicMaterial;
  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly glowMaterial: THREE.MeshBasicMaterial;

  private readonly wallMetal: THREE.BufferGeometry;
  private readonly wallAccent: THREE.BufferGeometry;
  private readonly campfireWood: THREE.BufferGeometry;
  private readonly campfireStone: THREE.BufferGeometry;
  private readonly shelterFrame: THREE.BufferGeometry;
  private readonly shelterFabric: THREE.BufferGeometry;
  private readonly turretBase: THREE.BufferGeometry;
  private readonly turretHeadMetal: THREE.BufferGeometry;
  private readonly turretHeadAccent: THREE.BufferGeometry;
  private readonly beaconMetal: THREE.BufferGeometry;
  private readonly beaconAccent: THREE.BufferGeometry;
  private readonly flameGeometry: THREE.ConeGeometry;
  private readonly flameCoreGeometry: THREE.ConeGeometry;
  private readonly heaterGeometry: THREE.CylinderGeometry;
  private readonly ringGeometry: THREE.TorusGeometry;

  constructor(scene: THREE.Scene, terrain: Terrain, hooks: StructureHooks) {
    this.scene = scene;
    this.terrain = terrain;
    this.hooks = hooks;

    this.metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x738185,
      roughness: 0.55,
      metalness: 0.5,
      flatShading: true,
    });
    this.darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d383a,
      roughness: 0.7,
      metalness: 0.35,
      flatShading: true,
    });
    this.woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a4330,
      roughness: 0.94,
      flatShading: true,
    });
    this.stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x545650,
      roughness: 0.97,
      flatShading: true,
    });
    this.fabricMaterial = new THREE.MeshStandardMaterial({
      color: 0x8e978b,
      roughness: 0.9,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x7ffff0,
      emissive: 0x2ffff0,
      emissiveIntensity: 2.1,
      roughness: 0.3,
      metalness: 0.2,
    });
    this.amberMaterial = new THREE.MeshStandardMaterial({
      color: 0xffb45c,
      emissive: 0xff7b2e,
      emissiveIntensity: 1.7,
      roughness: 0.35,
    });
    this.flameMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9b46,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.flameCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe2a6,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x7affea,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x97fff0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    this.wallMetal = merged(
      boxPart(2.8, 2.1, 0.18, 0, 1.18, 0),
      boxPart(2.95, 0.22, 0.48, 0, 0.11, 0),
      boxPart(0.18, 2.48, 0.36, -1.38, 1.24, 0),
      boxPart(0.18, 2.48, 0.36, 1.38, 1.24, 0),
      boxPart(2.92, 0.16, 0.34, 0, 2.4, 0),
      boxPart(0.12, 2.05, 0.12, -0.55, 1.2, -0.2, 0, 0, 0.74),
      boxPart(0.12, 2.05, 0.12, 0.55, 1.2, -0.2, 0, 0, -0.74),
    );
    this.wallAccent = merged(
      boxPart(2.2, 0.055, 0.03, 0, 2.13, 0.11),
      boxPart(0.45, 0.16, 0.05, -1.1, 1.45, 0.12),
      boxPart(0.45, 0.16, 0.05, 1.1, 1.45, 0.12),
    );

    this.campfireWood = merged(
      cylinderPart(0.105, 0.12, 1.5, 6, 0, 0.28, 0, 0, 0.5, Math.PI * 0.5),
      cylinderPart(0.1, 0.115, 1.4, 6, 0, 0.3, 0, 0, -0.6, Math.PI * 0.5),
      cylinderPart(0.08, 0.1, 1.2, 6, 0.05, 0.37, 0, 0.35, 0, Math.PI * 0.55),
    );
    const stones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const stone = new THREE.DodecahedronGeometry(this.rng.range(0.17, 0.27), 0);
      stone.scale(1.3, 0.65, 1);
      stone.translate(Math.cos(angle) * 0.62, 0.1, Math.sin(angle) * 0.62);
      stones.push(stone);
    }
    this.campfireStone = merged(...stones);

    this.shelterFrame = merged(
      cylinderPart(2.05, 2.2, 0.16, 8, 0, 0.08, 0),
      cylinderPart(0.09, 0.1, 2.35, 5, -1.55, 1.25, -1.15),
      cylinderPart(0.09, 0.1, 2.35, 5, 1.55, 1.25, -1.15),
      cylinderPart(0.09, 0.1, 2.35, 5, -1.55, 1.25, 1.15),
      cylinderPart(0.09, 0.1, 2.35, 5, 1.55, 1.25, 1.15),
      cylinderPart(0.42, 0.5, 0.65, 7, 0, 0.48, 0),
      boxPart(0.5, 0.16, 0.5, 0, 0.82, 0),
      boxPart(1.55, 0.18, 0.2, -0.7, 2.38, 0, 0, 0, 0.1),
      boxPart(1.55, 0.18, 0.2, 0.7, 2.38, 0, 0, 0, -0.1),
    );
    this.shelterFabric = merged(
      (() => {
        const roof = new THREE.ConeGeometry(2.75, 1.2, 8, 1, true);
        roof.translate(0, 3.0, 0);
        return roof;
      })(),
      boxPart(2.7, 1.7, 0.06, 0, 1.55, -1.6),
      boxPart(0.06, 1.7, 2.2, -1.7, 1.55, 0.3, 0, 0.25, 0),
      boxPart(0.06, 1.7, 2.2, 1.7, 1.55, 0.3, 0, -0.25, 0),
    );

    this.turretBase = merged(
      cylinderPart(0.28, 0.42, 0.55, 7, 0, 0.28, 0),
      cylinderPart(0.08, 0.09, 1.35, 5, 0.7, 0.65, 0, 0, 0, 0.55),
      cylinderPart(0.08, 0.09, 1.35, 5, -0.7, 0.65, 0, 0, 0, -0.55),
      cylinderPart(0.08, 0.09, 1.35, 5, 0, 0.65, 0.7, 0.55, 0, 0),
      cylinderPart(0.42, 0.42, 0.14, 8, 0, 0.58, 0),
      cylinderPart(0.12, 0.12, 0.9, 6, 0, 1.05, 0),
    );
    this.turretHeadMetal = merged(
      cylinderPart(0.35, 0.4, 0.34, 7, 0, 0.3, 0),
      boxPart(0.55, 0.36, 0.55, 0, 0.3, 0),
      cylinderPart(0.055, 0.07, 0.9, 5, -0.15, 0.32, 0.6, Math.PI * 0.5, 0, 0),
      cylinderPart(0.055, 0.07, 0.9, 5, 0.15, 0.32, 0.6, Math.PI * 0.5, 0, 0),
      boxPart(0.5, 0.12, 0.3, 0, 0.1, -0.22),
    );
    this.turretHeadAccent = merged(
      boxPart(0.38, 0.08, 0.03, 0, 0.38, 0.31),
      (() => {
        const sphere = new THREE.SphereGeometry(0.11, 8, 6);
        sphere.translate(0, 0.45, 0.12);
        return sphere;
      })(),
    );

    this.beaconMetal = merged(
      cylinderPart(1.25, 1.45, 0.45, 10, 0, 0.23, 0),
      cylinderPart(0.2, 0.32, 4.2, 7, 0, 2.5, 0),
      cylinderPart(0.08, 0.12, 3.2, 5, 0.75, 2.2, 0.25, 0.1, 0, 0.2),
      cylinderPart(0.09, 0.11, 2.7, 5, -0.75, 1.95, -0.2, -0.12, 0, -0.2),
      (() => {
        const dish = new THREE.ConeGeometry(1.15, 0.55, 18, 1, true);
        dish.rotateX(Math.PI * 0.42);
        dish.translate(0, 3.55, 0.3);
        return dish;
      })(),
      cylinderPart(0.02, 0.04, 2.4, 4, 0, 5.6, 0),
    );
    this.beaconAccent = merged(
      (() => {
        const torus = new THREE.TorusGeometry(1.28, 0.045, 5, 32);
        torus.rotateX(Math.PI * 0.5);
        torus.translate(0, 0.5, 0);
        return torus;
      })(),
      boxPart(0.16, 0.16, 0.16, 0, 4.55, 0),
    );

    this.flameGeometry = new THREE.ConeGeometry(0.28, 0.95, 7);
    this.flameCoreGeometry = new THREE.ConeGeometry(0.15, 0.55, 6);
    this.heaterGeometry = new THREE.CylinderGeometry(0.28, 0.34, 0.55, 7);
    this.ringGeometry = new THREE.TorusGeometry(1.05, 0.04, 5, 32);
  }

  private createVisuals(type: BuildType): StructureVisuals {
    const group = new THREE.Group();
    let light: THREE.PointLight | null = null;
    const flames: THREE.Mesh[] = [];
    let turretHead: THREE.Group | null = null;
    let turretCore: THREE.Mesh | null = null;
    let beaconRing: THREE.Mesh | null = null;
    let beaconBeam: THREE.Mesh | null = null;
    let beaconLight: THREE.PointLight | null = null;
    let heater: THREE.Mesh | null = null;

    const addMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      castShadow = true,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    if (type === 'wall') {
      addMesh(this.wallMetal, this.metalMaterial);
      addMesh(this.wallAccent, this.amberMaterial, false);
    } else if (type === 'campfire') {
      addMesh(this.campfireWood, this.woodMaterial);
      addMesh(this.campfireStone, this.stoneMaterial);
      const flame = new THREE.Mesh(this.flameGeometry, this.flameMaterial);
      flame.position.y = 0.95;
      flame.visible = false;
      flame.renderOrder = 3;
      group.add(flame);
      flames.push(flame);
      const core = new THREE.Mesh(this.flameCoreGeometry, this.flameCoreMaterial);
      core.position.y = 0.87;
      core.visible = false;
      core.renderOrder = 3;
      group.add(core);
      flames.push(core);
      light = new THREE.PointLight(0xff8d43, 14, 16, 2);
      light.position.set(0, 1.25, 0);
      group.add(light);
    } else if (type === 'shelter') {
      addMesh(this.shelterFrame, this.metalMaterial);
      addMesh(this.shelterFabric, this.fabricMaterial);
      heater = new THREE.Mesh(this.heaterGeometry, this.amberMaterial);
      heater.position.y = 0.65;
      group.add(heater);
      light = new THREE.PointLight(0xffa45d, 9, 14, 2);
      light.position.set(0, 1.2, 0);
      group.add(light);
    } else if (type === 'turret') {
      addMesh(this.turretBase, this.metalMaterial);
      turretHead = new THREE.Group();
      turretHead.position.y = 1.4;
      const headMetal = new THREE.Mesh(this.turretHeadMetal, this.metalMaterial);
      headMetal.castShadow = true;
      turretHead.add(headMetal);
      const headAccent = new THREE.Mesh(this.turretHeadAccent, this.accentMaterial);
      turretHead.add(headAccent);
      turretCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        this.glowMaterial,
      );
      turretCore.position.set(0, 0.45, 0.12);
      turretHead.add(turretCore);
      group.add(turretHead);
    } else if (type === 'beacon') {
      addMesh(this.beaconMetal, this.metalMaterial);
      addMesh(this.beaconAccent, this.amberMaterial, false);
      beaconRing = new THREE.Mesh(this.ringGeometry, this.accentMaterial);
      beaconRing.rotation.x = Math.PI * 0.5;
      beaconRing.position.y = 3.7;
      group.add(beaconRing);
      beaconBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.72, 36, 8, 1, true),
        this.beamMaterial,
      );
      beaconBeam.position.y = 18;
      beaconBeam.visible = false;
      beaconBeam.renderOrder = 2;
      group.add(beaconBeam);
      beaconLight = new THREE.PointLight(0x7ffff0, 16, 26, 2);
      beaconLight.position.set(0, 4.2, 0);
      group.add(beaconLight);
    }
    return { group, light, flames, turretHead, turretCore, beaconRing, beaconBeam, beaconLight, heater };
  }

  create(
    type: BuildType,
    x: number,
    z: number,
    rotation: number,
    restore?: Partial<StructureSave>,
  ): Structure {
    const def = BUILDS[type];
    const visuals = this.createVisuals(type);
    const y = this.terrain.heightAt(x, z);
    visuals.group.position.set(x, y, z);
    visuals.group.rotation.y = rotation;
    this.scene.add(visuals.group);

    let id = restore?.id;
    if (!id) {
      id = `structure-${this.nextId}`;
      this.nextId++;
    } else {
      const numeric = Number.parseInt(id.replace(/^structure-/, ''), 10);
      if (Number.isFinite(numeric)) this.nextId = Math.max(this.nextId, numeric + 1);
    }

    const collisionRadius =
      type === 'shelter' ? 1.1 : type === 'campfire' ? 0.9 : type === 'turret' ? 0.8 : 1.55;
    let collision: CircleCollider | BoxCollider;
    if (type === 'wall') {
      const rotated = Math.abs(Math.sin(rotation)) > 0.5;
      const box: BoxCollider = {
        x,
        z,
        hx: rotated ? 0.24 : 1.42,
        hz: rotated ? 1.42 : 0.24,
        enabled: true,
        blocksSight: true,
        tag: 'structure',
        id,
      };
      this.hooks.addBox(box);
      collision = box;
    } else {
      const circle: CircleCollider = {
        x,
        z,
        radius: collisionRadius,
        enabled: true,
        blocksSight: type === 'shelter' || type === 'beacon',
        tag: 'structure',
        id,
      };
      this.hooks.addCircle(circle);
      collision = circle;
    }

    const structure: Structure = {
      id,
      type,
      x,
      z,
      y,
      rotation,
      health: restore?.health ?? def.health,
      maxHealth: def.health,
      fuel: type === 'campfire' ? (restore?.fuel ?? 240) : 0,
      charge: type === 'turret' ? (restore?.charge ?? 100) : 0,
      group: visuals.group,
      light: visuals.light,
      flames: visuals.flames,
      turretHead: visuals.turretHead,
      turretCore: visuals.turretCore,
      beaconRing: visuals.beaconRing,
      beaconBeam: visuals.beaconBeam,
      beaconLight: visuals.beaconLight,
      heater: visuals.heater,
      active: false,
      emberTimer: this.rng.range(0.2, 1.4),
      turretTimer: 0,
      phase: this.rng.range(0, Math.PI * 2),
      collision,
    };
    if (type === 'campfire') {
      for (const flame of structure.flames) flame.visible = structure.fuel > 0;
      if (structure.light) structure.light.intensity = structure.fuel > 0 ? 12 : 0;
    }
    this.structures.push(structure);
    return structure;
  }

  update(dt: number, elapsed: number, night: number, fx: FX): void {
    for (const structure of this.structures) {
      if (structure.type === 'campfire') {
        if (structure.fuel > 0) {
          structure.fuel = Math.max(0, structure.fuel - dt);
          const isLit = structure.fuel > 0;
          structure.flames[0]!.visible = isLit;
          structure.flames[1]!.visible = isLit;
          if (structure.light) {
            const flicker = 0.84 + Math.sin(elapsed * 9 + structure.phase) * 0.1 + Math.sin(elapsed * 17.3 + structure.phase * 2) * 0.06;
            structure.light.intensity = (2.5 + night * 12) * flicker;
          }
          if (isLit) {
            structure.flames[0]!.scale.set(
              1 + Math.sin(elapsed * 8 + structure.phase) * 0.1,
              0.85 + Math.sin(elapsed * 11 + structure.phase) * 0.2,
              1 + Math.cos(elapsed * 9 + structure.phase) * 0.1,
            );
            structure.flames[1]!.rotation.y = elapsed * 1.3;
            structure.emberTimer -= dt;
            if (structure.emberTimer <= 0) {
              structure.emberTimer = this.rng.range(0.12, 0.48);
              fx.ember(
                new THREE.Vector3(
                  structure.x + this.rng.range(-0.2, 0.2),
                  structure.y + 0.9,
                  structure.z + this.rng.range(-0.2, 0.2),
                ),
              );
            }
          }
        } else {
          for (const flame of structure.flames) flame.visible = false;
          if (structure.light) structure.light.intensity = 0;
        }
      } else if (structure.type === 'shelter') {
        if (structure.light) {
          structure.light.intensity = 3.2 + night * 3.8 + Math.sin(elapsed * 4 + structure.phase) * 0.35;
        }
        if (structure.heater) {
          structure.heater.rotation.y = elapsed * 0.35;
          structure.heater.scale.y = 1 + Math.sin(elapsed * 3 + structure.phase) * 0.035;
        }
      } else if (structure.type === 'turret') {
        structure.turretTimer = Math.max(0, structure.turretTimer - dt);
        if (structure.turretCore) {
          structure.turretCore.visible = structure.charge > 0;
          structure.turretCore.scale.setScalar(0.9 + Math.sin(elapsed * 4.2) * 0.1);
        }
      } else if (structure.type === 'beacon') {
        if (structure.beaconRing) {
          structure.beaconRing.rotation.z = elapsed * (structure.active ? 1.8 : 0.35);
          structure.beaconRing.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.04);
        }
        if (structure.beaconBeam) {
          structure.beaconBeam.visible = structure.active;
          if (structure.active) {
            (structure.beaconBeam.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(elapsed * 5) * 0.05;
            structure.beaconBeam.rotation.y = elapsed * 0.4;
          }
        }
        if (structure.beaconLight && structure.active) {
          structure.beaconLight.intensity = 12 + Math.sin(elapsed * 4.8) * 4;
        }
      }
    }
  }

  get count(): number {
    return this.structures.length;
  }

  countOf(type: BuildType): number {
    return this.structures.reduce((total, structure) => total + (structure.type === type ? 1 : 0), 0);
  }

  getBeacon(): Structure | null {
    return this.structures.find((structure) => structure.type === 'beacon') ?? null;
  }

  getShelter(): Structure | null {
    return this.structures.find((structure) => structure.type === 'shelter') ?? null;
  }

  getTurrets(): Structure[] {
    return this.structures.filter((structure) => structure.type === 'turret' && structure.charge > 0);
  }

  warmthAt(x: number, z: number): WarmthResult {
    let best: WarmthResult = { near: false, radius: 0, source: null };
    for (const structure of this.structures) {
      if (structure.type === 'campfire' && structure.fuel > 0) {
        const radius = BUILDS.campfire.warmthRadius ?? 7.5;
        if (Math.hypot(x - structure.x, z - structure.z) < radius) {
          return { near: true, radius, source: 'campfire' };
        }
      }
      if (structure.type === 'shelter') {
        const radius = BUILDS.shelter.warmthRadius ?? 10;
        if (Math.hypot(x - structure.x, z - structure.z) < radius) {
          return { near: true, radius, source: 'shelter' };
        }
      }
      if (structure.type === 'beacon' && structure.active) {
        if (Math.hypot(x - structure.x, z - structure.z) < 15) {
          best = { near: true, radius: 15, source: 'shelter' };
        }
      }
    }
    return best;
  }

  litCampfireNear(x: number, z: number, range = 4.8): Structure | null {
    for (const structure of this.structures) {
      if (structure.type !== 'campfire' || structure.fuel <= 0) continue;
      if (Math.hypot(x - structure.x, z - structure.z) <= range) return structure;
    }
    return null;
  }

  nearestByDistance(x: number, z: number, maxDistance: number): Structure | null {
    let nearest: Structure | null = null;
    let distance = maxDistance;
    for (const structure of this.structures) {
      const current = Math.hypot(x - structure.x, z - structure.z);
      if (current < distance) {
        distance = current;
        nearest = structure;
      }
    }
    return nearest;
  }

  addFuel(structure: Structure, seconds: number): number {
    if (structure.type !== 'campfire') return structure.fuel;
    structure.fuel = Math.min(360, structure.fuel + seconds);
    return structure.fuel;
  }

  rechargeTurret(structure: Structure, amount: number): number {
    structure.charge = Math.min(100, structure.charge + amount);
    return structure.charge;
  }

  fireTurret(structure: Structure, target: THREE.Vector3, fx: FX): boolean {
    if (structure.type !== 'turret' || structure.charge < 1 || !structure.turretHead) return false;
    structure.charge -= 1;
    const head = structure.turretHead;
    const dx = target.x - structure.x;
    const dz = target.z - structure.z;
    head.rotation.y = Math.atan2(dx, dz) - structure.rotation;
    head.updateWorldMatrix(true, true);
    const muzzle = new THREE.Vector3(0, 0.32, 0.95);
    head.localToWorld(muzzle);
    const end = target.clone();
    end.y += 0.8;
    fx.tracer(muzzle, end, 0x7ffff0, 0.9);
    fx.burst(muzzle, 0x7ffff0, 3, { speed: 1.4, life: 0.2, size: 0.05, gravity: 0, upward: 0.2 });
    return true;
  }

  activateBeacon(structure: Structure): void {
    if (structure.type !== 'beacon') return;
    structure.active = true;
    if (structure.beaconBeam) structure.beaconBeam.visible = true;
    if (structure.beaconLight) structure.beaconLight.intensity = 16;
  }

  damage(structure: Structure, amount: number, fx: FX): boolean {
    if (!this.structures.includes(structure)) return false;
    structure.health -= amount;
    fx.impact(
      new THREE.Vector3(
        structure.x + this.rng.range(-0.4, 0.4),
        structure.y + 1.1,
        structure.z + this.rng.range(-0.4, 0.4),
      ),
      0xffb15a,
    );
    if (structure.health > 0) return false;
    this.remove(structure, fx);
    return true;
  }

  remove(structure: Structure, fx: FX): void {
    const index = this.structures.indexOf(structure);
    if (index === -1) return;
    if (structure.collision.tag === 'structure') {
      if ('hx' in structure.collision) this.hooks.removeBox(structure.collision);
      else this.hooks.removeCircle(structure.collision);
    }
    this.scene.remove(structure.group);
    if (structure.light) structure.light.dispose();
    if (structure.beaconLight) structure.beaconLight.dispose();
    fx.burst(new THREE.Vector3(structure.x, structure.y + 0.8, structure.z), 0xffb36a, 28, {
      speed: 4,
      life: 1,
      size: 0.12,
      gravity: -5,
    });
    this.structures.splice(index, 1);
  }

  serialize(): StructureSave[] {
    return this.structures.map((structure) => ({
      id: structure.id,
      type: structure.type,
      x: structure.x,
      z: structure.z,
      rotation: structure.rotation,
      health: structure.health,
      fuel: structure.fuel,
      charge: structure.charge,
    }));
  }

  dispose(): void {
    for (const structure of this.structures) {
      this.scene.remove(structure.group);
      if (structure.light) structure.light.dispose();
      if (structure.beaconLight) structure.beaconLight.dispose();
    }
    this.structures.length = 0;
    for (const geometry of [
      this.wallMetal,
      this.wallAccent,
      this.campfireWood,
      this.campfireStone,
      this.shelterFrame,
      this.shelterFabric,
      this.turretBase,
      this.turretHeadMetal,
      this.turretHeadAccent,
      this.beaconMetal,
      this.beaconAccent,
      this.flameGeometry,
      this.flameCoreGeometry,
      this.heaterGeometry,
      this.ringGeometry,
    ]) {
      geometry.dispose();
    }
    for (const material of [
      this.metalMaterial,
      this.darkMaterial,
      this.woodMaterial,
      this.stoneMaterial,
      this.fabricMaterial,
      this.accentMaterial,
      this.amberMaterial,
      this.flameMaterial,
      this.flameCoreMaterial,
      this.beamMaterial,
      this.glowMaterial,
    ]) {
      material.dispose();
    }
  }
}
