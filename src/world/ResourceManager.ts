import * as THREE from 'three';
import { NODE_INFO, type ResourceId } from '../game/data';
import { RESOURCE_NODES as NODE_CONFIG } from '../config';
import { OUTPOST, SITES } from '../config';
import { Rng } from '../core/Rng';
import { fbm2D } from '../core/noise';
import type { CircleCollider } from './types';
import type { Terrain } from './Terrain';

interface NodeInstance {
  mesh: THREE.InstancedMesh;
  index: number;
  base: THREE.Matrix4;
}

export interface ResourceNode {
  id: string;
  type: ResourceId;
  position: THREE.Vector3;
  scale: number;
  radius: number;
  visible: boolean;
  respawnRemaining: number;
  collider: CircleCollider;
  instances: NodeInstance[];
}

interface Bucket {
  mesh: THREE.InstancedMesh;
  used: number;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.getAttribute('position').count;
    indexCount += part.index ? part.index.count : part.getAttribute('position').count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  let vOffset = 0;
  let iOffset = 0;
  for (const part of parts) {
    const pos = part.getAttribute('position');
    const norm = part.getAttribute('normal');
    const uv = part.getAttribute('uv');
    positions.set(pos.array as Float32Array, vOffset * 3);
    if (norm) normals.set(norm.array as Float32Array, vOffset * 3);
    if (uv) uvs.set(uv.array as Float32Array, vOffset * 2);
    if (part.index) {
      for (let i = 0; i < part.index.count; i++) {
        indices[iOffset + i] = (part.index.array[i] as number) + vOffset;
      }
      iOffset += part.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) indices[iOffset + i] = i + vOffset;
      iOffset += pos.count;
    }
    vOffset += pos.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function makeEnergyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rng = new Rng('energy-shards');
  for (let i = 0; i < 6; i++) {
    const height = rng.range(0.7, 1.8);
    const shard = new THREE.ConeGeometry(rng.range(0.09, 0.2), height, 5, 1);
    shard.translate(0, height * 0.5, 0);
    shard.rotateZ(rng.range(-0.35, 0.35));
    shard.rotateX(rng.range(-0.28, 0.28));
    shard.translate(rng.range(-0.45, 0.45), 0, rng.range(-0.45, 0.45));
    parts.push(shard);
  }
  const merged = merge(parts);
  for (const part of parts) part.dispose();
  return merged;
}

function makeScrapGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rng = new Rng('scrap-pile');
  for (let i = 0; i < 7; i++) {
    const box = new THREE.BoxGeometry(rng.range(0.35, 0.9), rng.range(0.12, 0.28), rng.range(0.3, 1.05));
    box.rotateY(rng.range(0, Math.PI));
    box.rotateZ(rng.range(-0.28, 0.28));
    box.translate(rng.range(-0.5, 0.5), rng.range(0.08, 0.38), rng.range(-0.5, 0.5));
    parts.push(box);
  }
  const cylinder = new THREE.CylinderGeometry(0.24, 0.24, 0.9, 7);
  cylinder.rotateZ(Math.PI * 0.5);
  cylinder.translate(0.15, 0.25, -0.1);
  parts.push(cylinder);
  const merged = merge(parts);
  for (const part of parts) part.dispose();
  return merged;
}

export class ResourceManager {
  readonly nodes: ResourceNode[] = [];
  private readonly scene: THREE.Scene;
  private readonly terrain: Terrain;
  private readonly buckets: Record<ResourceId, Bucket[]> = {
    wood: [],
    metal: [],
    energy: [],
    food: [],
  };
  private readonly energyMaterial: THREE.MeshStandardMaterial;
  private readonly highlight: THREE.Mesh;
  private readonly highlightMaterial: THREE.MeshBasicMaterial;
  private readonly occupied: Array<{ x: number; z: number; radius: number }> = [];
  private readonly addCollider: (collider: CircleCollider) => void;
  private elapsed = 0;
  private highlightNode: ResourceNode | null = null;

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    seed: string,
    blocked: Array<{ x: number; z: number; radius: number }>,
    addCollider: (collider: CircleCollider) => void,
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.addCollider = addCollider;
    this.occupied.push(...blocked);

    const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.34, 4.6, 6);
    trunkGeometry.translate(0, 2.3, 0);
    const canopyGeometry = new THREE.SphereGeometry(1.8, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
    canopyGeometry.scale(1.22, 0.72, 1.22);
    canopyGeometry.translate(0, 4.55, 0);
    const foodStem = new THREE.CylinderGeometry(0.035, 0.065, 1.05, 5);
    foodStem.translate(0, 0.52, 0);
    const foodBulb = new THREE.SphereGeometry(0.34, 8, 5);
    foodBulb.scale(0.8, 1.25, 0.8);
    foodBulb.translate(0, 1.1, 0);

    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      flatShading: true,
    });
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x125c50,
      emissiveIntensity: 0.55,
      roughness: 0.78,
      flatShading: true,
    });
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0x4b3e44,
      roughness: 0.85,
      flatShading: true,
    });
    const bulbMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x601d58,
      emissiveIntensity: 0.75,
      roughness: 0.55,
      flatShading: true,
    });
    const scrapMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.58,
      metalness: 0.46,
      flatShading: true,
    });
    this.energyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x22ffe0,
      emissiveIntensity: 1.25,
      roughness: 0.18,
      metalness: 0.15,
      flatShading: true,
    });

    const woodTrunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, 70);
    const woodCanopy = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, 70);
    const metal = new THREE.InstancedMesh(makeScrapGeometry(), scrapMaterial, 42);
    const energy = new THREE.InstancedMesh(makeEnergyGeometry(), this.energyMaterial, 38);
    const foodStemMesh = new THREE.InstancedMesh(foodStem, stemMaterial, 46);
    const foodBulbMesh = new THREE.InstancedMesh(foodBulb, bulbMaterial, 46);
    woodTrunk.castShadow = true;
    woodCanopy.castShadow = true;
    woodTrunk.receiveShadow = true;
    woodCanopy.receiveShadow = true;
    metal.castShadow = true;
    metal.receiveShadow = true;
    energy.castShadow = false;
    foodBulbMesh.castShadow = true;

    this.buckets.wood = [
      { mesh: woodTrunk, used: 0 },
      { mesh: woodCanopy, used: 0 },
    ];
    this.buckets.metal = [{ mesh: metal, used: 0 }];
    this.buckets.energy = [{ mesh: energy, used: 0 }];
    this.buckets.food = [
      { mesh: foodStemMesh, used: 0 },
      { mesh: foodBulbMesh, used: 0 },
    ];
    for (const bucket of Object.values(this.buckets).flat()) {
      bucket.mesh.name = `resource-${bucket.mesh.uuid}`;
      bucket.mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      scene.add(bucket.mesh);
    }

    this.highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb35c,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.highlight = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.92, 32), this.highlightMaterial);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    this.highlight.renderOrder = 4;
    scene.add(this.highlight);

    this.generateNodes(seed);
    for (const bucket of Object.values(this.buckets).flat()) {
      bucket.mesh.count = bucket.used;
      bucket.mesh.instanceMatrix.needsUpdate = true;
      if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
      bucket.mesh.computeBoundingSphere();
    }
  }

  private canPlace(
    type: ResourceId,
    x: number,
    z: number,
    radius: number,
    exclusion: number,
  ): boolean {
    const centerDistance = Math.hypot(x - OUTPOST.x, z - OUTPOST.z);
    if (centerDistance < exclusion) return false;
    if (centerDistance > 88) return false;
    for (const site of SITES) {
      if (Math.hypot(x - site.x, z - site.z) < site.radius + 2.5) return false;
    }
    const maxSlope = type === 'energy' ? 0.36 : type === 'metal' ? 0.3 : 0.22;
    if (this.terrain.slopeAt(x, z) > maxSlope) return false;
    if (this.terrain.heightAt(x, z) > 15) return false;
    for (const item of this.occupied) {
      if (Math.hypot(x - item.x, z - item.z) < radius + item.radius + 0.85) return false;
    }
    return true;
  }

  private addNode(
    type: ResourceId,
    x: number,
    z: number,
    scale: number,
    rotation: number,
    rng: Rng,
  ): ResourceNode | null {
    const buckets = this.buckets[type];
    if (!buckets.length || buckets.some((bucket) => bucket.used >= bucket.mesh.instanceMatrix.count)) {
      return null;
    }
    const y = this.terrain.heightAt(x, z);
    const base = new THREE.Matrix4();
    const position = new THREE.Vector3(x, y, z);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotation, 0));
    const scaleVector = new THREE.Vector3(scale, scale * rng.range(0.88, 1.16), scale);
    base.compose(position, quaternion, scaleVector);

    const instances: NodeInstance[] = [];
    const index = buckets[0]?.used ?? 0;
    for (const bucket of buckets) {
      bucket.mesh.setMatrixAt(bucket.used, base);
      bucket.used++;
      instances.push({ mesh: bucket.mesh, index: bucket.used - 1, base: base.clone() });
    }

    if (type === 'wood') {
      const trunk = buckets[0]?.mesh;
      const canopy = buckets[1]?.mesh;
      const trunkColor = new THREE.Color().setHSL(rng.range(0.06, 0.1), rng.range(0.18, 0.34), rng.range(0.17, 0.3));
      const leafColor = new THREE.Color().setHSL(
        rng.range(0.35, 0.53),
        rng.range(0.3, 0.52),
        rng.range(0.24, 0.42),
      );
      if (trunk) trunk.setColorAt(index, trunkColor);
      if (canopy) canopy.setColorAt(index, leafColor);
    } else if (type === 'metal') {
      const mesh = buckets[0]?.mesh;
      const color = new THREE.Color().setHSL(rng.range(0.48, 0.58), rng.range(0.04, 0.15), rng.range(0.3, 0.48));
      if (rng.chance(0.35)) color.lerp(new THREE.Color(0x9c5e36), 0.35);
      if (mesh) mesh.setColorAt(index, color);
    } else if (type === 'energy') {
      const mesh = buckets[0]?.mesh;
      const color = new THREE.Color().setHSL(rng.range(0.44, 0.55), rng.range(0.55, 0.9), rng.range(0.55, 0.72));
      if (mesh) mesh.setColorAt(index, color);
    } else if (type === 'food') {
      const stem = buckets[0]?.mesh;
      const bulb = buckets[1]?.mesh;
      if (stem) stem.setColorAt(index, new THREE.Color(0x4a3d33));
      if (bulb) {
        bulb.setColorAt(
          index,
          new THREE.Color().setHSL(rng.range(0.78, 0.92), rng.range(0.4, 0.65), rng.range(0.45, 0.62)),
        );
      }
    }

    const collider = this.addCollider({
      x,
      z,
      radius: radius,
      enabled: true,
      blocksSight: type === 'wood' || type === 'energy',
      tag: 'node',
      id: `${type}-${this.nodes.length}`,
    });

    const node: ResourceNode = {
      id: `${type}-${this.nodes.length}`,
      type,
      position,
      scale,
      radius,
      visible: true,
      respawnRemaining: 0,
      collider,
      instances,
    };
    collider.id = node.id;
    this.nodes.push(node);
    this.occupied.push({ x, z, radius });
    return node;
  }

  private generateNodes(seed: string): void {
    const rng = new Rng(`${seed}:nodes`);
    const counts: Record<ResourceId, number> = { wood: 54, metal: 30, energy: 28, food: 34 };
    const placed: Record<ResourceId, number> = { wood: 0, metal: 0, energy: 0, food: 0 };

    const tryPlace = (
      type: ResourceId,
      x: number,
      z: number,
      exclusion: number,
      force = false,
    ): boolean => {
      const nodeRng = rng.fork(`${type}:${placed[type]}`);
      const scale = type === 'energy' ? nodeRng.range(0.75, 1.25) : nodeRng.range(0.8, 1.3);
      const radius = NODE_CONFIG[type].radius * scale;
      if (!force && !this.canPlace(type, x, z, radius, exclusion)) return false;
      const node = this.addNode(type, x, z, scale, nodeRng.range(0, Math.PI * 2), nodeRng);
      if (!node) return false;
      placed[type]++;
      return true;
    };

    const ring = (type: ResourceId, count: number, minRadius: number, maxRadius: number, seedOffset: number) => {
      for (let i = 0; i < count; i++) {
        for (let attempt = 0; attempt < 25; attempt++) {
          const angle = rng.range(0, Math.PI * 2) + seedOffset;
          const radius = rng.range(minRadius, maxRadius);
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          if (tryPlace(type, x, z, minRadius - 1)) break;
        }
      }
    };

    ring('wood', 9, 19, 31, 0.25);
    ring('metal', 5, 20, 34, 1.4);
    ring('energy', 4, 24, 38, 2.1);
    ring('food', 6, 20, 34, 3.2);

    for (const site of SITES) {
      for (let i = 0; i < 5; i++) {
        for (let attempt = 0; attempt < 20; attempt++) {
          const angle = rng.range(0, Math.PI * 2);
          const distance = site.radius + rng.range(3.5, 10);
          const x = site.x + Math.cos(angle) * distance;
          const z = site.z + Math.sin(angle) * distance;
          if (tryPlace(i % 2 === 0 ? 'metal' : 'wood', x, z, 0)) break;
        }
      }
    }

    const types: ResourceId[] = ['wood', 'metal', 'energy', 'food'];
    const attempts = 9000;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const type = types[attempt % types.length] as ResourceId;
      if (placed[type] >= counts[type]) continue;
      const angle = rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(rng.next()) * 87;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      let bias = 0;
      if (type === 'wood') bias = fbm2D(x * 0.032, z * 0.032, 71, 3);
      if (type === 'food') bias = fbm2D(x * 0.042 + 8, z * 0.042, 81, 3);
      if (type === 'energy') bias = fbm2D(x * 0.05 - 4, z * 0.05, 91, 3);
      if (bias < 0.42 && rng.chance(0.55)) continue;
      tryPlace(type, x, z, 15);
      if (types.every((entry) => placed[entry] >= counts[entry])) break;
    }
  }

  applyCooldowns(cooldowns: Record<string, number>): void {
    for (const node of this.nodes) {
      const remaining = cooldowns[node.id];
      if (typeof remaining === 'number' && remaining > 0) {
        this.setVisible(node, false);
        node.respawnRemaining = remaining;
      }
    }
  }

  getCooldowns(): Record<string, number> {
    const cooldowns: Record<string, number> = {};
    for (const node of this.nodes) {
      if (!node.visible && node.respawnRemaining > 0) {
        cooldowns[node.id] = Math.round(node.respawnRemaining * 10) / 10;
      }
    }
    return cooldowns;
  }

  private setVisible(node: ResourceNode, visible: boolean): void {
    node.visible = visible;
    node.collider.enabled = visible;
    const hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (const instance of node.instances) {
      instance.mesh.setMatrixAt(instance.index, visible ? instance.base : hidden);
      instance.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  nearestNode(position: THREE.Vector3, maxDistance = 3.6): ResourceNode | null {
    let nearest: ResourceNode | null = null;
    let nearestDistance = maxDistance;
    for (const node of this.nodes) {
      if (!node.visible) continue;
      const dx = node.position.x - position.x;
      const dz = node.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  setHighlight(node: ResourceNode | null): void {
    if (this.highlightNode === node) return;
    this.highlightNode = node;
    if (!node) {
      this.highlight.visible = false;
      return;
    }
    this.highlight.visible = true;
    this.highlight.position.set(node.position.x, node.position.y + 0.045, node.position.z);
    this.highlight.scale.setScalar(Math.max(1, node.radius * 1.8));
    const color = NODE_INFO[node.type].color;
    this.highlightMaterial.color.setHex(color);
  }

  harvest(node: ResourceNode, hasAxe: boolean, hasPick: boolean): { resource: ResourceId; amount: number } {
    const config = NODE_CONFIG[node.type];
    const toolBonus =
      (node.type === 'wood' && hasAxe) || ((node.type === 'metal' || node.type === 'energy') && hasPick)
        ? config.toolYield
        : 0;
    const amount = config.baseYield + toolBonus;
    this.setVisible(node, false);
    node.respawnRemaining = config.respawn;
    if (this.highlightNode === node) this.setHighlight(null);
    return { resource: node.type, amount };
  }

  update(dt: number, elapsed: number): void {
    this.elapsed = elapsed;
    for (const node of this.nodes) {
      if (node.visible) continue;
      node.respawnRemaining -= dt;
      if (node.respawnRemaining <= 0) {
        node.respawnRemaining = 0;
        this.setVisible(node, true);
      }
    }
    this.energyMaterial.emissiveIntensity = 0.95 + Math.sin(elapsed * 2.1) * 0.3;
    if (this.highlight.visible) {
      const pulse = 1 + Math.sin(elapsed * 5.6) * 0.08;
      this.highlight.rotation.z = elapsed * 0.6;
      this.highlight.scale.y = pulse;
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const bucket of Object.values(this.buckets).flat()) {
      scene.remove(bucket.mesh);
      bucket.mesh.geometry.dispose();
      const material = bucket.mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
    scene.remove(this.highlight);
    this.highlight.geometry.dispose();
    this.highlightMaterial.dispose();
  }
}
