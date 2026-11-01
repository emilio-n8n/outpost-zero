import * as THREE from 'three';
import { scaledEnemyStats, type EnemyType } from '../game/scaling';
import type { FX } from '../fx/FX';
import type { Structure } from '../world/Structures';
import type { World } from '../world/World';
import { Enemy, type EnemyContext } from './Enemy';

interface Projectile {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
  shooter: Enemy;
  trailTimer: number;
}

export interface EnemyCallbacks {
  damagePlayer: (amount: number, enemy: Enemy) => void;
  damageStructure: (structure: Structure, amount: number, enemy: Enemy) => void;
  onKill: (enemy: Enemy) => void;
  onGrowl: (enemy: Enemy) => void;
}

export interface EnemyRayHit {
  enemy: Enemy;
  distance: number;
  point: THREE.Vector3;
  critical: boolean;
}

export class EnemyManager {
  readonly enemies: Enemy[] = [];
  private readonly scene: THREE.Scene;
  private readonly world: World;
  private readonly fx: FX;
  private readonly projectileGeometry: THREE.SphereGeometry;
  private readonly projectileMaterial: THREE.MeshBasicMaterial;
  private readonly projectiles: Projectile[] = [];
  private nextId = 1;

  constructor(scene: THREE.Scene, world: World, fx: FX) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.projectileGeometry = new THREE.SphereGeometry(0.15, 8, 6);
    this.projectileMaterial = new THREE.MeshBasicMaterial({
      color: 0xb6ff63,
      toneMapped: false,
    });
  }

  spawn(type: EnemyType, position: THREE.Vector3, night: number): Enemy {
    const enemy = new Enemy(
      this.scene,
      this.world,
      type,
      position,
      night,
      `enemy-${this.nextId++}`,
    );
    this.enemies.push(enemy);
    return enemy;
  }

  update(
    dt: number,
    elapsed: number,
    player: {
      position: THREE.Vector3;
      eye: THREE.Vector3;
      flashlight: boolean;
      sprinting: boolean;
      alive: boolean;
    },
    callbacks: EnemyCallbacks,
  ): void {
    const context: EnemyContext = {
      playerPosition: player.position,
      playerEye: player.eye,
      playerAlive: player.alive,
      playerFlashlight: player.flashlight,
      playerSprinting: player.sprinting,
      enemies: this.enemies,
      fx: this.fx,
      damagePlayer: (amount, enemy) => callbacks.damagePlayer(amount, enemy),
      damageStructure: (structure, amount, enemy) =>
        callbacks.damageStructure(structure, amount, enemy),
      fireProjectile: (from, target, damage, enemy) =>
        this.fireProjectile(from, target, damage, enemy),
      onGrowl: (enemy) => callbacks.onGrowl(enemy),
    };

    for (const enemy of this.enemies) {
      enemy.update(dt, elapsed, context);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i] as Enemy;
      if (enemy.shouldRemove) {
        enemy.dispose();
        this.enemies.splice(i, 1);
      }
    }
    this.updateProjectiles(dt, player, callbacks);
  }

  private fireProjectile(
    from: THREE.Vector3,
    target: THREE.Vector3,
    damage: number,
    shooter: Enemy,
  ): void {
    const direction = target.clone().sub(from);
    const distance = direction.length();
    if (distance < 0.1) return;
    direction.divideScalar(distance);
    const mesh = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
    mesh.position.copy(from);
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      position: from.clone(),
      velocity: direction.multiplyScalar(18),
      life: 2.4,
      damage,
      shooter,
      trailTimer: 0,
    });
    this.fx.burst(from, 0xb6ff63, 5, {
      speed: 1.5,
      life: 0.35,
      size: 0.06,
      gravity: 0,
    });
  }

  private updateProjectiles(
    dt: number,
    player: { position: THREE.Vector3; eye: THREE.Vector3; alive: boolean },
    callbacks: EnemyCallbacks,
  ): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i] as Projectile;
      projectile.life -= dt;
      const previous = projectile.position.clone();
      projectile.position.addScaledVector(projectile.velocity, dt);
      projectile.mesh.position.copy(projectile.position);
      projectile.trailTimer -= dt;
      if (projectile.trailTimer <= 0) {
        projectile.trailTimer = 0.045;
        this.fx.burst(projectile.position, 0xb6ff63, 1, {
          speed: 0.25,
          life: 0.3,
          size: 0.045,
          gravity: 0,
          upward: 0.2,
        });
      }

      let remove = false;
      const ground = this.world.groundHeight(projectile.position.x, projectile.position.z);
      if (projectile.position.y <= ground + 0.05) {
        this.fx.burst(projectile.position, 0xb6ff63, 10, {
          speed: 2,
          life: 0.5,
          size: 0.08,
          gravity: -4,
        });
        remove = true;
      }

      if (!remove) {
        const chest = new THREE.Vector3(player.position.x, player.position.y + 1.1, player.position.z);
        if (player.alive && projectile.position.distanceTo(chest) < 0.72) {
          callbacks.damagePlayer(projectile.damage, projectile.shooter);
          this.fx.burst(projectile.position, 0xc7ff72, 14, {
            speed: 2.5,
            life: 0.6,
            size: 0.1,
            gravity: -3,
          });
          remove = true;
        }
      }

      if (!remove) {
        const delta = projectile.position.clone().sub(previous);
        const distance = delta.length();
        if (distance > 0.001) {
          delta.divideScalar(distance);
          const hit = this.world.raycastStatics(previous, delta, distance, true);
          if (hit !== null) {
            this.fx.burst(previous.clone().addScaledVector(delta, hit), 0xb6ff63, 9, {
              speed: 2,
              life: 0.45,
              size: 0.08,
              gravity: -3,
            });
            remove = true;
          }
        }
      }

      if (projectile.life <= 0) remove = true;
      if (remove) {
        this.scene.remove(projectile.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): EnemyRayHit | null {
    let best: EnemyRayHit | null = null;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const hit = enemy.getRayHit(origin, direction, maxDistance);
      if (hit && (!best || hit.distance < best.distance)) {
        best = {
          enemy,
          distance: hit.distance,
          point: hit.point,
          critical: hit.critical,
        };
      }
    }
    return best;
  }

  meleeAttack(
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    range: number,
    arc: number,
    damage: number,
    callbacks: EnemyCallbacks,
  ): number {
    let hits = 0;
    const flatForward = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - origin.x;
      const dz = enemy.position.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance > range + enemy.radius) continue;
      const nx = dx / (distance || 1);
      const nz = dz / (distance || 1);
      if (nx * flatForward.x + nz * flatForward.z < arc) continue;
      const point = new THREE.Vector3(enemy.position.x, enemy.position.y + enemy.height * 0.55, enemy.position.z);
      if (this.damageEnemy(enemy, damage, point, callbacks)) hits++;
      else hits++;
    }
    return hits;
  }

  damageEnemy(
    enemy: Enemy,
    amount: number,
    point: THREE.Vector3 | undefined,
    callbacks: EnemyCallbacks,
  ): boolean {
    if (!enemy.alive) return false;
    const died = enemy.takeDamage(amount, this.fx, point);
    if (died) callbacks.onKill(enemy);
    return died;
  }

  clearAll(dawn: boolean): void {
    for (const enemy of this.enemies) {
      enemy.despawn(this.fx);
      enemy.dispose();
    }
    this.enemies.length = 0;
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.mesh);
    }
    this.projectiles.length = 0;
    if (dawn) {
      this.fx.burst(new THREE.Vector3(0, 2, 0), 0xffd28a, 1, { speed: 0.1, life: 0.1 });
    }
  }

  dispose(): void {
    this.clearAll(false);
    this.projectileGeometry.dispose();
    this.projectileMaterial.dispose();
  }
}
