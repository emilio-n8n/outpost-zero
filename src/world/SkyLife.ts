import * as THREE from 'three';
import { Rng } from '../core/Rng';

interface Drifter {
  group: THREE.Group;
  bell: THREE.Mesh;
  core: THREE.Mesh;
  tendrils: THREE.Line;
  bellMaterial: THREE.MeshBasicMaterial;
  coreMaterial: THREE.MeshBasicMaterial;
  tendrilMaterial: THREE.LineBasicMaterial;
  rimMaterial: THREE.MeshBasicMaterial;
  baseX: number;
  baseZ: number;
  baseY: number;
  phase: number;
  speed: number;
  drift: number;
}

/**
 * Bioluminescent sky drifters: harmless, slow-moving alien life that makes the
 * basin feel alive after sunset. Everything is procedural and pooled.
 */
export class SkyLife {
  private readonly scene: THREE.Scene;
  private readonly drifters: Drifter[] = [];
  private readonly rng = new Rng('outpost-zero-skylife');
  private readonly bellGeometry = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52);
  private readonly coreGeometry = new THREE.SphereGeometry(0.36, 7, 5);
  private readonly rimGeometry = new THREE.TorusGeometry(1, 0.035, 5, 24);
  private readonly tendrilGeometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const points: number[] = [];
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const x = Math.cos(angle) * 0.68;
      const z = Math.sin(angle) * 0.68;
      points.push(x, 0, z, x * 1.4, -1.1 - (i % 3) * 0.32, z * 1.4);
    }
    this.tendrilGeometry = new THREE.BufferGeometry();
    this.tendrilGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

    const colors = [0x78ffe3, 0xa8c9ff, 0xe6a0ff, 0x7fffe0];
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const color = this.rng.pick(colors);
      const bellMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      });
      const bell = new THREE.Mesh(this.bellGeometry, bellMaterial);
      bell.scale.set(this.rng.range(1.05, 2.15), this.rng.range(0.7, 1.25), this.rng.range(1.05, 2.15));
      group.add(bell);

      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xd8fff5,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      const core = new THREE.Mesh(this.coreGeometry, coreMaterial);
      core.position.y = -0.18;
      core.scale.setScalar(this.rng.range(0.75, 1.35));
      group.add(core);

      const tendrilMaterial = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      const tendrils = new THREE.LineSegments(this.tendrilGeometry, tendrilMaterial);
      group.add(tendrils);
      const rimMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      const rim = new THREE.Mesh(this.rimGeometry, rimMaterial);
      rim.rotation.x = Math.PI / 2;
      group.add(rim);

      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(18, 62);
      let baseX = Math.cos(angle) * radius;
      let baseZ = Math.sin(angle) * radius;
      let baseY = this.rng.range(8, 20);
      if (i === 0) {
        baseX = -24;
        baseZ = -8;
        baseY = 15;
      } else if (i === 1) {
        baseX = 28;
        baseZ = 2;
        baseY = 17;
      } else if (i === 2) {
        baseX = 18;
        baseZ = 34;
        baseY = 19;
      }
      group.position.set(baseX, baseY, baseZ);
      group.rotation.y = this.rng.range(0, Math.PI * 2);
      this.scene.add(group);
      this.drifters.push({
        group,
        bell,
        core,
        tendrils,
        bellMaterial,
        coreMaterial,
        tendrilMaterial,
        rimMaterial,
        baseX,
        baseZ,
        baseY,
        phase: this.rng.range(0, Math.PI * 2),
        speed: this.rng.range(0.12, 0.32),
        drift: this.rng.range(1.2, 4.5),
      });
    }
  }

  update(elapsed: number, night: number): void {
    const visibility = Math.max(0, Math.min(1, (night - 0.25) / 0.55));
    for (const drifter of this.drifters) {
      drifter.group.visible = visibility > 0.01;
      if (!drifter.group.visible) continue;
      const t = elapsed * drifter.speed + drifter.phase;
      drifter.group.position.set(
        drifter.baseX + Math.sin(t * 0.45) * drifter.drift,
        drifter.baseY + Math.sin(t * 0.8) * 0.9,
        drifter.baseZ + Math.cos(t * 0.34) * drifter.drift,
      );
      drifter.group.rotation.y = t * 0.22;
      const pulse = 0.72 + Math.sin(t * 2.2) * 0.16;
      drifter.bellMaterial.opacity = visibility * 0.3 * pulse;
      drifter.coreMaterial.opacity = visibility * 0.85 * pulse;
      drifter.tendrilMaterial.opacity = visibility * 0.52 * pulse;
      drifter.rimMaterial.opacity = visibility * 0.6 * pulse;
      drifter.bell.rotation.z = Math.sin(t * 0.4) * 0.06;
      drifter.tendrils.rotation.z = Math.sin(t * 0.5) * 0.08;
    }
  }

  dispose(): void {
    for (const drifter of this.drifters) {
      this.scene.remove(drifter.group);
      drifter.bellMaterial.dispose();
      drifter.coreMaterial.dispose();
      drifter.tendrilMaterial.dispose();
      drifter.rimMaterial.dispose();
    }
    this.bellGeometry.dispose();
    this.coreGeometry.dispose();
    this.rimGeometry.dispose();
    this.tendrilGeometry.dispose();
  }
}
