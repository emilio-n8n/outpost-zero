import * as THREE from 'three';
import { OUTPOST, QUALITY, WORLD, type QualityLevel } from '../config';
import { daylight, moonDirection, nightStrength, skyPalette, sunDirection } from '../game/daynight';
import { Rng } from '../core/Rng';
import { lerp } from '../core/noise';
import type { FX } from '../fx/FX';
import { Landmarks } from './Landmarks';
import { ResourceManager } from './ResourceManager';
import { Scatter } from './Scatter';
import { Sky } from './Sky';
import { StructureManager } from './Structures';
import { Terrain } from './Terrain';
import type { BoxCollider, CircleCollider, WorldInteractable, WorldPOI } from './types';

export class World {
  readonly seed: string;
  readonly terrain: Terrain;
  readonly sky: Sky;
  readonly scatter: Scatter;
  readonly landmarks: Landmarks;
  readonly resources: ResourceManager;
  readonly structures: StructureManager;
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  readonly interactables: WorldInteractable[];
  readonly pois: WorldPOI[];
  private readonly scene: THREE.Scene;
  private readonly circles: CircleCollider[] = [];
  private readonly boxes: BoxCollider[] = [];
  private readonly motes: THREE.Points;
  private readonly moteMaterial: THREE.PointsMaterial;
  private readonly fog: THREE.FogExp2;
  private elapsed = 0;

  constructor(scene: THREE.Scene, seed: string, looted: readonly string[] = []) {
    this.scene = scene;
    this.seed = seed;
    scene.background = new THREE.Color(0x071216);
    this.fog = new THREE.FogExp2(0x071216, 0.0115);
    scene.fog = this.fog;

    this.terrain = new Terrain(seed, scene);
    this.sky = new Sky(scene);

    this.hemisphere = new THREE.HemisphereLight(0x9bd8d2, 0x241c17, 1.1);
    scene.add(this.hemisphere);
    this.ambient = new THREE.AmbientLight(0x2c3d3f, 0.35);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffc38b, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(QUALITY.medium.shadowMapSize, QUALITY.medium.shadowMapSize);
    this.sun.shadow.camera.left = -32;
    this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32;
    this.sun.shadow.camera.bottom = -32;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x8fb9e8, 0.45);
    scene.add(this.moon);
    scene.add(this.moon.target);

    this.scatter = new Scatter(scene, this.terrain, seed);
    for (const rock of this.scatter.colliders) {
      this.circles.push({
        x: rock.x,
        z: rock.z,
        radius: rock.radius,
        enabled: true,
        blocksSight: rock.radius > 0.9,
        tag: 'scatter',
      });
    }

    this.landmarks = new Landmarks(
      scene,
      this.terrain,
      seed,
      (collider) => this.addCircleCollider(collider),
      new Set(looted),
    );
    this.interactables = this.landmarks.interactables;
    this.pois = this.landmarks.pois;

    const blocked = this.circles.map((collider) => ({
      x: collider.x,
      z: collider.z,
      radius: collider.radius,
    }));
    this.resources = new ResourceManager(
      scene,
      this.terrain,
      seed,
      blocked,
      (collider) => this.addCircleCollider(collider),
    );

    this.structures = new StructureManager(scene, this.terrain, {
      addCircle: (collider) => this.addCircleCollider(collider),
      addBox: (collider) => this.addBoxCollider(collider),
      removeCircle: (collider) => this.removeCircleCollider(collider),
      removeBox: (collider) => this.removeBoxCollider(collider),
    });

    this.moteMaterial = new THREE.PointsMaterial({
      color: 0xb8ffe9,
      size: 0.14,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      sizeAttenuation: true,
    });
    const rng = new Rng(`${seed}:motes`);
    const positions: number[] = [];
    for (let i = 0; i < 460; i++) {
      positions.push(rng.range(-90, 90), rng.range(0.4, 11), rng.range(-90, 90));
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.motes = new THREE.Points(moteGeometry, this.moteMaterial);
    this.motes.name = 'spores';
    this.motes.frustumCulled = false;
    scene.add(this.motes);
  }

  addCircleCollider(collider: CircleCollider): CircleCollider {
    this.circles.push(collider);
    return collider;
  }

  addBoxCollider(collider: BoxCollider): BoxCollider {
    this.boxes.push(collider);
    return collider;
  }

  removeCircleCollider(collider: CircleCollider): void {
    const index = this.circles.indexOf(collider);
    if (index !== -1) this.circles.splice(index, 1);
  }

  removeBoxCollider(collider: BoxCollider): void {
    const index = this.boxes.indexOf(collider);
    if (index !== -1) this.boxes.splice(index, 1);
  }

  applyQuality(quality: QualityLevel): void {
    const settings = QUALITY[quality];
    this.sun.castShadow = settings.shadows;
    this.sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  update(
    dt: number,
    clock: number,
    camera: THREE.Camera,
    playerPosition: THREE.Vector3,
    fx: FX,
    simulate: boolean,
  ): void {
    this.elapsed += dt;
    const night = nightStrength(clock);
    const palette = skyPalette(clock);
    this.sky.update(camera, clock, this.elapsed, night);

    const sunDir = sunDirection(clock);
    const moonDir = moonDirection(clock);
    const sunY = Math.max(0, sunDir.y);
    this.sun.position.set(
      playerPosition.x + sunDir.x * 68,
      playerPosition.y + Math.max(6, sunDir.y * 68),
      playerPosition.z + sunDir.z * 68,
    );
    this.sun.target.position.copy(playerPosition);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = 0.35 + daylight(clock) * 3.5;
    this.sun.color.setHex(palette.sun);
    this.moon.position.set(
      playerPosition.x + moonDir.x * 55,
      playerPosition.y + Math.max(8, moonDir.y * 55),
      playerPosition.z + moonDir.z * 55,
    );
    this.moon.target.position.copy(playerPosition);
    this.moon.target.updateMatrixWorld();
    this.moon.intensity = night * 0.9;
    this.hemisphere.intensity = 0.52 + daylight(clock) * 1.05;
    this.hemisphere.color.setHex(palette.horizon);
    this.hemisphere.groundColor.setHex(0x1a1712);
    this.ambient.intensity = 0.36 + daylight(clock) * 0.2;
    this.fog.color.setHex(palette.fog);
    this.fog.density = lerp(0.0105, 0.0175, night) + (1 - Math.abs(sunY) * 4) * 0.0007;

    this.motes.rotation.y = this.elapsed * 0.004;
    this.motes.position.y = Math.sin(this.elapsed * 0.12) * 0.5;
    this.moteMaterial.opacity = 0.12 + night * 0.32;

    this.landmarks.update(dt, this.elapsed, fx);
    if (simulate) {
      this.resources.update(dt, this.elapsed);
      this.structures.update(dt, this.elapsed, night, fx);
    }
  }

  groundHeight(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  isAreaFree(x: number, z: number, radius: number): boolean {
    for (const collider of this.circles) {
      if (!collider.enabled) continue;
      if (Math.hypot(x - collider.x, z - collider.z) < radius + collider.radius + 0.08) {
        return false;
      }
    }
    for (const box of this.boxes) {
      if (!box.enabled) continue;
      const closestX = Math.max(box.x - box.hx, Math.min(x, box.x + box.hx));
      const closestZ = Math.max(box.z - box.hz, Math.min(z, box.z + box.hz));
      if (Math.hypot(x - closestX, z - closestZ) < radius + 0.08) return false;
    }
    return true;
  }

  isBoxFree(x: number, z: number, hx: number, hz: number): boolean {
    for (const collider of this.circles) {
      if (!collider.enabled) continue;
      const closestX = Math.max(x - hx, Math.min(collider.x, x + hx));
      const closestZ = Math.max(z - hz, Math.min(collider.z, z + hz));
      if (Math.hypot(collider.x - closestX, collider.z - closestZ) < collider.radius + 0.06) {
        return false;
      }
    }
    for (const box of this.boxes) {
      if (!box.enabled) continue;
      if (
        Math.abs(x - box.x) < hx + box.hx + 0.04 &&
        Math.abs(z - box.z) < hz + box.hz + 0.04
      ) {
        return false;
      }
    }
    return true;
  }

  resolveMovement(
    x: number,
    z: number,
    radius: number,
    dx: number,
    dz: number,
  ): { x: number; z: number } {
    let px = x + dx;
    let pz = z + dz;
    const boundary = WORLD.playableRadius - 2;
    const distanceFromCenter = Math.hypot(px, pz);
    if (distanceFromCenter > boundary) {
      const scale = boundary / distanceFromCenter;
      px *= scale;
      pz *= scale;
    }

    for (let iteration = 0; iteration < 3; iteration++) {
      for (const collider of this.circles) {
        if (!collider.enabled) continue;
        let ox = px - collider.x;
        let oz = pz - collider.z;
        const minDistance = radius + collider.radius;
        let distance = Math.hypot(ox, oz);
        if (distance < minDistance) {
          if (distance < 0.0001) {
            ox = 1;
            oz = 0;
            distance = 1;
          }
          const push = (minDistance - distance) / distance;
          px += ox * push;
          pz += oz * push;
        }
      }
      for (const box of this.boxes) {
        if (!box.enabled) continue;
        const closestX = Math.max(box.x - box.hx, Math.min(px, box.x + box.hx));
        const closestZ = Math.max(box.z - box.hz, Math.min(pz, box.z + box.hz));
        let ox = px - closestX;
        let oz = pz - closestZ;
        let distance = Math.hypot(ox, oz);
        if (distance < radius) {
          if (distance < 0.0001) {
            const left = Math.abs(px - (box.x - box.hx));
            const right = Math.abs(box.x + box.hx - px);
            const back = Math.abs(pz - (box.z - box.hz));
            const front = Math.abs(box.z + box.hz - pz);
            const min = Math.min(left, right, back, front);
            if (min === left) {
              ox = -1;
              oz = 0;
            } else if (min === right) {
              ox = 1;
              oz = 0;
            } else if (min === back) {
              ox = 0;
              oz = -1;
            } else {
              ox = 0;
              oz = 1;
            }
            distance = 1;
          }
          const push = (radius - distance) / distance;
          px += ox * push;
          pz += oz * push;
        }
      }
    }
    return { x: px, z: pz };
  }

  private rayCircle(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    collider: CircleCollider,
    maxDistance: number,
  ): number | null {
    const ox = origin.x - collider.x;
    const oz = origin.z - collider.z;
    const a = direction.x * direction.x + direction.z * direction.z;
    if (a < 1e-7) return null;
    const b = 2 * (ox * direction.x + oz * direction.z);
    const c = ox * ox + oz * oz - (collider.radius + 0.04) * (collider.radius + 0.04);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const sqrt = Math.sqrt(discriminant);
    const t1 = (-b - sqrt) / (2 * a);
    if (t1 >= 0 && t1 <= maxDistance) return t1;
    const t2 = (-b + sqrt) / (2 * a);
    if (t2 >= 0 && t2 <= maxDistance) return t2;
    return null;
  }

  private rayBox(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    box: BoxCollider,
    maxDistance: number,
  ): number | null {
    let tMin = 0;
    let tMax = maxDistance;
    const axes: Array<[number, number, number, number]> = [
      [origin.x, direction.x, box.x - box.hx, box.x + box.hx],
      [origin.z, direction.z, box.z - box.hz, box.z + box.hz],
    ];
    for (const [originAxis, dirAxis, min, max] of axes) {
      if (Math.abs(dirAxis) < 1e-7) {
        if (originAxis < min || originAxis > max) return null;
      } else {
        const t1 = (min - originAxis) / dirAxis;
        const t2 = (max - originAxis) / dirAxis;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
        if (tMin > tMax) return null;
      }
    }
    return tMin >= 0 ? tMin : null;
  }

  raycastStatics(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    includeTerrain = true,
  ): number | null {
    let nearest: number | null = null;
    for (const collider of this.circles) {
      if (!collider.enabled || !collider.blocksSight) continue;
      const hit = this.rayCircle(origin, direction, collider, maxDistance);
      if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
    }
    for (const box of this.boxes) {
      if (!box.enabled || !box.blocksSight) continue;
      const hit = this.rayBox(origin, direction, box, maxDistance);
      if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
    }
    if (includeTerrain) {
      const step = 1.35;
      for (let t = 1.2; t < maxDistance; t += step) {
        const px = origin.x + direction.x * t;
        const py = origin.y + direction.y * t;
        const pz = origin.z + direction.z * t;
        if (py <= this.terrain.heightAt(px, pz) + 0.08) {
          if (nearest === null || t < nearest) nearest = t;
          break;
        }
      }
    }
    return nearest;
  }

  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance < 0.01) return true;
    direction.divideScalar(distance);
    const hit = this.raycastStatics(from, direction, distance - 0.4, true);
    return hit === null;
  }

  nearestInteractable(position: THREE.Vector3, maxDistance = 3.4): WorldInteractable | null {
    let nearest: WorldInteractable | null = null;
    let nearestDistance = maxDistance;
    for (const interactable of this.interactables) {
      if (interactable.looted) continue;
      const distance = interactable.position.distanceTo(position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = interactable;
      }
    }
    return nearest;
  }

  takeInteractable(interactable: WorldInteractable): void {
    if (interactable.looted) return;
    interactable.looted = true;
    interactable.object.visible = false;
  }

  getLootedIds(): string[] {
    return this.landmarks.getLootedIds();
  }

  getSpawnPoint(): THREE.Vector3 {
    return new THREE.Vector3(
      OUTPOST.playerSpawn.x,
      this.terrain.heightAt(OUTPOST.playerSpawn.x, OUTPOST.playerSpawn.z),
      OUTPOST.playerSpawn.z,
    );
  }

  dispose(): void {
    this.resources.dispose(this.scene);
    this.structures.dispose();
    this.landmarks.dispose();
    this.scatter.dispose(this.scene);
    this.sky.dispose(this.scene);
    this.terrain.dispose(this.scene);
    this.scene.remove(this.hemisphere, this.ambient, this.sun, this.sun.target, this.moon, this.moon.target);
    this.scene.remove(this.motes);
    this.motes.geometry.dispose();
    this.moteMaterial.dispose();
    this.scene.fog = null;
  }
}
