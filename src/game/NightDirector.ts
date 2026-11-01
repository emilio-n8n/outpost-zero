import * as THREE from 'three';
import { ENEMY_SCALING, SIEGE, GAME } from '../config';
import { isNight } from './daynight';
import {
  chooseEnemyType,
  nightMaxAlive,
  spawnIntervalForNight,
  type EnemyType,
} from './scaling';

export interface NightHost {
  spawnEnemy: (type: EnemyType, position: THREE.Vector3, night: number) => void;
  spawnWarden: (night: number) => void;
  findSpawnPoint: (minDistance: number, maxDistance: number) => THREE.Vector3 | null;
  showBanner: (title: string, subtitle: string) => void;
  showToast: (message: string) => void;
  onNightStart: (night: number) => void;
  onDawn: (night: number) => void;
  onSiegeStart: () => void;
  onSiegeUpdate: (progress: number, inRange: boolean, timeLeft: number) => void;
  onVictory: () => void;
}

export class NightDirector {
  private readonly host: NightHost;
  private wasNight = false;
  private initialized = false;
  private night = 0;
  private spawnTimer = 0;
  private spawningEnabled = false;
  private siegeActive = false;
  private siegeProgress = 0;
  private siegeSpawnTimer = 0;
  private wardenSpawned = false;
  private activeMaxAlive = 3;

  constructor(host: NightHost) {
    this.host = host;
  }

  get nightNumber(): number {
    return this.night;
  }

  get inSiege(): boolean {
    return this.siegeActive;
  }

  get progress(): number {
    return this.siegeProgress;
  }

  initialize(clock: number, nightNumber: number): void {
    this.night = Math.max(0, nightNumber);
    this.wasNight = isNight(clock);
    this.initialized = true;
    this.spawningEnabled = this.wasNight;
    this.activeMaxAlive = nightMaxAlive(Math.max(1, this.night));
    this.spawnTimer = 5;
  }

  syncClock(clock: number): void {
    this.wasNight = isNight(clock);
  }

  update(
    dt: number,
    clock: number,
    playerPosition: THREE.Vector3,
    aliveEnemies: number,
    playerAlive: boolean,
    beaconPosition: THREE.Vector3 | null,
  ): void {
    if (!this.initialized) this.initialize(clock, this.night);
    const nightNow = isNight(clock);

    if (this.siegeActive) {
      this.updateSiege(dt, playerPosition, aliveEnemies, beaconPosition, playerAlive);
      this.wasNight = nightNow;
      return;
    }

    if (nightNow && !this.wasNight && playerAlive) {
      this.night++;
      this.spawningEnabled = true;
      this.activeMaxAlive = nightMaxAlive(this.night);
      this.spawnTimer = ENEMY_SCALING.initialDelay;
      this.host.onNightStart(this.night);
      this.host.showBanner(
        `NIGHT ${this.night.toString().padStart(2, '0')}`,
        this.night === 1
          ? 'Something is moving beyond the landing lights.'
          : 'The basin is awake. Keep your fire alive.',
      );
    } else if (!nightNow && this.wasNight && playerAlive) {
      this.spawningEnabled = false;
      this.host.onDawn(this.night);
      this.host.showBanner('FIRST LIGHT', 'The creatures are withdrawing into the ash.');
    }
    this.wasNight = nightNow;

    if (!nightNow || !playerAlive) {
      this.spawnTimer = Math.max(this.spawnTimer, 3);
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawningEnabled && this.spawnTimer <= 0 && aliveEnemies < this.activeMaxAlive) {
      this.spawnTimer = spawnIntervalForNight(Math.max(1, this.night));
      const spawn = this.host.findSpawnPoint(30, 52);
      if (spawn) {
        const type = chooseEnemyType(Math.max(1, this.night), Math.random());
        this.host.spawnEnemy(type, spawn, Math.max(1, this.night));
      }
    }
  }

  startSiege(playerPosition: THREE.Vector3): boolean {
    if (this.siegeActive) return false;
    this.siegeActive = true;
    this.siegeProgress = 0;
    this.siegeSpawnTimer = 0;
    this.wardenSpawned = false;
    this.spawningEnabled = false;
    this.host.onSiegeStart();
    this.host.showBanner('UPLINK ACTIVE', 'Hold the landing pad. Rescue is locking on.');
    void playerPosition;
    return true;
  }

  private updateSiege(
    dt: number,
    playerPosition: THREE.Vector3,
    aliveEnemies: number,
    beaconPosition: THREE.Vector3 | null,
    playerAlive: boolean,
  ): void {
    if (!playerAlive) {
      this.siegeActive = false;
      return;
    }
    const inRange = beaconPosition
      ? Math.hypot(
          playerPosition.x - beaconPosition.x,
          playerPosition.z - beaconPosition.z,
        ) <= SIEGE.radius
      : false;
    if (inRange) {
      this.siegeProgress = Math.min(1, this.siegeProgress + dt / SIEGE.duration);
      this.host.onSiegeUpdate(this.siegeProgress, true, SIEGE.duration * (1 - this.siegeProgress));
    } else {
      this.host.onSiegeUpdate(this.siegeProgress, false, SIEGE.duration * (1 - this.siegeProgress));
    }

    this.siegeSpawnTimer -= dt;
    if (this.siegeSpawnTimer <= 0 && aliveEnemies < SIEGE.maxAlive) {
      this.siegeSpawnTimer = SIEGE.spawnInterval;
      const spawn = this.host.findSpawnPoint(27, 46);
      if (spawn) {
        const type = chooseEnemyType(Math.max(2, this.night), Math.random());
        this.host.spawnEnemy(type, spawn, Math.max(1, this.night));
      }
    }
    if (!this.wardenSpawned && this.siegeProgress >= SIEGE.wardenAt) {
      this.wardenSpawned = true;
      const spawn = this.host.findSpawnPoint(38, 50);
      if (spawn) this.host.spawnWarden(Math.max(1, this.night));
      this.host.showToast('MASSIVE SIGNATURE DETECTED');
    }
    if (this.siegeProgress >= 1) {
      this.siegeActive = false;
      this.host.onVictory();
    }
  }

  abortSiege(): void {
    this.siegeActive = false;
  }

  setNight(number: number): void {
    this.night = Math.max(0, number);
    this.activeMaxAlive = nightMaxAlive(Math.max(1, this.night));
  }

  get nightCycleSeconds(): number {
    return GAME.cycleSeconds;
  }
}
