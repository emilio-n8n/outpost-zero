import * as THREE from 'three';
import { CAMERA } from '../config';
import { Terrain } from '../world/Terrain';

export interface CameraTarget {
  position: THREE.Vector3;
  grounded: boolean;
  sprinting: boolean;
  aiming: boolean;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw: number;
  pitch = CAMERA.defaultPitch;
  sensitivity = 1;
  private currentDistance = CAMERA.distance;
  private readonly currentPosition = new THREE.Vector3();
  private readonly targetPosition = new THREE.Vector3();
  private readonly lookDirection = new THREE.Vector3(0, 0, 1);
  private shake = 0;
  private shakeTime = 0;
  private fov = CAMERA.baseFov;
  private initialized = false;
  private readonly terrain: Terrain;

  constructor(camera: THREE.PerspectiveCamera, terrain: Terrain) {
    this.camera = camera;
    this.terrain = terrain;
    this.yaw = 2.5;
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  handleMouse(dx: number, dy: number): void {
    this.yaw += dx * 0.0022 * this.sensitivity;
    this.pitch -= dy * 0.0022 * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, CAMERA.minPitch, CAMERA.maxPitch);
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.6, this.shake + amount);
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  getLookDirection(): THREE.Vector3 {
    this.lookDirection.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    return this.lookDirection;
  }

  getForwardFlat(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  getRightFlat(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  update(dt: number, target: CameraTarget): void {
    this.shakeTime += dt;
    const distance = target.aiming ? CAMERA.distance * 0.72 : CAMERA.distance;
    this.currentDistance += (distance - this.currentDistance) * Math.min(1, dt * 10);

    const focus = this.targetPosition.copy(target.position);
    focus.y += CAMERA.height + (target.aiming ? 0.16 : 0);

    this.getLookDirection();
    let safeT = 1;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const probe = focus.clone().addScaledVector(this.lookDirection, -this.currentDistance * t);
      const ground = this.terrain.heightAt(probe.x, probe.z);
      if (probe.y < ground + 0.38) {
        safeT = Math.max(0.18, (i - 1) / 10);
        break;
      }
    }
    const desiredDistance = this.currentDistance * safeT;
    const desired = focus
      .clone()
      .addScaledVector(this.lookDirection, -desiredDistance);
    desired.y += Math.sin(this.shakeTime * 47) * this.shake * 0.35;
    desired.x += Math.cos(this.shakeTime * 53) * this.shake * 0.25;

    if (!this.initialized) {
      this.currentPosition.copy(desired);
      this.initialized = true;
    } else {
      const factor = 1 - Math.exp(-dt * 15);
      this.currentPosition.lerp(desired, factor);
    }

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(
      focus.clone().addScaledVector(this.lookDirection, 14),
    );

    const sprintBoost = target.sprinting ? 6 : 0;
    const targetFov = target.aiming ? 46 : CAMERA.baseFov + sprintBoost;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 7);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.shake *= Math.exp(-dt * 12);
  }

  reset(): void {
    this.initialized = false;
    this.shake = 0;
    this.currentDistance = CAMERA.distance;
  }
}
