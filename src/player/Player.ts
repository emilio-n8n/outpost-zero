import * as THREE from 'three';
import { PLAYER } from '../config';
import { daylight, isDeepNight } from '../game/daynight';
import type { HotbarItemId } from '../game/data';
import {
  applyDamage,
  applyFood,
  applyHeal,
  clamp,
  coldDamage,
  fallDamage,
  healthRegen,
  starvationDamage,
  tickHunger,
  tickStamina,
} from '../game/survival';
import type { Input } from '../core/Input';
import type { CameraRig } from './CameraRig';
import type { World } from '../world/World';

export interface MovementResult {
  stepped: boolean;
  landingImpact: number;
}

export interface SurvivalResult {
  damage: number;
  cold: boolean;
  starving: boolean;
}

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export class Player {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  health: number = PLAYER.maxHealth;
  hunger: number = 84;
  stamina: number = PLAYER.maxStamina;
  battery: number = 100;
  flashlightOn = false;
  grounded = true;
  sprinting = false;
  moving = false;
  aiming = false;
  cold = false;
  coldExposure = 0;
  sinceDamage = 99;
  sinceSprint = 99;

  private readonly scene: THREE.Scene;
  private readonly world: World;
  private readonly upper = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly weaponRoot = new THREE.Group();
  private readonly blade: THREE.Group;
  private readonly rifle: THREE.Group;
  private readonly flashlight: THREE.SpotLight;
  private readonly flashlightTarget = new THREE.Object3D();
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private selectedItem: HotbarItemId | null = 'blade';
  private walkPhase = 0;
  private meleeAnim = 0;
  private shootAnim = 0;
  private landedImpact = 0;
  private stepMeter = 0;
  private bob = 0;
  targetYaw = 0;

  constructor(scene: THREE.Scene, world: World, spawn: THREE.Vector3) {
    this.scene = scene;
    this.world = world;
    this.position.copy(spawn);
    this.group.name = 'player';
    this.group.position.copy(this.position);
    scene.add(this.group);

    this.blade = this.buildBlade();
    this.rifle = this.buildRifle();
    this.buildCharacter();
    this.weaponRoot.add(this.blade, this.rifle);
    this.upper.add(this.weaponRoot);
    this.group.add(this.upper);

    this.flashlight = new THREE.SpotLight(0xffe6c4, 0, 34, 0.48, 0.55, 1.45);
    this.flashlight.visible = false;
    this.flashlight.castShadow = false;
    this.flashlightTarget.position.set(0, 0, 1);
    scene.add(this.flashlight);
    scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.setWeapon('blade');
  }

  private material(color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.08,
      flatShading: true,
      ...options,
    });
    this.materials.push(material);
    return material;
  }

  private track<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private buildCharacter(): void {
    const suit = this.material(0x5c6d69, { roughness: 0.72 });
    const panel = this.material(0xc1c5ba, { roughness: 0.62, metalness: 0.16 });
    const dark = this.material(0x273234, { roughness: 0.6, metalness: 0.3 });
    const orange = this.material(0xd08643, { roughness: 0.6, emissive: 0x3d1c06, emissiveIntensity: 0.4 });
    const visor = this.material(0x143536, {
      roughness: 0.15,
      metalness: 0.65,
      emissive: 0x56ffe8,
      emissiveIntensity: 0.95,
    });

    this.upper.position.y = 0.9;
    this.group.add(this.upper);

    const pelvis = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.42, 0.26, 0.28)), dark);
    pelvis.position.y = 0.02;
    pelvis.castShadow = true;
    this.upper.add(pelvis);

    const torso = new THREE.Mesh(this.track(new THREE.CapsuleGeometry(0.27, 0.46, 5, 8)), suit);
    torso.position.y = 0.4;
    torso.scale.set(1.1, 1, 0.75);
    torso.castShadow = true;
    this.upper.add(torso);

    const chest = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.38, 0.26, 0.16)), panel);
    chest.position.set(0, 0.49, 0.19);
    chest.rotation.x = -0.08;
    this.upper.add(chest);
    const chestLight = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.1, 0.04, 0.02)),
      this.material(0x8afce8, {
        emissive: 0x46ffe2,
        emissiveIntensity: 2.2,
        roughness: 0.3,
      }),
    );
    chestLight.position.set(0, 0.5, 0.28);
    this.upper.add(chestLight);

    const shoulderL = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.12, 7, 5)), panel);
    shoulderL.position.set(-0.36, 0.57, 0);
    shoulderL.scale.set(1, 0.75, 1);
    this.upper.add(shoulderL);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.36;
    this.upper.add(shoulderR);

    this.head.position.y = 0.79;
    this.upper.add(this.head);
    const helmet = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.225, 9, 7)), panel);
    helmet.scale.set(1, 1.05, 1.05);
    helmet.castShadow = true;
    this.head.add(helmet);
    const visorMesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.195, 9, 5, 0, Math.PI * 1.3, 0.25, Math.PI * 0.58)), visor);
    visorMesh.rotation.y = Math.PI * 0.55;
    visorMesh.position.set(0, 0.01, 0.01);
    this.head.add(visorMesh);
    const helmetAntenna = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.014, 0.02, 0.3, 4)), orange);
    helmetAntenna.position.set(0.16, 0.2, -0.04);
    helmetAntenna.rotation.z = -0.22;
    this.head.add(helmetAntenna);

    const backpack = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.42, 0.52, 0.24)), dark);
    backpack.position.set(0, 0.36, -0.27);
    backpack.castShadow = true;
    this.upper.add(backpack);
    for (const x of [-0.13, 0.13]) {
      const tank = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6)), panel);
      tank.position.set(x, 0.36, -0.43);
      this.upper.add(tank);
      const cap = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.075, 6, 4)), orange);
      cap.position.set(x, 0.56, -0.43);
      this.upper.add(cap);
    }
    const packLight = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.2, 0.03, 0.02)),
      this.material(0x7affdf, { emissive: 0x36ffe0, emissiveIntensity: 1.8 }),
    );
    packLight.position.set(0, 0.62, -0.41);
    this.upper.add(packLight);

    const armGeometry = this.track(new THREE.BoxGeometry(0.13, 0.38, 0.14));
    const forearmGeometry = this.track(new THREE.BoxGeometry(0.115, 0.36, 0.12));
    const handGeometry = this.track(new THREE.SphereGeometry(0.075, 6, 4));
    const buildArm = (root: THREE.Group, side: number): void => {
      root.position.set(0.36 * side, 0.55, 0);
      const upperArm = new THREE.Mesh(armGeometry, suit);
      upperArm.position.y = -0.19;
      upperArm.castShadow = true;
      root.add(upperArm);
      const elbow = new THREE.Group();
      elbow.position.y = -0.38;
      root.add(elbow);
      const forearm = new THREE.Mesh(forearmGeometry, panel);
      forearm.position.y = -0.18;
      forearm.castShadow = true;
      elbow.add(forearm);
      const hand = new THREE.Mesh(handGeometry, dark);
      hand.position.y = -0.38;
      elbow.add(hand);
    };
    buildArm(this.leftArm, -1);
    buildArm(this.rightArm, 1);
    this.upper.add(this.leftArm, this.rightArm);

    const legGeometry = this.track(new THREE.BoxGeometry(0.155, 0.44, 0.17));
    const shinGeometry = this.track(new THREE.BoxGeometry(0.135, 0.38, 0.145));
    const bootGeometry = this.track(new THREE.BoxGeometry(0.19, 0.18, 0.32));
    const buildLeg = (root: THREE.Group, side: number): void => {
      root.position.set(0.145 * side, 0.91, 0);
      const thigh = new THREE.Mesh(legGeometry, suit);
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      root.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      root.add(knee);
      const shin = new THREE.Mesh(shinGeometry, panel);
      shin.position.y = -0.19;
      shin.castShadow = true;
      knee.add(shin);
      const boot = new THREE.Mesh(bootGeometry, dark);
      boot.position.set(0, -0.36, 0.06);
      boot.castShadow = true;
      knee.add(boot);
    };
    buildLeg(this.leftLeg, -1);
    buildLeg(this.rightLeg, 1);
    this.group.add(this.leftLeg, this.rightLeg);

    this.weaponRoot.position.set(0.24, 0.45, 0.23);
    this.group.updateMatrixWorld(true);
  }

  private buildBlade(): THREE.Group {
    const group = new THREE.Group();
    const handleMaterial = this.material(0x2e3434, { roughness: 0.72, metalness: 0.2 });
    const bladeMaterial = this.material(0xaed7d1, { roughness: 0.25, metalness: 0.8 });
    const glowMaterial = this.material(0x7dffe9, {
      emissive: 0x4dffdf,
      emissiveIntensity: 2.6,
      roughness: 0.2,
    });
    const handle = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.055, 0.075, 0.24)), handleMaterial);
    handle.position.z = 0.04;
    group.add(handle);
    const blade = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.035, 0.035, 0.68)), bladeMaterial);
    blade.position.z = 0.47;
    blade.rotation.x = 0.08;
    group.add(blade);
    const edge = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.012, 0.012, 0.6)), glowMaterial);
    edge.position.set(0.027, 0.025, 0.53);
    edge.rotation.x = 0.08;
    group.add(edge);
    group.visible = true;
    return group;
  }

  private buildRifle(): THREE.Group {
    const group = new THREE.Group();
    const metalMaterial = this.material(0x596664, { roughness: 0.42, metalness: 0.6 });
    const darkMaterial = this.material(0x202b2c, { roughness: 0.6, metalness: 0.35 });
    const orangeMaterial = this.material(0xc9773c, { roughness: 0.55, metalness: 0.3 });
    const glowMaterial = this.material(0x74ffe7, {
      emissive: 0x32ffe1,
      emissiveIntensity: 2,
      roughness: 0.25,
    });
    const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.11, 0.13, 0.48)), metalMaterial);
    body.position.z = 0.18;
    group.add(body);
    const stock = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.13, 0.16, 0.28)), darkMaterial);
    stock.position.z = -0.2;
    group.add(stock);
    const barrel = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.032, 0.026, 0.52, 6)), darkMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.62;
    group.add(barrel);
    const cell = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.075, 0.09, 0.23)), orangeMaterial);
    cell.position.set(0.09, 0.02, 0.04);
    group.add(cell);
    const core = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.04, 0.035, 0.15)), glowMaterial);
    core.position.set(0.09, 0.02, 0.22);
    group.add(core);
    const sight = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.07, 0.06, 0.12)), darkMaterial);
    sight.position.set(0, 0.1, 0.1);
    group.add(sight);
    const scope = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 7)), metalMaterial);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.16, 0.15);
    group.add(scope);
    const muzzle = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.05, 0.035, 0.12, 6)), orangeMaterial);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = 0.88;
    group.add(muzzle);
    return group;
  }

  setWeapon(item: HotbarItemId | null): void {
    this.selectedItem = item;
    this.blade.visible = item === 'blade';
    this.rifle.visible = item === 'rifle';
  }

  playMelee(): void {
    this.meleeAnim = 0.28;
  }

  playShoot(): void {
    this.shootAnim = 0.16;
  }

  updateMovement(dt: number, input: Input, rig: CameraRig): MovementResult {
    const forward = rig.getForwardFlat();
    const right = rig.getRightFlat();
    let moveX = 0;
    let moveZ = 0;
    if (input.isDown('KeyW')) {
      moveX += forward.x;
      moveZ += forward.z;
    }
    if (input.isDown('KeyS')) {
      moveX -= forward.x;
      moveZ -= forward.z;
    }
    if (input.isDown('KeyD')) {
      moveX += right.x;
      moveZ += right.z;
    }
    if (input.isDown('KeyA')) {
      moveX -= right.x;
      moveZ -= right.z;
    }
    const inputLength = Math.hypot(moveX, moveZ);
    const wantsMove = inputLength > 0.01;
    if (wantsMove) {
      moveX /= inputLength;
      moveZ /= inputLength;
    }
    const sprintKey = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const canSprint = sprintKey && wantsMove && !this.aiming && this.stamina > 0.5;
    const wasSprinting = this.sprinting;
    this.sprinting = canSprint;
    this.moving = wantsMove;
    if (this.sprinting) {
      this.sinceSprint = 0;
    } else {
      this.sinceSprint += dt;
      if (wasSprinting) this.sinceSprint = 0;
    }
    this.stamina = tickStamina(this.stamina, dt, this.sprinting, this.moving, this.sinceSprint);

    const speed = (this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * (this.aiming ? 0.7 : 1);
    const targetX = moveX * speed;
    const targetZ = moveZ * speed;
    const accel = 1 - Math.exp(-PLAYER.acceleration * dt);
    this.velocity.x += (targetX - this.velocity.x) * accel;
    this.velocity.z += (targetZ - this.velocity.z) * accel;
    if (!wantsMove) {
      const damp = Math.exp(-12 * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    const result: MovementResult = { stepped: false, landingImpact: 0 };
    const wasGrounded = this.grounded;
    let jumped = false;
    if (this.grounded && input.consumePressed('Space') && this.stamina >= PLAYER.jumpStamina) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.grounded = false;
      this.stamina -= PLAYER.jumpStamina;
      this.sinceSprint = 0;
      jumped = true;
    }

    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    if (Math.abs(dx) + Math.abs(dz) > 0.00001) {
      const resolved = this.world.resolveMovement(this.position.x, this.position.z, PLAYER.radius, dx, dz);
      const targetGround = this.world.groundHeight(resolved.x, resolved.z);
      const slopeBlocked =
        this.grounded && targetGround - this.position.y > 0.78 && Math.hypot(dx, dz) > 0.004;
      if (!slopeBlocked) {
        this.position.x = resolved.x;
        this.position.z = resolved.z;
      } else {
        this.velocity.x *= 0.2;
        this.velocity.z *= 0.2;
      }
    }

    const ground = this.world.groundHeight(this.position.x, this.position.z);
    if (wasGrounded && !jumped) {
      const difference = ground - this.position.y;
      if (difference >= -0.58) {
        this.position.y = ground;
        this.velocity.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }
    if (!this.grounded) {
      this.velocity.y -= PLAYER.gravity * dt;
      this.position.y += this.velocity.y * dt;
      const currentGround = this.world.groundHeight(this.position.x, this.position.z);
      if (this.position.y <= currentGround) {
        const impact = Math.abs(this.velocity.y);
        this.position.y = currentGround;
        this.velocity.y = 0;
        this.grounded = true;
        this.landedImpact = fallDamage(impact);
        result.landingImpact = this.landedImpact;
      }
    } else {
      this.position.y = ground;
    }

    if (this.grounded && this.moving) {
      this.stepMeter += Math.hypot(this.velocity.x, this.velocity.z) * dt;
      const stride = this.sprinting ? 1.85 : 1.55;
      if (this.stepMeter > stride) {
        this.stepMeter = 0;
        result.stepped = true;
      }
    } else {
      this.stepMeter = Math.min(this.stepMeter, 1.2);
    }

    const faceDirection = this.aiming || this.meleeAnim > 0 || this.shootAnim > 0;
    this.targetYaw = faceDirection
      ? rig.yaw
      : wantsMove
        ? Math.atan2(moveX, moveZ)
        : this.targetYaw;
    this.yaw += shortestAngle(this.yaw, this.targetYaw) * Math.min(1, dt * 12);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    return result;
  }

  updateSurvival(
    dt: number,
    clock: number,
    nightNumber: number,
    nearWarmth: boolean,
  ): SurvivalResult {
    this.sinceDamage += dt;
    this.hunger = tickHunger(this.hunger, dt);
    if (nearWarmth) this.coldExposure = 0;
    else this.coldExposure += dt;

    const coldAmount = coldDamage(clock, dt, nearWarmth, nightNumber, this.coldExposure);
    const starveAmount = starvationDamage(this.hunger, dt);
    const damage = coldAmount + starveAmount;
    if (damage > 0) {
      this.health = applyDamage(this.health, damage);
      this.sinceDamage = 0;
    } else {
      this.health = healthRegen(
        this.health,
        this.hunger,
        dt,
        this.sinceDamage,
        this.sinceDamage < 9,
      );
    }
    this.cold = isDeepNight(clock) && !nearWarmth;

    if (this.flashlightOn) {
      this.battery = clamp(this.battery - PLAYER.flashlightDrain * dt, 0, 100);
      if (this.battery <= 0) this.setFlashlight(false);
    } else if (daylight(clock) > 0.25) {
      this.battery = clamp(this.battery + PLAYER.flashlightSolar * dt, 0, 100);
    }

    return {
      damage,
      cold: this.cold,
      starving: this.hunger <= 0,
    };
  }

  updateVisuals(dt: number, elapsed: number, rig: CameraRig): void {
    this.meleeAnim = Math.max(0, this.meleeAnim - dt);
    this.shootAnim = Math.max(0, this.shootAnim - dt);

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const walkSpeedFactor = Math.min(1, horizontalSpeed / PLAYER.walkSpeed);
    if (this.moving && this.grounded) {
      this.walkPhase += dt * (5.5 + horizontalSpeed * 0.9);
    } else {
      this.walkPhase += dt * 1.4;
    }
    const swing = this.moving && this.grounded ? Math.sin(this.walkPhase) * 0.55 * walkSpeedFactor : 0;
    const idleBreath = Math.sin(elapsed * 1.8) * 0.012;
    this.bob += ((this.moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.035 : idleBreath) - this.bob) * Math.min(1, dt * 8);
    this.upper.position.y = 0.9 + this.bob;

    const legSwing = this.grounded ? swing : 0.28;
    this.leftLeg.rotation.x = legSwing;
    this.rightLeg.rotation.x = -legSwing;
    this.leftArm.rotation.x = -swing * 0.85;
    this.rightArm.rotation.x = swing * 0.85;
    this.leftArm.rotation.z = 0.08;
    this.rightArm.rotation.z = -0.08;

    if (this.selectedItem === 'rifle') {
      const aimBlend = this.aiming ? 1 : 0.45;
      this.leftArm.rotation.x += -1.05 * aimBlend;
      this.rightArm.rotation.x += -1.18 * aimBlend;
      this.leftArm.rotation.z += 0.38 * aimBlend;
      this.rightArm.rotation.z += -0.32 * aimBlend;
    }

    if (this.meleeAnim > 0) {
      const progress = 1 - this.meleeAnim / 0.28;
      const swingArc = Math.sin(progress * Math.PI);
      this.rightArm.rotation.x = -0.5 - swingArc * 1.9;
      this.rightArm.rotation.z = -0.1 + swingArc * 0.4;
      this.weaponRoot.rotation.x = -swingArc * 0.8;
      this.weaponRoot.rotation.y = 0.45 - swingArc * 1.5;
    } else {
      this.weaponRoot.rotation.x = THREE.MathUtils.lerp(this.weaponRoot.rotation.x, 0, Math.min(1, dt * 12));
      this.weaponRoot.rotation.y = THREE.MathUtils.lerp(this.weaponRoot.rotation.y, 0, Math.min(1, dt * 12));
    }
    if (this.shootAnim > 0) {
      const recoil = this.shootAnim / 0.16;
      this.weaponRoot.position.z = 0.23 - recoil * 0.09;
      this.weaponRoot.rotation.x = -recoil * 0.1;
    } else {
      this.weaponRoot.position.z += (0.23 - this.weaponRoot.position.z) * Math.min(1, dt * 15);
    }

    const relativeYaw = shortestAngle(this.yaw, rig.yaw);
    this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, THREE.MathUtils.clamp(relativeYaw, -0.55, 0.55), Math.min(1, dt * 5));

    this.flashlight.visible = this.flashlightOn;
    if (this.flashlightOn) {
      const look = rig.getLookDirection();
      this.flashlight.position.set(this.position.x, this.position.y + 1.62, this.position.z);
      this.flashlight.position.addScaledVector(look, 0.25);
      this.flashlightTarget.position.copy(this.flashlight.position).addScaledVector(look, 18);
      this.flashlight.intensity = 65;
    } else {
      this.flashlight.intensity = 0;
    }
  }

  setFlashlight(on: boolean): void {
    this.flashlightOn = on && this.battery > 0.5;
    this.flashlight.visible = this.flashlightOn;
  }

  toggleFlashlight(): boolean {
    if (this.flashlightOn) {
      this.setFlashlight(false);
    } else if (this.battery > 0.5) {
      this.setFlashlight(true);
    }
    return this.flashlightOn;
  }

  applyDamage(amount: number): boolean {
    if (amount <= 0) return this.health <= 0;
    this.health = applyDamage(this.health, amount);
    this.sinceDamage = 0;
    if (this.health <= 0) {
      this.health = 0;
      return true;
    }
    return false;
  }

  heal(amount: number): void {
    this.health = applyHeal(this.health, amount);
  }

  feed(amount: number): void {
    this.hunger = applyFood(this.hunger, amount);
  }

  rechargeBattery(amount: number): void {
    this.battery = clamp(this.battery + amount, 0, 100);
    if (this.battery > 0.5 && this.flashlightOn) this.flashlight.visible = true;
  }

  getEyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + 1.52, this.position.z);
  }

  getMuzzlePosition(): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    const muzzle = new THREE.Vector3(0, 0.02, 0.92);
    return this.weaponRoot.localToWorld(muzzle);
  }

  setPosition(position: THREE.Vector3): void {
    this.position.copy(position);
    this.position.y = this.world.groundHeight(position.x, position.z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.group.position.copy(this.position);
  }

  reset(spawn: THREE.Vector3, yaw: number): void {
    this.health = PLAYER.maxHealth;
    this.hunger = 84;
    this.stamina = PLAYER.maxStamina;
    this.battery = 100;
    this.flashlightOn = false;
    this.coldExposure = 0;
    this.sinceDamage = 99;
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.setWeapon('blade');
    this.setPosition(spawn);
    this.group.rotation.y = yaw;
  }

  dispose(): void {
    this.scene.remove(this.group, this.flashlight, this.flashlightTarget);
    this.flashlight.dispose();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
  }
}
