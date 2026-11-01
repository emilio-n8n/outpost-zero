import * as THREE from 'three';
import { OUTPOST, SITES, WORLD } from '../config';
import { Rng } from '../core/Rng';
import { fbm2D } from '../core/noise';
import type { Terrain } from './Terrain';

export interface ScatterCollider {
  x: number;
  z: number;
  radius: number;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  let positionCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    positionCount += part.getAttribute('position').count;
    if (part.index) indexCount += part.index.count;
    else indexCount += part.getAttribute('position').count;
  }
  const positions = new Float32Array(positionCount * 3);
  const normals = new Float32Array(positionCount * 3);
  const uvs = new Float32Array(positionCount * 2);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    const pos = part.getAttribute('position');
    const nrm = part.getAttribute('normal');
    const uv = part.getAttribute('uv');
    positions.set(pos.array as Float32Array, vertexOffset * 3);
    if (nrm) normals.set(nrm.array as Float32Array, vertexOffset * 3);
    if (uv) uvs.set(uv.array as Float32Array, vertexOffset * 2);
    if (part.index) {
      const indicesArray = part.index.array;
      for (let i = 0; i < indicesArray.length; i++) {
        indices[indexOffset + i] = (indicesArray[i] as number) + vertexOffset;
      }
      indexOffset += indicesArray.length;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[indexOffset + i] = i + vertexOffset;
      }
      indexOffset += pos.count;
    }
    vertexOffset += pos.count;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

function nearSite(x: number, z: number, clearance = 0): boolean {
  if (Math.hypot(x - OUTPOST.x, z - OUTPOST.z) < OUTPOST.flattenRadius + clearance) return true;
  return SITES.some((site) => Math.hypot(x - site.x, z - site.z) < site.radius + clearance);
}

export class Scatter {
  private readonly rocks: THREE.InstancedMesh;
  private readonly grass: THREE.InstancedMesh;
  private readonly mushrooms: THREE.InstancedMesh;
  private readonly rockGeometry: THREE.DodecahedronGeometry;
  private readonly grassGeometry: THREE.BufferGeometry;
  private readonly mushroomGeometry: THREE.BufferGeometry;
  readonly colliders: ScatterCollider[] = [];

  constructor(scene: THREE.Scene, terrain: Terrain, seed: string) {
    const rng = new Rng(`${seed}:scatter`);

    this.rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.04,
      flatShading: true,
    });
    this.rocks = new THREE.InstancedMesh(this.rockGeometry, rockMaterial, 120);
    this.rocks.castShadow = true;
    this.rocks.receiveShadow = true;
    this.rocks.name = 'rocks';

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const color = new THREE.Color();
    let rockCount = 0;
    for (let attempt = 0; attempt < 600 && rockCount < 120; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(rng.next()) * 88;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (nearSite(x, z, 2)) continue;
      if (terrain.slopeAt(x, z) > 0.32) continue;
      if (rng.chance(0.4)) continue;
      const y = terrain.heightAt(x, z);
      const size = rng.range(0.35, 2.2);
      position.set(x, y + size * 0.3, z);
      quaternion.setFromEuler(
        new THREE.Euler(rng.range(-0.25, 0.25), rng.range(0, Math.PI * 2), rng.range(-0.2, 0.2)),
      );
      scale.set(size * rng.range(0.8, 1.65), size * rng.range(0.55, 1.1), size * rng.range(0.8, 1.5));
      matrix.compose(position, quaternion, scale);
      this.rocks.setMatrixAt(rockCount, matrix);
      color.setHSL(rng.range(0.47, 0.56), rng.range(0.05, 0.16), rng.range(0.2, 0.38));
      this.rocks.setColorAt(rockCount, color);
      if (size > 0.95) {
        this.colliders.push({ x, z, radius: Math.max(0.55, size * 0.72) });
      }
      rockCount++;
    }
    this.rocks.count = rockCount;
    this.rocks.instanceMatrix.needsUpdate = true;
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;
    this.rocks.computeBoundingSphere();
    scene.add(this.rocks);

    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.ConeGeometry(0.055, 0.85, 3, 1);
      blade.translate(0, 0.42, 0);
      blade.rotateZ(rng.range(-0.3, 0.3));
      blade.rotateX(rng.range(-0.25, 0.25));
      blade.translate(rng.range(-0.28, 0.28), 0, rng.range(-0.28, 0.28));
      blades.push(blade);
    }
    this.grassGeometry = merge(blades);
    for (const blade of blades) blade.dispose();
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.grass = new THREE.InstancedMesh(this.grassGeometry, grassMaterial, 900);
    this.grass.name = 'grass';
    let grassCount = 0;
    for (let attempt = 0; attempt < 3200 && grassCount < 900; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(rng.next()) * 87;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (nearSite(x, z, 1)) continue;
      if (terrain.slopeAt(x, z) > 0.25) continue;
      const forest = fbm2D(x * 0.03 + 4, z * 0.03 - 7, 42, 3);
      if (forest < 0.42 && rng.chance(0.6)) continue;
      const y = terrain.heightAt(x, z);
      position.set(x, y, z);
      quaternion.setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI * 2), 0));
      const s = rng.range(0.5, 1.4);
      scale.set(s, s * rng.range(0.7, 1.5), s);
      matrix.compose(position, quaternion, scale);
      this.grass.setMatrixAt(grassCount, matrix);
      color.setHSL(rng.range(0.36, 0.5), rng.range(0.18, 0.42), rng.range(0.18, 0.34));
      this.grass.setColorAt(grassCount, color);
      grassCount++;
    }
    this.grass.count = grassCount;
    this.grass.instanceMatrix.needsUpdate = true;
    if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
    this.grass.computeBoundingSphere();
    scene.add(this.grass);

    const stem = new THREE.CylinderGeometry(0.025, 0.045, 0.42, 4);
    stem.translate(0, 0.2, 0);
    const cap = new THREE.SphereGeometry(0.14, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55);
    cap.scale(1.5, 0.8, 1.5);
    cap.translate(0, 0.42, 0);
    this.mushroomGeometry = merge([stem, cap]);
    stem.dispose();
    cap.dispose();
    const mushroomMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x7c2b77,
      emissiveIntensity: 0.55,
      roughness: 0.7,
      flatShading: true,
    });
    this.mushrooms = new THREE.InstancedMesh(this.mushroomGeometry, mushroomMaterial, 220);
    this.mushrooms.name = 'mushrooms';
    let mushroomCount = 0;
    for (let attempt = 0; attempt < 1000 && mushroomCount < 220; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(rng.next()) * 85;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (nearSite(x, z, 1)) continue;
      if (terrain.slopeAt(x, z) > 0.24) continue;
      if (rng.chance(0.35)) continue;
      const y = terrain.heightAt(x, z);
      position.set(x, y, z);
      quaternion.setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI * 2), 0));
      const s = rng.range(0.5, 1.35);
      scale.set(s, s * rng.range(0.8, 1.4), s);
      matrix.compose(position, quaternion, scale);
      this.mushrooms.setMatrixAt(mushroomCount, matrix);
      color.setHSL(rng.range(0.78, 0.92), rng.range(0.35, 0.6), rng.range(0.42, 0.66));
      this.mushrooms.setColorAt(mushroomCount, color);
      mushroomCount++;
    }
    this.mushrooms.count = mushroomCount;
    this.mushrooms.instanceMatrix.needsUpdate = true;
    if (this.mushrooms.instanceColor) this.mushrooms.instanceColor.needsUpdate = true;
    this.mushrooms.computeBoundingSphere();
    scene.add(this.mushrooms);
  }

  dispose(scene: THREE.Scene): void {
    for (const mesh of [this.rocks, this.grass, this.mushrooms]) {
      scene.remove(mesh);
      mesh.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
    this.rockGeometry.dispose();
    this.grassGeometry.dispose();
    this.mushroomGeometry.dispose();
  }
}
