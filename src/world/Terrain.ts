import * as THREE from 'three';
import { OUTPOST, SITES, WORLD } from '../config';
import { fbm2D, smoothstep } from '../core/noise';
import { Rng } from '../core/Rng';

interface FlattenPad {
  x: number;
  z: number;
  radius: number;
  fade: number;
  target: number;
}

export class Terrain {
  readonly size = WORLD.size;
  readonly half = WORLD.half;
  readonly segments = WORLD.segments;
  readonly mesh: THREE.Mesh;
  private readonly heights: Float32Array;
  private readonly columns: number;
  private readonly cellSize: number;
  private readonly seed: number;
  private readonly pads: FlattenPad[] = [];

  constructor(seed: string, scene: THREE.Scene) {
    this.seed = Rng.hash(seed) & 0xffff;
    this.columns = this.segments + 1;
    this.cellSize = this.size / this.segments;

    const outpostHeight = this.rawHeight(OUTPOST.x, OUTPOST.z);
    this.pads.push({
      x: OUTPOST.x,
      z: OUTPOST.z,
      radius: OUTPOST.flattenRadius,
      fade: 11,
      target: outpostHeight,
    });
    for (const site of SITES) {
      this.pads.push({
        x: site.x,
        z: site.z,
        radius: site.radius,
        fade: 7,
        target: this.rawHeight(site.x, site.z),
      });
    }

    this.heights = new Float32Array(this.columns * this.columns);
    const positions = new Float32Array(this.columns * this.columns * 3);
    const colors = new Float32Array(this.columns * this.columns * 3);
    const indices: number[] = [];

    for (let zi = 0; zi < this.columns; zi++) {
      const z = -this.half + zi * this.cellSize;
      for (let xi = 0; xi < this.columns; xi++) {
        const x = -this.half + xi * this.cellSize;
        const h = this.heightWithPads(x, z);
        const index = zi * this.columns + xi;
        this.heights[index] = h;
        positions[index * 3] = x;
        positions[index * 3 + 1] = h;
        positions[index * 3 + 2] = z;
      }
    }

    for (let zi = 0; zi < this.segments; zi++) {
      for (let xi = 0; xi < this.segments; xi++) {
        const a = zi * this.columns + xi;
        const b = a + 1;
        const c = a + this.columns;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const color = new THREE.Color();
    for (let zi = 0; zi < this.columns; zi++) {
      for (let xi = 0; xi < this.columns; xi++) {
        const index = zi * this.columns + xi;
        const x = positions[index * 3] as number;
        const z = positions[index * 3 + 2] as number;
        const h = this.heights[index] as number;
        const hx =
          this.heights[zi * this.columns + Math.min(this.columns - 1, xi + 1)] as number;
        const hz =
          this.heights[Math.min(this.columns - 1, zi + 1) * this.columns + xi] as number;
        const slope = Math.min(2, Math.abs(hx - h) + Math.abs(hz - h));
        const moss = fbm2D(x * 0.034 + 8, z * 0.034 - 4, this.seed + 9, 4);
        const dust = fbm2D(x * 0.012 - 3, z * 0.012 + 9, this.seed + 31, 3);

        color.setHex(0x394c45);
        color.lerp(new THREE.Color(0x55604f), dust * 0.8);
        color.lerp(new THREE.Color(0x2c5d52), Math.pow(moss, 2) * 0.7);
        color.lerp(new THREE.Color(0x586064), smoothstep(0.45, 1.4, slope) * 0.8);
        color.lerp(new THREE.Color(0x78624a), Math.pow(dust, 2.4) * 0.42);
        if (Math.hypot(x, z) < OUTPOST.flattenRadius + 6) {
          color.lerp(new THREE.Color(0x5b5445), 0.22);
        }
        const variance = 0.9 + fbm2D(x * 0.48, z * 0.48, this.seed + 51, 2) * 0.2;
        color.multiplyScalar(variance);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.02,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'terrain';
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  private rawHeight(x: number, z: number): number {
    const radial = Math.hypot(x, z);
    const broad = fbm2D(x * 0.016, z * 0.016, this.seed, 5, 2.03, 0.52);
    const medium = fbm2D(x * 0.052, z * 0.052, this.seed + 17, 3, 2.11, 0.5);
    const detail = fbm2D(x * 0.14, z * 0.14, this.seed + 43, 2, 2.2, 0.45);
    const basin = -1.5 + broad * 10 + medium * 2.4 + detail * 0.7;
    const ring = smoothstep(65, 99, radial);
    const ridge = fbm2D(x * 0.036, z * 0.036, this.seed + 71, 4, 2.04, 0.54);
    const mountains = Math.pow(ring, 1.35) * (17 + ridge * 25);
    const centerDepression = smoothstep(26, 0, radial) * 0.6;
    return basin + mountains - centerDepression;
  }

  private heightWithPads(x: number, z: number): number {
    let height = this.rawHeight(x, z);
    for (const pad of this.pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d >= pad.radius + pad.fade) continue;
      const blend = 1 - smoothstep(pad.radius, pad.radius + pad.fade, d);
      height += (pad.target - height) * blend;
    }
    return height;
  }

  heightAt(x: number, z: number): number {
    const fx = THREE.MathUtils.clamp((x + this.half) / this.cellSize, 0, this.segments - 0.001);
    const fz = THREE.MathUtils.clamp((z + this.half) / this.cellSize, 0, this.segments - 0.001);
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const i00 = z0 * this.columns + x0;
    const i10 = i00 + 1;
    const i01 = i00 + this.columns;
    const i11 = i01 + 1;
    const h00 = this.heights[i00] as number;
    const h10 = this.heights[i10] as number;
    const h01 = this.heights[i01] as number;
    const h11 = this.heights[i11] as number;
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  normalAt(x: number, z: number): THREE.Vector3 {
    const e = 0.8;
    const hL = this.heightAt(x - e, z);
    const hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e);
    const hU = this.heightAt(x, z + e);
    return new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
  }

  slopeAt(x: number, z: number): number {
    return 1 - this.normalAt(x, z).y;
  }

  isFlat(x: number, z: number, radius: number, maxSlope = 0.14): boolean {
    const checks = [
      [x, z],
      [x - radius, z],
      [x + radius, z],
      [x, z - radius],
      [x, z + radius],
    ] as const;
    let min = Infinity;
    let max = -Infinity;
    for (const [sx, sz] of checks) {
      if (this.slopeAt(sx, sz) > maxSlope) return false;
      const h = this.heightAt(sx, sz);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    return max - min < Math.max(0.55, radius * 0.3);
  }

  minimapHeight(x: number, z: number): number {
    return this.heightAt(x, z);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  }
}
