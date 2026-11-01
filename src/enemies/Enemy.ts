import * as THREE from 'three';
import type { FX } from '../fx/FX';
import { scaledEnemyStats, type EnemyStats, type EnemyType } from '../game/scaling';
import type { World } from '../world/World';
import type { Structure } from '../world/Structures';

export type EnemyState = 'spawning' | 'idle' | 'chase' | 'windup' | 'recover' | 'stagger' | 'dead';

export interface EnemyContext {
  playerPosition: THREE.Vector3;
  playerEye: THREE.Vector3;
  playerAlive: boolean;
  playerFlashlight: boolean;
  playerSprinting: boolean;
  enemies: Enemy[];
  fx: FX;
  damagePlayer: (amount: number, enemy: Enemy) => void;
  damageStructure: (structure: Structure, amount: number, enemy: Enemy) => void;
  fireProjectile: (from: THREE.Vector3, target: THREE.Vector3, damage: number, enemy: Enemy) => void;
  onGrowl: (enemy: Enemy) => void;
}

interface EnemyPalette {
  carapace: number;
  belly: number;
  glow: number;
  eye: number;
  accent: number;
}

const PALETTES: Record<EnemyType, EnemyPalette> = {
  stalker: { carapace: 0x4e7064, belly: 0x8fa08a, glow: 0xff914c, eye: 0xffc05d, accent: 0xb46b43 },
  brute: { carapace: 0x665361, belly: 0x9c7a6c, glow: 0xff684b, eye: 0xff9b64, accent: 0xb17350 },
  spitter: { carapace: 0x447172, belly: 0x8ba697, glow: 0xa9ff60, eye: 0xe2ff78, accent: 0x7c9c5f },
  warden: { carapace: 0x574260, belly: 0x9b747d, glow: 0xff4a63, eye: 0xff6b87, accent: 0xc76973 },
};

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export class Enemy {
  readonly id: string;
  readonly type: EnemyType;
  readonly stats: EnemyStats;
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly spawnOrigin = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly radius: number;
  readonly height: number;
  health: number;
  maxHealth: number;
  state: EnemyState = 'spawning';
  dead = false;
  deathTimer = 0;
  aggro = false;
  hitFlash = 0;
  yaw = 0;

  private readonly scene: THREE.Scene;
  private readonly world: World;
  private readonly bodyGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly eyes: THREE.Mesh[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private phase = Math.random() * Math.PI * 2;
  private spawnTimer = 0.65;
  private attackCooldown = 0.8 + Math.random() * 1.2;
  private windupTimer = 0;
  private recoverTimer = 0;
  private staggerTimer = 0;
  private losTimer = 0;
  private hasLos = false;
  private wanderTimer = 0;
  private readonly wanderTarget = new THREE.Vector3();
  private targetStructure: Structure | null = null;
  private targetStructureYaw = 0;
  private removeMe = false;

  constructor(
    scene: THREE.Scene,
    world: World,
    type: EnemyType,
    position: THREE.Vector3,
    night: number,
    id: string,
  ) {
    this.scene = scene;
    this.world = world;
    this.type = type;
    this.id = id;
    this.stats = scaledEnemyStats(type, night);
    this.radius = this.stats.radius;
    this.height = this.stats.height;
    this.health = this.stats.health;
    this.maxHealth = this.stats.health;
    this.position.copy(position);
    this.position.y = world.groundHeight(position.x, position.z);
    this.spawnOrigin.copy(this.position);
    this.wanderTarget.copy(this.position);
    this.group.name = `enemy-${type}-${id}`;
    this.group.position.copy(this.position);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    this.buildModel();
    scene.add(this.group);
  }

  private track<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private mat(color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      metalness: 0.04,
      flatShading: true,
      ...options,
    });
    this.materials.push(material);
    return material;
  }

  private addPart(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    castShadow = true,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private buildModel(): void {
    const palette = PALETTES[this.type];
    const carapace = this.mat(palette.carapace, {
      roughness: 0.78,
      emissive: palette.carapace,
      emissiveIntensity: 0.16,
    });
    const belly = this.mat(palette.belly, { roughness: 0.82 });
    const accent = this.mat(palette.accent, { roughness: 0.7, metalness: 0.08 });
    const glowMaterial = this.mat(palette.glow, {
      emissive: palette.glow,
      emissiveIntensity: 1.9,
      roughness: 0.35,
    });
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: palette.eye, toneMapped: false });
    this.materials.push(eyeMaterial);

    this.group.add(this.bodyGroup);
    this.bodyGroup.add(this.headGroup);

    if (this.type === 'stalker') {
      const body = this.track(new THREE.SphereGeometry(0.58, 8, 6));
      this.addPart(this.bodyGroup, body, carapace, [0, 0.98, 0], [0, 0, 0], [1.32, 0.68, 1.5]);
      const back = this.track(new THREE.BoxGeometry(0.58, 0.15, 1.25));
      this.addPart(this.bodyGroup, back, accent, [0, 1.24, -0.12], [0.08, 0, 0]);
      const neck = this.track(new THREE.CylinderGeometry(0.16, 0.25, 0.55, 6));
      this.addPart(this.bodyGroup, neck, carapace, [0, 1.08, 0.62], [Math.PI * 0.42, 0, 0]);
      const skull = this.track(new THREE.BoxGeometry(0.36, 0.3, 0.62));
      this.addPart(this.headGroup, skull, carapace, [0, 1.14, 0.94], [0.08, 0, 0]);
      const jaw = this.track(new THREE.ConeGeometry(0.17, 0.36, 5));
      this.addPart(this.headGroup, jaw, belly, [0, 1.06, 1.3], [Math.PI * 0.5, 0, 0]);
      const eyeGeo = this.track(new THREE.SphereGeometry(0.072, 6, 5));
      for (const x of [-0.115, 0.115]) {
        const eye = this.addPart(this.headGroup, eyeGeo, eyeMaterial, [x, 1.2, 1.18], [0, 0, 0], [1, 1, 0.5], false);
        this.eyes.push(eye);
      }
      for (let i = 0; i < 4; i++) {
        const spine = this.track(new THREE.ConeGeometry(0.11, 0.42, 5));
        this.addPart(
          this.bodyGroup,
          spine,
          accent,
          [0.2 * (i % 2 === 0 ? -1 : 1), 1.34, 0.35 - i * 0.25],
          [-0.25, 0, 0.2 * (i % 2 === 0 ? -1 : 1)],
          [1, 1, 1],
        );
      }
      const dorsalGlow = this.track(new THREE.SphereGeometry(0.055, 6, 5));
      for (let i = 0; i < 4; i++) {
        this.eyes.push(
          this.addPart(
            this.bodyGroup,
            dorsalGlow,
            glowMaterial,
            [0, 1.38, 0.42 - i * 0.24],
            [0, 0, 0],
            [1, 0.6, 1],
            false,
          ),
        );
      }
      const legGeo = this.track(new THREE.BoxGeometry(0.13, 0.7, 0.14));
      const clawGeo = this.track(new THREE.ConeGeometry(0.07, 0.22, 4));
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        const side = i % 2 === 0 ? -1 : 1;
        const leg = new THREE.Group();
        leg.position.set(side * 0.46, 0.92, front ? 0.42 : -0.4);
        const thigh = this.addPart(leg, legGeo, carapace, [side * 0.03, -0.32, 0], [0.2, 0, side * 0.25]);
        thigh.castShadow = true;
        const claw = this.addPart(leg, clawGeo, belly, [side * 0.09, -0.7, 0.08], [0, 0, side * 0.15]);
        claw.castShadow = true;
        this.bodyGroup.add(leg);
        this.legs.push(leg);
      }
      const tailGeo = this.track(new THREE.ConeGeometry(0.16, 1.1, 5));
      this.addPart(this.bodyGroup, tailGeo, carapace, [0, 1.05, -0.95], [1.2, 0, 0]);
      this.addPart(this.bodyGroup, eyeGeo, glowMaterial, [0, 1.1, -0.5], [0, 0, 0], [1.6, 1.6, 0.5], false);
    } else if (this.type === 'brute') {
      const torso = this.track(new THREE.SphereGeometry(0.85, 8, 6));
      this.addPart(this.bodyGroup, torso, carapace, [0, 1.45, 0], [0, 0, 0], [1.1, 1.0, 0.82]);
      const chest = this.track(new THREE.BoxGeometry(0.9, 0.7, 0.28));
      this.addPart(this.bodyGroup, chest, accent, [0, 1.45, 0.6], [0.1, 0, 0]);
      const backPlate = this.track(new THREE.BoxGeometry(0.8, 0.8, 0.18));
      this.addPart(this.bodyGroup, backPlate, accent, [0, 1.5, -0.62], [-0.1, 0, 0]);
      const head = this.track(new THREE.BoxGeometry(0.4, 0.34, 0.5));
      this.addPart(this.headGroup, head, carapace, [0, 1.95, 0.35], [0.12, 0, 0]);
      const jaw = this.track(new THREE.BoxGeometry(0.3, 0.18, 0.32));
      this.addPart(this.headGroup, jaw, belly, [0, 1.83, 0.55]);
      const eyeGeo = this.track(new THREE.SphereGeometry(0.082, 6, 5));
      for (const x of [-0.13, 0.13]) {
        this.eyes.push(this.addPart(this.headGroup, eyeGeo, eyeMaterial, [x, 1.99, 0.58], [0, 0, 0], [1, 1, 0.6], false));
      }
      const armGeo = this.track(new THREE.BoxGeometry(0.28, 0.72, 0.3));
      const fistGeo = this.track(new THREE.DodecahedronGeometry(0.26, 0));
      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        arm.position.set(side * 0.8, 1.68, 0.05);
        this.addPart(arm, armGeo, carapace, [0, -0.34, 0], [0, 0, side * 0.12]);
        const fist = this.addPart(arm, fistGeo, belly, [0, -0.76, 0.03]);
        fist.scale.set(1.1, 0.9, 0.9);
        this.bodyGroup.add(arm);
        this.arms.push(arm);
      }
      const legGeo = this.track(new THREE.BoxGeometry(0.32, 0.82, 0.38));
      const footGeo = this.track(new THREE.BoxGeometry(0.36, 0.18, 0.58));
      for (const side of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.38, 1.0, 0);
        this.addPart(leg, legGeo, carapace, [0, -0.4, 0]);
        this.addPart(leg, footGeo, belly, [0, -0.82, 0.12]);
        this.bodyGroup.add(leg);
        this.legs.push(leg);
      }
      const core = this.addPart(this.bodyGroup, eyeGeo, glowMaterial, [0, 1.48, 0.77], [0, 0, 0], [2, 2, 0.7], false);
      this.eyes.push(core);
      for (const x of [-0.34, 0.34]) {
        this.eyes.push(
          this.addPart(this.bodyGroup, eyeGeo, glowMaterial, [x, 1.05, -0.58], [0, 0, 0], [1.2, 1.2, 0.5], false),
        );
      }
    } else if (this.type === 'spitter') {
      const torso = this.track(new THREE.CapsuleGeometry(0.3, 0.6, 5, 7));
      this.addPart(this.bodyGroup, torso, carapace, [0, 1.18, 0], [0, 0, 0], [1, 1, 0.8]);
      const sac = this.track(new THREE.SphereGeometry(0.42, 8, 6));
      this.addPart(this.bodyGroup, sac, glowMaterial, [0, 1.08, -0.34], [0, 0, 0], [0.9, 1.0, 0.9], false);
      const neck = this.track(new THREE.CylinderGeometry(0.08, 0.14, 0.58, 5));
      this.addPart(this.bodyGroup, neck, carapace, [0, 1.62, 0.1], [0.18, 0, 0]);
      const head = this.track(new THREE.ConeGeometry(0.22, 0.62, 6));
      this.addPart(this.headGroup, head, carapace, [0, 1.86, 0.3], [Math.PI * 0.5, 0, 0]);
      const eyeGeo = this.track(new THREE.SphereGeometry(0.07, 6, 5));
      for (const x of [-0.1, 0.1]) {
        this.eyes.push(this.addPart(this.headGroup, eyeGeo, eyeMaterial, [x, 1.9, 0.57], [0, 0, 0], [1, 1, 0.6], false));
      }
      const legGeo = this.track(new THREE.CylinderGeometry(0.055, 0.08, 0.82, 5));
      const footGeo = this.track(new THREE.ConeGeometry(0.08, 0.28, 4));
      for (const side of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.22, 0.92, 0);
        this.addPart(leg, legGeo, carapace, [0, -0.4, 0], [0, 0, side * 0.08]);
        this.addPart(leg, footGeo, belly, [0, -0.84, 0.08], [Math.PI, 0, 0]);
        this.bodyGroup.add(leg);
        this.legs.push(leg);
      }
      const armGeo = this.track(new THREE.CylinderGeometry(0.045, 0.06, 0.72, 5));
      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        arm.position.set(side * 0.33, 1.38, 0.08);
        this.addPart(arm, armGeo, carapace, [0, -0.34, 0], [0.12, 0, side * 0.35]);
        this.bodyGroup.add(arm);
        this.arms.push(arm);
      }
      const spike = this.track(new THREE.ConeGeometry(0.08, 0.45, 4));
      for (let i = 0; i < 3; i++) {
        this.addPart(this.bodyGroup, spike, accent, [0, 1.45, -0.12 - i * 0.18], [-0.3, 0, 0]);
      }
    } else {
      const torso = this.track(new THREE.SphereGeometry(1.0, 9, 7));
      this.addPart(this.bodyGroup, torso, carapace, [0, 1.9, 0], [0, 0, 0], [1.15, 1.15, 0.9]);
      const chest = this.track(new THREE.BoxGeometry(1.1, 0.9, 0.3));
      this.addPart(this.bodyGroup, chest, accent, [0, 1.95, 0.72], [0.08, 0, 0]);
      const head = this.track(new THREE.BoxGeometry(0.5, 0.42, 0.6));
      this.addPart(this.headGroup, head, carapace, [0, 2.55, 0.45], [0.12, 0, 0]);
      const eyeGeo = this.track(new THREE.SphereGeometry(0.095, 6, 5));
      for (const x of [-0.16, 0.16]) {
        this.eyes.push(this.addPart(this.headGroup, eyeGeo, eyeMaterial, [x, 2.6, 0.72], [0, 0, 0], [1, 1, 0.6], false));
      }
      for (let i = 0; i < 5; i++) {
        const crown = this.track(new THREE.ConeGeometry(0.1, 0.55, 4));
        this.addPart(
          this.headGroup,
          crown,
          accent,
          [-0.3 + i * 0.15, 2.8, 0.2],
          [-0.25, 0, (i - 2) * 0.2],
        );
      }
      const armGeo = this.track(new THREE.BoxGeometry(0.36, 0.9, 0.38));
      const fistGeo = this.track(new THREE.DodecahedronGeometry(0.3, 0));
      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        arm.position.set(side * 1.0, 2.15, 0.05);
        this.addPart(arm, armGeo, carapace, [0, -0.4, 0], [0, 0, side * 0.1]);
        this.addPart(arm, fistGeo, belly, [0, -0.88, 0.03]);
        this.bodyGroup.add(arm);
        this.arms.push(arm);
        const smallArm = new THREE.Group();
        smallArm.position.set(side * 0.7, 1.85, 0.2);
        this.addPart(smallArm, armGeo, carapace, [0, -0.28, 0], [0, 0, side * 0.35], [0.55, 0.6, 0.55]);
        this.bodyGroup.add(smallArm);
        this.arms.push(smallArm);
      }
      const legGeo = this.track(new THREE.BoxGeometry(0.42, 1.0, 0.5));
      const footGeo = this.track(new THREE.BoxGeometry(0.46, 0.22, 0.74));
      for (const side of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.48, 1.25, 0);
        this.addPart(leg, legGeo, carapace, [0, -0.48, 0]);
        this.addPart(leg, footGeo, belly, [0, -1.02, 0.14]);
        this.bodyGroup.add(leg);
        this.legs.push(leg);
      }
      const core = this.addPart(this.bodyGroup, eyeGeo, glowMaterial, [0, 1.95, 0.9], [0, 0, 0], [2.2, 2.2, 0.8], false);
      this.eyes.push(core);
      for (const x of [-0.4, 0.4]) {
        this.eyes.push(
          this.addPart(this.bodyGroup, eyeGeo, glowMaterial, [x, 2.35, -0.75], [0, 0, 0], [1.4, 1.4, 0.5], false),
        );
      }
    }

    this.headGroup.position.set(0, 0, 0);
  }

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + this.height * 0.72, this.position.z);
  }

  get alive(): boolean {
    return !this.dead && this.health > 0;
  }

  get shouldRemove(): boolean {
    return this.removeMe;
  }

  private updateLineOfSight(ctx: EnemyContext, dt: number): void {
    this.losTimer -= dt;
    if (this.losTimer > 0) return;
    this.losTimer = 0.32 + Math.random() * 0.18;
    this.hasLos = this.world.hasLineOfSight(this.eyePosition, ctx.playerEye);
  }

  private moveWander(dt: number): void {
    this.wanderTimer -= dt;
    const distanceToTarget = Math.hypot(
      this.wanderTarget.x - this.position.x,
      this.wanderTarget.z - this.position.z,
    );
    if (this.wanderTimer <= 0 || distanceToTarget < 1.2) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 7;
      this.wanderTarget.set(
        this.spawnOrigin.x + Math.cos(angle) * radius,
        0,
        this.spawnOrigin.z + Math.sin(angle) * radius,
      );
      this.wanderTimer = 4 + Math.random() * 5;
    }
    const dx = this.wanderTarget.x - this.position.x;
    const dz = this.wanderTarget.z - this.position.z;
    const distance = Math.hypot(dx, dz) || 1;
    this.steer(dx / distance, dz / distance, 0.8, dt);
  }

  private steer(dx: number, dz: number, speed: number, dt: number): void {
    const desiredX = dx * speed;
    const desiredZ = dz * speed;
    const blend = 1 - Math.exp(-dt * 6);
    this.velocity.x += (desiredX - this.velocity.x) * blend;
    this.velocity.z += (desiredZ - this.velocity.z) * blend;
  }

  private structureBlocking(ctx: EnemyContext, distanceToPlayer: number): Structure | null {
    if (distanceToPlayer < 2.8) return null;
    let best: Structure | null = null;
    let bestDistance = 2.15;
    for (const structure of this.world.structures.structures) {
      if (structure.id === this.targetStructure?.id && this.attackCooldown > 0) continue;
      const distance = Math.hypot(this.position.x - structure.x, this.position.z - structure.z);
      const threshold = structure.type === 'wall' ? 2.25 : 1.75;
      if (distance < threshold && distance < bestDistance) {
        best = structure;
        bestDistance = distance;
      }
    }
    return best;
  }

  private beginWindup(structure: Structure | null, ctx: EnemyContext, faceX: number, faceZ: number): void {
    this.state = 'windup';
    this.windupTimer = this.stats.windup * (structure ? 1.15 : 1);
    this.velocity.set(0, 0, 0);
    this.targetStructure = structure;
    this.targetStructureYaw = Math.atan2(faceX, faceZ);
    if (!structure) ctx.onGrowl(this);
  }

  private resolveAttack(ctx: EnemyContext): void {
    const distanceToPlayer = this.position.distanceTo(ctx.playerPosition);
    if (this.targetStructure) {
      const structure = this.targetStructure;
      if (
        structure &&
        this.world.structures.structures.includes(structure) &&
        Math.hypot(this.position.x - structure.x, this.position.z - structure.z) < 3.2
      ) {
        ctx.damageStructure(structure, this.stats.structureDamage, this);
      }
    } else if (this.type === 'spitter') {
      if (distanceToPlayer < this.stats.attackRange + 4 && this.hasLos) {
        ctx.fireProjectile(this.eyePosition, ctx.playerEye, this.stats.damage, this);
      }
    } else {
      if (distanceToPlayer < this.stats.attackRange + 1.15 && this.hasLos) {
        ctx.damagePlayer(this.stats.damage, this);
        if (this.type === 'warden') {
          ctx.fx.burst(
            new THREE.Vector3(ctx.playerPosition.x, ctx.playerPosition.y + 0.5, ctx.playerPosition.z),
            0xff5c4f,
            26,
            { speed: 4.5, life: 0.5, size: 0.12, gravity: -5 },
          );
        }
      }
    }
    this.recoverTimer = 0.28 + Math.random() * 0.22;
    this.state = 'recover';
    this.targetStructure = null;
    this.attackCooldown = this.stats.attackCooldown;
  }

  update(dt: number, elapsed: number, ctx: EnemyContext): void {
    if (this.dead) {
      this.deathTimer -= dt;
      this.animateDeath(dt);
      if (this.deathTimer <= 0) this.removeMe = true;
      return;
    }
    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      const t = 1 - Math.max(0, this.spawnTimer) / 0.65;
      this.group.position.set(
        this.position.x,
        this.position.y - (1 - t) * 0.8,
        this.position.z,
      );
      this.group.scale.setScalar(0.82 + t * 0.18);
      if (this.spawnTimer <= 0) {
        this.state = 'idle';
        this.group.scale.setScalar(1);
        ctx.fx.burst(
          new THREE.Vector3(this.position.x, this.position.y + 0.2, this.position.z),
          PALETTES[this.type].glow,
          20,
          { speed: 2.2, life: 0.8, size: 0.1, gravity: -2, upward: 1 },
        );
      }
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.updateLineOfSight(ctx, dt);

    if (!ctx.playerAlive) {
      this.aggro = false;
      this.state = 'idle';
      this.moveWander(dt);
      this.integrate(dt);
      this.animate(dt, elapsed, ctx);
      return;
    }

    const dx = ctx.playerPosition.x - this.position.x;
    const dz = ctx.playerPosition.z - this.position.z;
    const distanceToPlayer = Math.hypot(dx, dz);
    const detectionRange =
      this.stats.detection + (ctx.playerFlashlight ? 8 : 0) + (ctx.playerSprinting ? 4.5 : 0);
    if (!this.aggro && distanceToPlayer < detectionRange && (this.hasLos || distanceToPlayer < 5.5)) {
      this.aggro = true;
      this.state = 'chase';
      ctx.onGrowl(this);
    }
    if (this.aggro && distanceToPlayer > 58) {
      this.aggro = false;
      this.state = 'idle';
    }

    if (this.state === 'stagger') {
      this.staggerTimer -= dt;
      this.velocity.multiplyScalar(Math.exp(-10 * dt));
      if (this.staggerTimer <= 0) this.state = 'chase';
    } else if (this.state === 'windup') {
      this.windupTimer -= dt;
      this.velocity.set(0, 0, 0);
      this.yaw += shortestAngle(this.yaw, this.targetStructureYaw) * Math.min(1, dt * 8);
      if (this.windupTimer <= 0) {
        this.resolveAttack(ctx);
      }
    } else if (this.state === 'recover') {
      this.recoverTimer -= dt;
      if (this.recoverTimer <= 0) this.state = 'chase';
    } else if (this.aggro) {
      this.state = 'chase';
      const blocking = this.structureBlocking(ctx, distanceToPlayer);
      if (blocking && this.attackCooldown <= 0) {
        this.beginWindup(
          blocking,
          ctx,
          blocking.x - this.position.x,
          blocking.z - this.position.z,
        );
      } else if (this.type === 'spitter') {
        if (distanceToPlayer < 8.5) {
          this.steer(-dx / (distanceToPlayer || 1), -dz / (distanceToPlayer || 1), this.stats.speed, dt);
        } else if (distanceToPlayer > 14) {
          this.steer(dx / (distanceToPlayer || 1), dz / (distanceToPlayer || 1), this.stats.speed, dt);
        } else {
          this.steer(-dz / (distanceToPlayer || 1), dx / (distanceToPlayer || 1), this.stats.speed * 0.45, dt);
          if (this.attackCooldown <= 0 && this.hasLos) {
            this.beginWindup(null, ctx, dx, dz);
          }
        }
      } else if (distanceToPlayer <= this.stats.attackRange && this.attackCooldown <= 0) {
        this.beginWindup(null, ctx, dx, dz);
      } else {
        const strafe = Math.sin(elapsed * 1.6 + this.phase) * 0.22;
        const nx = dx / (distanceToPlayer || 1);
        const nz = dz / (distanceToPlayer || 1);
        this.steer(nx + -nz * strafe, nz + nx * strafe, this.stats.speed, dt);
        this.yaw += shortestAngle(this.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 7);
      }
    } else {
      this.state = 'idle';
      this.moveWander(dt);
    }

    if (this.state !== 'windup' && this.state !== 'stagger') {
      const separation = new THREE.Vector3();
      for (const other of ctx.enemies) {
        if (other === this || other.dead) continue;
        const ox = this.position.x - other.position.x;
        const oz = this.position.z - other.position.z;
        const distance = Math.hypot(ox, oz);
        const minDistance = this.radius + other.radius + 0.35;
        if (distance > 0.001 && distance < minDistance) {
          separation.x += (ox / distance) * (minDistance - distance);
          separation.z += (oz / distance) * (minDistance - distance);
        }
      }
      this.velocity.x += separation.x * 2.4;
      this.velocity.z += separation.z * 2.4;
    }

    this.integrate(dt);
    if (this.state === 'chase' && this.type !== 'spitter') {
      this.yaw += shortestAngle(this.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    } else if (this.state === 'idle') {
      if (Math.hypot(this.velocity.x, this.velocity.z) > 0.15) {
        this.yaw += shortestAngle(this.yaw, Math.atan2(this.velocity.x, this.velocity.z)) * Math.min(1, dt * 5);
      }
    }
    this.animate(dt, elapsed, ctx);
  }

  private integrate(dt: number): void {
    if (Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.0001) {
      const resolved = this.world.resolveMovement(
        this.position.x,
        this.position.z,
        this.radius,
        this.velocity.x * dt,
        this.velocity.z * dt,
      );
      this.position.x = resolved.x;
      this.position.z = resolved.z;
      this.position.y = this.world.groundHeight(this.position.x, this.position.z);
    }
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
  }

  private animate(dt: number, elapsed: number, ctx: EnemyContext): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.phase += dt * (3 + speed * 1.8);
    const moving = speed > 0.18;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i] as THREE.Group;
      const offset = i % 2 === 0 ? 0 : Math.PI;
      const swing = moving ? Math.sin(this.phase + offset + (i > 1 ? Math.PI : 0)) * 0.55 : 0;
      leg.rotation.x = swing;
    }
    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i] as THREE.Group;
      const offset = i % 2 === 0 ? 0 : Math.PI;
      arm.rotation.x = moving ? Math.sin(this.phase + offset) * 0.24 : Math.sin(elapsed * 1.4 + i) * 0.05;
    }
    const windupProgress =
      this.state === 'windup' ? 1 - Math.max(0, this.windupTimer) / Math.max(0.01, this.stats.windup) : 0;
    const crouch = windupProgress > 0 ? Math.sin(windupProgress * Math.PI) : 0;
    const bob = moving ? Math.abs(Math.sin(this.phase * 2)) * 0.045 : Math.sin(elapsed * 1.6 + this.phase) * 0.015;
    this.bodyGroup.position.y = bob - crouch * 0.12;
    this.bodyGroup.rotation.x = crouch * 0.22;
    const eyeScale = 1 + crouch * 0.8 + Math.sin(elapsed * 5 + this.phase) * 0.05;
    for (const eye of this.eyes) eye.scale.setScalar(eyeScale);
    this.hitFlash = Math.max(0, this.hitFlash);
  }

  private animateDeath(dt: number): void {
    const t = 1 - Math.min(1, Math.max(0, this.deathTimer) / 1.15);
    this.group.rotation.z = t * 1.15;
    this.group.position.y = this.position.y - t * 0.35;
    this.group.scale.setScalar(1 - t * 0.4);
    this.bodyGroup.position.y = -t * 0.15;
  }

  takeDamage(amount: number, fx: FX, hitPoint?: THREE.Vector3): boolean {
    if (this.dead) return false;
    this.health -= amount;
    this.hitFlash = 0.14;
    const point =
      hitPoint ??
      new THREE.Vector3(
        this.position.x,
        this.position.y + this.height * 0.6,
        this.position.z,
      );
    fx.impact(point, this.type === 'spitter' ? 0xc4ff67 : 0xffb05e);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.state = 'dead';
      this.deathTimer = 1.15;
      this.velocity.set(0, 0, 0);
      fx.burst(point, PALETTES[this.type].glow, 30, {
        speed: 4.2,
        life: 1.0,
        size: 0.14,
        gravity: -5,
        upward: 0.7,
      });
      return true;
    }
    const stagger = this.type === 'stalker' ? 0.18 : this.type === 'spitter' ? 0.22 : this.type === 'brute' ? 0.08 : 0.04;
    this.staggerTimer = stagger;
    if (this.state === 'windup' && this.type !== 'warden' && this.type !== 'brute') {
      this.state = 'stagger';
      this.targetStructure = null;
    } else if (this.state !== 'windup' && this.state !== 'recover' && this.type !== 'warden') {
      this.state = 'stagger';
    }
    return false;
  }

  despawn(fx: FX): void {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 0;
    fx.burst(
      new THREE.Vector3(this.position.x, this.position.y + this.height * 0.5, this.position.z),
      PALETTES[this.type].glow,
      24,
      { speed: 3.5, life: 0.7, size: 0.1, gravity: -3 },
    );
  }

  getRayHit(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): { distance: number; point: THREE.Vector3; critical: boolean } | null {
    if (!this.alive) return null;
    const bodyCenter = new THREE.Vector3(
      this.position.x,
      this.position.y + this.height * 0.55,
      this.position.z,
    );
    const headCenter = new THREE.Vector3(
      this.position.x,
      this.position.y + this.height * 0.84,
      this.position.z,
    );
    const bodyRadius = Math.max(0.35, this.height * 0.3);
    const headRadius = Math.max(0.18, this.height * 0.15);
    const bodyHit = this.raySphere(origin, direction, bodyCenter, bodyRadius, maxDistance);
    const headHit = this.raySphere(origin, direction, headCenter, headRadius, maxDistance);
    if (headHit !== null && (bodyHit === null || headHit <= bodyHit)) {
      return {
        distance: headHit,
        point: origin.clone().addScaledVector(direction, headHit),
        critical: true,
      };
    }
    if (bodyHit !== null) {
      return {
        distance: bodyHit,
        point: origin.clone().addScaledVector(direction, bodyHit),
        critical: false,
      };
    }
    return null;
  }

  private raySphere(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    center: THREE.Vector3,
    radius: number,
    maxDistance: number,
  ): number | null {
    const oc = origin.clone().sub(center);
    const b = oc.dot(direction);
    const c = oc.lengthSq() - radius * radius;
    const discriminant = b * b - c;
    if (discriminant < 0) return null;
    const sqrt = Math.sqrt(discriminant);
    let t = -b - sqrt;
    if (t < 0) t = -b + sqrt;
    if (t < 0 || t > maxDistance) return null;
    return t;
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.materials.length = 0;
    this.geometries.length = 0;
  }
}
