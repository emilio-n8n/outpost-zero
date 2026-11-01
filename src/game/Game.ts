import * as THREE from 'three';
import {
  BUILDS,
  BLUEPRINTS,
  ITEMS,
  NODE_INFO,
  RESOURCES,
  addResource,
  buildState as evaluateBuild,
  RECIPES,
  consumeSelected,
  craftRecipe,
  createInventory,
  payCost,
  recipeState as evaluateRecipe,
  selectedSlot,
  type BlueprintId,
  type BuildType,
  type HotbarItemId,
  type InventoryState,
  type ResourceId,
} from './data';
import {
  CAMERA,
  COMBAT,
  GAME,
  OUTPOST,
  PLAYER,
  QUALITY,
  SIEGE,
  type QualityLevel,
} from '../config';
import { Input } from '../core/Input';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from '../core/settings';
import { readJson, writeJson } from '../core/storage';
import { AudioEngine } from '../audio/AudioEngine';
import { FX } from '../fx/FX';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { CameraRig } from '../player/CameraRig';
import { BuildSystem, type PlacementInfo } from '../world/BuildSystem';
import { PostFX } from '../world/PostFX';
import { EnemyManager, type EnemyCallbacks } from '../enemies/EnemyManager';
import { Enemy } from '../enemies/Enemy';
import type { Structure } from '../world/Structures';
import type { WorldInteractable } from '../world/types';
import type { ResourceNode } from '../world/ResourceManager';
import { createObjectives, primaryObjective, type ObjectiveState } from './objectives';
import { chooseEnemyType, type EnemyType } from './scaling';
import { formatClock, isNight, nightStrength } from './daynight';
import { validateSaveData, type SaveData, type SaveStats } from './save';
import { NightDirector } from './NightDirector';
import { UI } from '../ui/UI';

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'dead' | 'victory';
export type TerminalTab = 'inventory' | 'crafting' | 'build';

export interface InteractionInfo {
  kind: 'node' | 'blueprint' | 'loot' | 'campfire' | 'turret' | 'beacon';
  key: string;
  label: string;
  detail: string;
}

export interface SiegeState {
  active: boolean;
  progress: number;
  inRange: boolean;
  timeLeft: number;
}


interface HudSummary {
  day: number;
  clock: string;
  playTime: number;
}

const emptyStats = (): SaveStats => ({
  kills: 0,
  resourcesGathered: 0,
  structuresBuilt: 0,
  nightsSurvived: 0,
  deaths: 0,
});

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly fx: FX;
  readonly audio = new AudioEngine();
  readonly input: Input;
  readonly ui: UI;
  settings: Settings = loadSettings();

  world!: World;
  player!: Player;
  cameraRig!: CameraRig;
  enemies!: EnemyManager;
  buildSystem!: BuildSystem;
  nightDirector: NightDirector;
  postfx: PostFX;

  inventory: InventoryState = createInventory();
  objectives: ObjectiveState = createObjectives();
  stats: SaveStats = emptyStats();
  seed = '';
  clock: number = GAME.startClock;
  day: number = 1;
  playTime: number = 0;
  fps: number = 60;
  inventoryVersion = 0;
  state: GameState = 'loading';
  menuOpen = false;
  currentInteraction: InteractionInfo | null = null;
  placement: PlacementInfo | null = null;
  siege: SiegeState = { active: false, progress: 0, inRange: false, timeLeft: SIEGE.duration };
  deathCause = 'Suit failure';
  showFps = false;

  private readonly app: HTMLElement;
  private elapsedTime = 0;
  private lastFrameTime = performance.now();
  private lastSaveAt = 0;
  private autosaveTimer = 0;
  private weaponCooldown = 0;
  private useCooldown = 0;
  private damageFxCooldown = 0;
  private growlCooldown = 0;
  private turretSoundCooldown = 0;
  private noticeCooldown = 0;
  private lastPauseAt = 0;
  private suppressPointerLoss = false;
  private attackGuardUntil = 0;
  private titleAngle = 0.9;
  private lastObjectiveId = '';
  private equippedItem: HotbarItemId | null = null;
  private lastHurtSound = 0;
  private currentRunMode: 'new' | 'load' | 'title' = 'title';
  private interactionNode: ResourceNode | null = null;
  private interactionInteractable: WorldInteractable | null = null;
  private interactionStructure: Structure | null = null;
  private lastAppliedQuality: QualityLevel = 'medium';
  private lastFrameProjection = 0;

  constructor(app: HTMLElement) {
    this.app = app;
    this.lastAppliedQuality = this.settings.quality;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, QUALITY[this.settings.quality].pixelRatio),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = QUALITY[this.settings.quality].shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    app.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.baseFov,
      window.innerWidth / window.innerHeight,
      0.08,
      950,
    );
    this.camera.position.set(24, 12, 27);
    this.fx = new FX(this.scene);
    this.input = new Input(this.renderer.domElement, (locked) => this.onPointerLockChanged(locked));
    this.input.setCanvasClickHandler(() => this.onCanvasClick());
    this.ui = new UI(this);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera, this.settings.quality);
    this.postfx.setSize(
      window.innerWidth,
      window.innerHeight,
      this.renderer.getPixelRatio(),
    );

    this.nightDirector = new NightDirector({
      spawnEnemy: (type, position, night) => {
        this.enemies?.spawn(type, position, night);
      },
      spawnWarden: (night) => {
        const spawn = this.findSpawnPoint(38, 50);
        if (spawn) this.enemies?.spawn('warden', spawn, night);
      },
      findSpawnPoint: (min, max) => this.findSpawnPoint(min, max),
      showBanner: (title, subtitle) => this.ui.showBanner(title, subtitle),
      showToast: (message) => this.ui.toast(message, 'warning'),
      onNightStart: (night) => this.onNightStart(night),
      onDawn: (night) => this.onDawn(night),
      onSiegeStart: () => this.onSiegeStart(),
      onSiegeUpdate: (progress, inRange, timeLeft) => {
        this.siege = { active: true, progress, inRange, timeLeft };
      },
      onVictory: () => this.handleVictory(),
    });

    this.audio.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume,
    );
    this.showFps = this.settings.showFps;
    this.applyQuality(false);

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handlePageHide);
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.ui.toast('GRAPHICS LINK LOST — RELOAD THE PAGE', 'danger');
    });

    this.ui.setLoading(3, 'INITIALIZING SUIT LINK', 'Establishing local telemetry...');
    requestAnimationFrame(this.loop);
    void this.boot();
  }

  private async boot(): Promise<void> {
    try {
      this.seed = this.generateSeed();
      this.ui.setLoading(8, 'LOCKING ORBITAL POSITION');
      await this.nextFrame();
      await this.createRun(this.seed, null, 'title');
      this.enterTitle(true);
      this.installDebugApi();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unknown initialization failure';
      this.ui.showLoadingError(message);
    }
  }

  private nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  private generateSeed(): string {
    const values = new Uint32Array(2);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(values);
    } else {
      values[0] = Math.floor(Math.random() * 0xffffffff);
      values[1] = Math.floor(Math.random() * 0xffffffff);
    }
    const first = (values[0] ?? 0).toString(36).slice(-4).toUpperCase();
    const second = (values[1] ?? 0).toString(36).slice(-3).toUpperCase();
    return `OZ-${first}${second}`;
  }

  private async createRun(
    seed: string,
    save: SaveData | null,
    mode: 'title' | 'new' | 'load',
  ): Promise<void> {
    this.state = 'loading';
    this.menuOpen = false;
    this.currentRunMode = mode;
    this.ui.closeTerminal();
    this.ui.hidePause();
    this.ui.hideDeath();
    this.ui.hideVictory();
    this.releasePointer();
    this.teardownRun();
    this.seed = seed;
    this.siege = { active: false, progress: 0, inRange: false, timeLeft: SIEGE.duration };
    this.currentInteraction = null;
    this.placement = null;
    this.interactionNode = null;
    this.interactionInteractable = null;
    this.interactionStructure = null;

    this.ui.setLoading(13, 'LOCKING ORBITAL POSITION');
    await this.nextFrame();

    this.world = new World(this.scene, seed, save?.looted ?? []);
    this.ui.setLoading(46, 'RAISING THE BASIN');
    await this.nextFrame();

    const spawn = save
      ? new THREE.Vector3(save.player.x, save.player.y, save.player.z)
      : this.world.getSpawnPoint();
    const yaw = save
      ? save.player.yaw
      : Math.atan2(OUTPOST.x - spawn.x, OUTPOST.z - spawn.z);
    this.player = new Player(this.scene, this.world, spawn);
    this.player.yaw = yaw;
    this.player.group.rotation.y = yaw;
    this.enemies = new EnemyManager(this.scene, this.world, this.fx);
    this.buildSystem = new BuildSystem(this.scene, this.world.terrain);
    this.cameraRig = new CameraRig(this.camera, this.world.terrain);
    this.cameraRig.yaw = yaw;
    this.cameraRig.setSensitivity(this.settings.sensitivity);

    this.ui.setLoading(64, 'STITCHING SUIT TELEMETRY');
    await this.nextFrame();

    if (save) {
      this.applySave(save);
    } else {
      this.inventory = createInventory();
      this.objectives = createObjectives();
      this.stats = emptyStats();
      this.clock = mode === 'title' ? 0.805 : GAME.startClock;
      this.day = 1;
      this.playTime = 0;
      this.inventoryVersion++;
      this.player.reset(spawn, yaw);
      this.player.yaw = yaw;
      this.player.group.rotation.y = yaw;
      this.cameraRig.yaw = yaw;
    }

    this.ui.setLoading(78, 'SCANNING WRECK SIGNALS');
    await this.nextFrame();

    this.ui.onWorldChanged(this.world);
    this.ui.resetCaches();
    this.updateEquippedWeapon();
    this.nightDirector.initialize(this.clock, save?.nightNumber ?? 0);
    this.lastObjectiveId = primaryObjective(this.objectives).id;
    this.ui.setLoading(94, 'CALIBRATING FIELD LINK');
    await this.nextFrame();
    this.ui.setLoading(100, 'LINK READY');
    await this.nextFrame();

    if (save) {
      this.ui.toast('CHECKPOINT LINK STABLE', 'success');
    }
  }

  private teardownRun(): void {
    try {
      this.buildSystem?.stop();
      this.enemies?.dispose();
      this.player?.dispose();
      this.world?.dispose();
    } catch (error) {
      console.warn('Run teardown warning', error);
    }
    this.fx.clear();
    this.currentInteraction = null;
    this.placement = null;
    this.interactionNode = null;
    this.interactionInteractable = null;
    this.interactionStructure = null;
    this.ui.hideDeath();
    this.ui.hideVictory();
  }

  private applySave(save: SaveData): void {
    this.clock = save.clock;
    this.day = save.day;
    this.playTime = save.playTime;
    this.inventory = {
      resources: { ...save.inventory.resources },
      hotbar: save.inventory.hotbar.map((slot) => (slot ? { ...slot } : null)),
      selected: save.inventory.selected,
      tools: { ...save.inventory.tools },
    };
    this.objectives = {
      ...save.objectives,
      blueprints: [...save.objectives.blueprints],
    };
    this.stats = { ...save.stats };
    this.inventoryVersion++;
    this.siege = { active: false, progress: 0, inRange: false, timeLeft: SIEGE.duration };

    this.player.position.set(save.player.x, save.player.y, save.player.z);
    this.player.setPosition(this.player.position);
    this.player.yaw = save.player.yaw;
    this.player.targetYaw = save.player.yaw;
    this.player.group.rotation.y = save.player.yaw;
    this.player.health = save.player.health;
    this.player.hunger = save.player.hunger;
    this.player.stamina = save.player.stamina;
    this.player.battery = save.player.battery;
    this.player.setFlashlight(save.player.flashlight);
    this.cameraRig.yaw = save.player.yaw;
    this.cameraRig.pitch = CAMERA.defaultPitch;

    for (const structure of save.structures) {
      this.world.structures.create(structure.type, structure.x, structure.z, structure.rotation, structure);
    }
    this.world.resources.applyCooldowns(save.nodeCooldowns);
    this.objectives.beaconPlaced =
      this.objectives.beaconPlaced || this.world.structures.getBeacon() !== null;
    this.objectives.nightsSurvived = Math.max(
      this.objectives.nightsSurvived,
      this.stats.nightsSurvived,
    );
    this.stats.nightsSurvived = this.objectives.nightsSurvived;
    this.nightDirector.setNight(save.nightNumber);
    this.nightDirector.syncClock(save.clock);
  }

  private enterPlaying(mode: 'new' | 'load'): void {
    this.state = 'playing';
    this.menuOpen = false;
    this.ui.closeTerminal();
    this.ui.hidePause();
    this.ui.hideDeath();
    this.ui.hideVictory();
    this.ui.beginRun();
    this.ui.resetCaches();
    this.audio.init();
    this.audio.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume,
    );
    this.camera.fov = CAMERA.baseFov;
    this.camera.updateProjectionMatrix();
    this.cameraRig.reset();
    this.cameraRig.pitch = CAMERA.defaultPitch;
    this.cameraRig.yaw = this.player.yaw;
    this.cameraRig.update(0.016, this.player);
    this.player.aiming = false;
    this.currentInteraction = null;
    this.placement = null;
    this.weaponCooldown = 0;
    this.useCooldown = 0;
    this.autosaveTimer = 0;
    this.damageFxCooldown = 0;
    this.lastObjectiveId = primaryObjective(this.objectives).id;
    this.updateEquippedWeapon();
    this.ui.showBanner(
      mode === 'load' ? 'LINK RESTORED' : `DAY ${this.day.toString().padStart(2, '0')}`,
      mode === 'load'
        ? 'Checkpoint telemetry recovered. The basin is still waiting.'
        : 'OUTPOST ZERO // PREPARE FOR NIGHTFALL',
    );
    if (mode === 'new') {
      this.ui.toast('SUIT LINK ESTABLISHED. CHECK YOUR FIELD TERMINAL WITH TAB.', 'info');
      this.saveGame(false);
    }
  }

  private enterTitle(initial = false): void {
    this.state = 'title';
    this.menuOpen = false;
    this.suppressPointerLoss = true;
    this.input.exitPointerLock();
    window.setTimeout(() => {
      this.suppressPointerLoss = false;
    }, 250);
    this.cancelBuildMode(true);
    this.ui.closeTerminal();
    this.ui.hidePause();
    this.ui.hideDeath();
    this.ui.hideVictory();
    this.ui.hideHud();
    this.enemies?.clearAll(false);
    this.nightDirector.abortSiege();
    this.siege = { active: false, progress: 0, inRange: false, timeLeft: SIEGE.duration };
    if (this.world && this.player) {
      const spawn = this.world.getSpawnPoint();
      const yaw = Math.atan2(OUTPOST.x - spawn.x, OUTPOST.z - spawn.z);
      this.player.reset(spawn, yaw);
      this.player.group.rotation.y = yaw;
      this.clock = 0.805;
      this.day = Math.max(1, this.day);
      if (this.cameraRig) {
        this.cameraRig.yaw = yaw;
        this.cameraRig.pitch = CAMERA.defaultPitch;
      }
      this.nightDirector.syncClock(this.clock);
    }
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.titleAngle = initial ? 0.9 : this.titleAngle;
    this.currentInteraction = null;
    this.placement = null;
    this.ui.resetCaches();
    this.ui.hideLoading();
    this.ui.showTitle(this.hasSave(), this.getSaveSummary());
  }

  async startNewGame(): Promise<void> {
    if (this.state === 'loading') return;
    this.audio.init();
    this.audio.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume,
    );
    this.state = 'loading';
    this.releasePointer();
    this.ui.setLoading(4, 'OPENING NEW EXPEDITION', 'The carrier will not return. Make the outpost work.');
    await this.nextFrame();
    const seed = this.generateSeed();
    await this.createRun(seed, null, 'new');
    this.enterPlaying('new');
  }

  async continueGame(): Promise<void> {
    if (this.state === 'loading') return;
    const save = this.readSave();
    if (!save) {
      this.ui.toast('NO VALID CHECKPOINT FOUND', 'warning');
      return;
    }
    this.audio.init();
    this.audio.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume,
    );
    this.state = 'loading';
    this.releasePointer();
    this.ui.setLoading(5, 'RECOVERING EXPEDITION', 'Reconstructing basin telemetry...');
    await this.nextFrame();
    await this.createRun(save.seed, save, 'load');
    this.enterPlaying('load');
  }

  async loadCheckpoint(): Promise<void> {
    if (this.state === 'loading') return;
    const save = this.readSave();
    if (!save) {
      this.ui.toast('NO VALID CHECKPOINT FOUND', 'warning');
      return;
    }
    this.audio.init();
    this.state = 'loading';
    this.releasePointer();
    this.ui.setLoading(6, 'RESTORING CHECKPOINT', 'The last stable suit telemetry is being recovered.');
    await this.nextFrame();
    await this.createRun(save.seed, save, 'load');
    this.enterPlaying('load');
  }

  pause(): void {
    if (this.state !== 'playing' || this.menuOpen) return;
    this.state = 'paused';
    this.lastPauseAt = performance.now();
    this.releasePointer();
    this.currentInteraction = null;
    this.interactionNode = null;
    this.world?.resources.setHighlight(null);
    this.ui.showPause();
    this.audio.uiClose();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    if (performance.now() - this.lastPauseAt < 120) return;
    this.state = 'playing';
    this.ui.hidePause();
    this.input.requestPointerLock();
    this.attackGuardUntil = performance.now() + 180;
    this.audio.uiClick();
  }

  quitToTitle(): void {
    if (this.state === 'loading') return;
    if (this.state === 'playing' || this.state === 'paused') {
      this.saveGame(false);
    }
    this.releasePointer();
    this.cancelBuildMode(true);
    this.ui.hidePause();
    this.enterTitle();
  }

  openTerminal(tab: TerminalTab): void {
    if (this.state !== 'playing' || this.buildSystem?.activeType) return;
    this.menuOpen = true;
    this.currentInteraction = null;
    this.interactionNode = null;
    this.world?.resources.setHighlight(null);
    this.releasePointer();
    this.ui.openTerminal(tab);
    this.audio.uiOpen();
  }

  closeTerminal(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.ui.closeTerminal();
    if (this.state === 'playing') {
      this.input.requestPointerLock();
      this.attackGuardUntil = performance.now() + 150;
    }
    this.audio.uiClose();
  }

  selectHotbar(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.inventory.hotbar.length) return;
    if (this.inventory.selected === index) return;
    this.inventory.selected = index;
    this.inventoryVersion++;
    this.updateEquippedWeapon();
  }

  useHotbar(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.inventory.hotbar.length) return;
    this.selectHotbar(index);
    const slot = selectedSlot(this.inventory);
    if (!slot) return;
    const item = ITEMS[slot.item];
    if (item.kind === 'consumable') {
      this.useSelectedConsumable();
    }
    this.updateEquippedWeapon();
  }

  eatBiomass(): void {
    if (this.inventory.resources.food <= 0) {
      this.notice('NO BIOMASS IN STORAGE', 'warning');
      return;
    }
    if (this.player.hunger >= PLAYER.maxHunger) {
      this.notice('HUNGER ALREADY FULL', 'info');
      return;
    }
    this.inventory.resources.food -= 1;
    this.inventoryVersion++;
    this.player.feed(12);
    this.audio.eat();
    this.ui.toast('+12 HUNGER · RAW BIOMASS CONSUMED', 'success');
    this.ui.refreshTerminal();
  }

  recipeState(recipeId: string): { ok: boolean; reason: string | null } {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) return { ok: false, reason: 'Unknown recipe' };
    return evaluateRecipe(recipe, this.inventory, {
      blueprints: this.objectives.blueprints,
      nearFire: this.getNearbyFire(),
    });
  }

  craft(recipeId: string): void {
    if (this.state !== 'playing') return;
    const recipe = this.getRecipe(recipeId);
    if (!recipe) return;
    const context = {
      blueprints: this.objectives.blueprints,
      nearFire: this.getNearbyFire(),
    };
    const status = evaluateRecipe(recipe, this.inventory, context);
    if (!status.ok) {
      this.notice(status.reason ?? 'FABRICATION FAILED', 'warning');
      return;
    }
    const result = craftRecipe(recipe, this.inventory, context);
    if (!result.ok) {
      this.notice(result.reason ?? 'FABRICATION FAILED', 'warning');
      return;
    }
    if (recipe.result.kind === 'tool') {
      if (recipe.result.tool === 'axe') this.objectives.craftedAxe = true;
      if (recipe.result.tool === 'pick') this.objectives.craftedPick = true;
    }
    this.inventoryVersion++;
    this.audio.craft();
    this.ui.toast(`${recipe.name.toUpperCase()} FABRICATED`, 'success');
    if (recipe.result.kind === 'item') {
      if (recipe.result.item === 'rifle') {
        const rifleIndex = this.inventory.hotbar.findIndex((slot) => slot?.item === 'rifle');
        if (rifleIndex >= 0) this.selectHotbar(rifleIndex);
      }
    }
    this.updateEquippedWeapon();
    this.ui.refreshTerminal();
    this.autosaveTimer = Math.max(this.autosaveTimer, GAME.autosaveInterval - 8);
  }

  buildState(type: BuildType): { ok: boolean; reason: string | null } {
    const def = BUILDS[type];
    return evaluateBuild(
      def,
      this.inventory,
      this.objectives.blueprints,
      this.world?.structures.countOf(type) ?? 0,
    );
  }

  beginBuild(type: BuildType): void {
    if (this.state !== 'playing') return;
    if (this.buildSystem?.activeType) this.cancelBuildMode(true);
    const state = this.buildState(type);
    if (!state.ok) {
      this.notice(state.reason ?? 'CONSTRUCTION UNAVAILABLE', 'warning');
      return;
    }
    this.closeTerminal();
    this.buildSystem.start(type);
    this.placement = null;
    this.currentInteraction = null;
    this.interactionNode = null;
    this.world.resources.setHighlight(null);
    this.audio.uiOpen();
    this.ui.toast(`CONSTRUCTION LINKED // ${BUILDS[type].name.toUpperCase()}`, 'info');
  }

  cancelBuildMode(silent = false): void {
    if (!this.buildSystem?.activeType) return;
    this.buildSystem.stop();
    this.placement = null;
    if (!silent) this.audio.uiClose();
  }

  getNearbyFire(): boolean {
    return Boolean(
      this.world?.structures.litCampfireNear(this.player?.position.x ?? 0, this.player?.position.z ?? 0),
    );
  }

  saveGame(manual = true): boolean {
    if (!this.world || !this.player) return false;
    if (this.state === 'loading' || this.state === 'dead' || this.state === 'victory') return false;
    if (this.siege.active) {
      if (manual) this.notice('UPLINK ACTIVE — CHECKPOINT LOCKED', 'warning');
      return false;
    }
    const save: SaveData = {
      version: 1,
      seed: this.seed,
      savedAt: Date.now(),
      clock: this.clock,
      day: this.day,
      nightNumber: this.nightDirector.nightNumber,
      playTime: this.playTime,
      player: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        yaw: this.player.yaw,
        health: this.player.health,
        hunger: this.player.hunger,
        stamina: this.player.stamina,
        battery: this.player.battery,
        flashlight: this.player.flashlightOn,
      },
      inventory: {
        resources: { ...this.inventory.resources },
        hotbar: this.inventory.hotbar.map((slot) => (slot ? { ...slot } : null)),
        selected: this.inventory.selected,
        tools: { ...this.inventory.tools },
      },
      objectives: {
        ...this.objectives,
        blueprints: [...this.objectives.blueprints],
      },
      stats: { ...this.stats },
      structures: this.world.structures.serialize(),
      nodeCooldowns: this.world.resources.getCooldowns(),
      looted: this.world.getLootedIds(),
    };
    const saved = writeJson(GAME.saveKey, save);
    this.autosaveTimer = 0;
    if (saved) {
      this.lastSaveAt = Date.now();
      if (manual) {
        this.audio.save();
        this.ui.toast('CHECKPOINT SYNCED', 'success');
      }
    } else if (manual) {
      this.ui.toast('CHECKPOINT WRITE FAILED', 'danger');
    }
    return saved;
  }

  hasSave(): boolean {
    return this.readSave() !== null;
  }

  getSaveSummary(): HudSummary | null {
    const save = this.readSave();
    if (!save) return null;
    return { day: save.day, clock: formatClock(save.clock), playTime: save.playTime };
  }

  private readSave(): SaveData | null {
    const raw = readJson<unknown>(GAME.saveKey);
    return validateSaveData(raw);
  }

  applySettings(settings: Settings): void {
    const qualityChanged = settings.quality !== this.lastAppliedQuality;
    this.settings = { ...settings };
    this.showFps = this.settings.showFps;
    saveSettings(this.settings);
    this.audio.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume,
    );
    this.cameraRig?.setSensitivity(this.settings.sensitivity);
    this.input?.setEnabled(this.state !== 'loading');
    if (qualityChanged) {
      this.applyQuality(true);
      this.lastAppliedQuality = this.settings.quality;
    }
  }

  resetSettings(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    saveSettings(this.settings);
    this.lastAppliedQuality = this.settings.quality;
    this.audio.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume,
    );
    this.applyQuality(true);
    this.ui.toast('TERMINAL CONFIGURATION RESTORED', 'info');
  }

  private applyQuality(updateMaterials: boolean): void {
    const settings = QUALITY[this.settings.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.postfx?.setQuality(this.settings.quality);
    this.postfx?.setSize(window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());
    this.world?.applyQuality(this.settings.quality);
    this.cameraRig?.setSensitivity(this.settings.sensitivity);
    if (updateMaterials) {
      this.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) material.needsUpdate = true;
        }
      });
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private onNightStart(night: number): void {
    this.audio.nightfall();
    this.saveGame(false);
    void night;
  }

  private onDawn(night: number): void {
    this.enemies.clearAll(true);
    this.stats.nightsSurvived += 1;
    this.objectives.nightsSurvived += 1;
    this.audio.dawn();
    this.ui.toast(`NIGHT ${night.toString().padStart(2, '0')} SURVIVED`, 'success');
    this.saveGame(false);
  }

  private onSiegeStart(): void {
    this.siege = { active: true, progress: 0, inRange: false, timeLeft: SIEGE.duration };
    this.audio.alert();
    this.autosaveTimer = 0;
  }

  private handleVictory(): void {
    if (this.state !== 'playing') return;
    this.state = 'victory';
    this.siege = { active: false, progress: 1, inRange: true, timeLeft: 0 };
    this.enemies.clearAll(true);
    this.releasePointer();
    this.ui.hideHud();
    this.audio.victory();
    this.ui.showVictory({
      days: this.day,
      nights: this.stats.nightsSurvived,
      kills: this.stats.kills,
      structures: this.stats.structuresBuilt,
      playTime: this.playTime,
    });
  }

  private handleDeath(cause: string): void {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.deathCause = cause;
    this.stats.deaths += 1;
    this.player.health = 0;
    this.nightDirector.abortSiege();
    this.siege.active = false;
    this.releasePointer();
    this.ui.hideHud();
    this.audio.defeat();
    this.ui.showDeath(cause, {
      days: this.day,
      nights: this.stats.nightsSurvived,
      kills: this.stats.kills,
      playTime: this.playTime,
    });
  }

  respawnFromDeath(): void {
    if (this.state !== 'dead') return;
    const shelter = this.world.structures.getShelter();
    const spawn = shelter
      ? new THREE.Vector3(shelter.x + 2.4, 0, shelter.z + 1.6)
      : this.world.getSpawnPoint();
    spawn.y = this.world.groundHeight(spawn.x, spawn.z);
    const previousClock = this.clock;
    if (previousClock >= GAME.nightEnd) this.day += 1;
    this.clock = 0.27;
    this.enemies.clearAll(true);
    this.nightDirector.abortSiege();
    this.nightDirector.syncClock(this.clock);
    this.siege = { active: false, progress: 0, inRange: false, timeLeft: SIEGE.duration };
    for (const id of Object.keys(this.inventory.resources) as ResourceId[]) {
      this.inventory.resources[id] = Math.floor(this.inventory.resources[id] * 0.7);
    }
    this.inventoryVersion++;
    this.player.health = 55;
    this.player.hunger = 50;
    this.player.stamina = PLAYER.maxStamina;
    this.player.battery = 100;
    this.player.setFlashlight(false);
    const yaw = Math.atan2(OUTPOST.x - spawn.x, OUTPOST.z - spawn.z);
    this.player.setPosition(spawn);
    this.player.yaw = yaw;
    this.player.targetYaw = yaw;
    this.player.group.rotation.y = yaw;
    this.player.coldExposure = 0;
    this.player.sinceDamage = 99;
    this.cameraRig.reset();
    this.cameraRig.yaw = yaw;
    this.cameraRig.pitch = CAMERA.defaultPitch;
    this.state = 'playing';
    this.menuOpen = false;
    this.ui.hideDeath();
    this.ui.beginRun();
    this.ui.resetCaches();
    this.updateEquippedWeapon();
    this.ui.showBanner(
      `DAY ${this.day.toString().padStart(2, '0')} // DAWN`,
      shelter ? 'SHELTER RECOVERY PROTOCOL COMPLETE' : 'OUTPOST RECOVERY PROTOCOL COMPLETE',
    );
    this.ui.toast('EMERGENCY RECOVERY COST 30% OF CARRIED RESOURCES', 'warning');
    this.input.requestPointerLock();
    this.attackGuardUntil = performance.now() + 250;
    this.audio.init();
  }

  private releasePointer(): void {
    this.suppressPointerLoss = true;
    this.input?.exitPointerLock();
    window.setTimeout(() => {
      this.suppressPointerLoss = false;
    }, 260);
  }

  private onPointerLockChanged(locked: boolean): void {
    if (locked) return;
    if (
      this.state === 'playing' &&
      !this.menuOpen &&
      !this.suppressPointerLoss &&
      !this.ui.isModalOpen()
    ) {
      this.pause();
    }
  }

  private onCanvasClick(): void {
    if (this.state !== 'playing' || this.menuOpen) return;
    if (!this.input.isPointerLocked()) {
      this.audio.init();
      this.input.requestPointerLock();
      this.attackGuardUntil = performance.now() + 220;
      this.input.consumeMousePressed(0);
    }
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, QUALITY[this.settings.quality].pixelRatio),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.postfx.setSize(window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden && this.state === 'playing') this.pause();
  };

  private handlePageHide = (): void => {
    if (this.state === 'playing') this.saveGame(false);
  };

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    this.fps = this.fps * 0.9 + (1 / dt) * 0.1;
    this.elapsedTime += dt;

    this.handleGlobalInput();
    if (this.state === 'playing' && !this.menuOpen) {
      this.simulate(dt);
    } else if (this.state === 'title') {
      this.updateTitle(dt);
    } else {
      this.updatePassive(dt);
    }

    this.fx.update(this.state === 'paused' ? dt * 0.3 : dt);
    if (this.world) this.render();
    if (this.state !== 'loading') this.ui.updateHud();
    this.input.clearFrame();
  };

  private handleGlobalInput(): void {
    if (this.ui.isModalOpen()) return;
    if (this.input.consumePressed('Escape')) {
      if (this.buildSystem?.activeType) {
        this.cancelBuildMode();
        this.releasePointer();
        this.pause();
        return;
      }
      if (this.menuOpen) {
        this.closeTerminal();
        return;
      }
      if (this.state === 'playing') {
        this.pause();
        return;
      }
      if (this.state === 'paused' && performance.now() - this.lastPauseAt > 220) {
        this.resume();
        return;
      }
    }

    if (this.state === 'playing') {
      if (this.input.consumePressed('Tab') || this.input.consumePressed('KeyI')) {
        if (this.menuOpen) this.closeTerminal();
        else if (!this.buildSystem?.activeType) this.openTerminal('inventory');
      }
      if (this.input.consumePressed('KeyC')) {
        if (this.menuOpen) this.ui.openTerminal('crafting');
        else if (!this.buildSystem?.activeType) this.openTerminal('crafting');
      }
      if (this.input.consumePressed('KeyB')) {
        if (this.menuOpen) this.ui.openTerminal('build');
        else if (!this.buildSystem?.activeType) this.openTerminal('build');
      }
      if (this.input.consumePressed('KeyF')) this.toggleFlashlight();
      for (let index = 0; index < 6; index++) {
        if (this.input.consumePressed(`Digit${index + 1}`)) this.selectHotbar(index);
      }
      if (this.buildSystem?.activeType && this.input.consumePressed('KeyR')) {
        this.buildSystem.rotate();
      }
      if (this.buildSystem?.activeType && this.input.consumePressed('KeyQ')) {
        this.cancelBuildMode();
      }
    }
  }

  private simulate(dt: number): void {
    if (!this.world || !this.player) return;
    this.weaponCooldown = Math.max(0, this.weaponCooldown - dt);
    this.useCooldown = Math.max(0, this.useCooldown - dt);
    this.damageFxCooldown = Math.max(0, this.damageFxCooldown - dt);
    this.noticeCooldown = Math.max(0, this.noticeCooldown - dt);
    this.turretSoundCooldown = Math.max(0, this.turretSoundCooldown - dt);
    this.playTime += dt;
    this.autosaveTimer += dt;
    this.clock += dt / GAME.cycleSeconds;
    if (this.clock >= 1) {
      this.clock -= 1;
      this.day += 1;
    }

    if (this.input.isPointerLocked()) {
      const look = this.input.consumeMouseDelta();
      this.cameraRig.handleMouse(look.x, look.y);
    } else {
      this.input.consumeMouseDelta();
    }

    const slot = selectedSlot(this.inventory);
    this.player.aiming =
      Boolean(slot?.item === 'rifle') &&
      this.input.isMouseDown(2) &&
      !this.buildSystem.activeType;
    this.updateEquippedWeapon();

    const movement = this.player.updateMovement(dt, this.input, this.cameraRig);
    if (movement.landingImpact > 0) {
      this.deathCause = 'Fatal fall';
      const died = this.player.applyDamage(movement.landingImpact);
      this.cameraRig.addShake(Math.min(0.35, movement.landingImpact / 40));
      this.audio.land(movement.landingImpact);
      this.ui.damageFlash();
      if (died) {
        this.handleDeath('Fatal fall');
        return;
      }
    }
    if (movement.stepped) {
      this.audio.footstep(this.player.sprinting);
    }

    this.cameraRig.update(dt, this.player);
    this.player.updateVisuals(dt, this.elapsedTime, this.cameraRig);

    const warmth = this.world.structures.warmthAt(
      this.player.position.x,
      this.player.position.z,
    );
    const survival = this.player.updateSurvival(
      dt,
      this.clock,
      this.nightDirector.nightNumber,
      warmth.near,
    );
    if (survival.damage > 0) {
      this.deathCause = survival.cold ? 'Cold exposure' : 'Starvation';
      if (this.damageFxCooldown <= 0) {
        this.ui.damageFlash();
        this.cameraRig.addShake(0.06);
        this.damageFxCooldown = 0.8;
        if (performance.now() - this.lastHurtSound > 900) {
          this.audio.hurt();
          this.lastHurtSound = performance.now();
        }
      }
    }
    if (this.player.health <= 0) {
      this.handleDeath(this.deathCause);
      return;
    }

    if (this.buildSystem.activeType) {
      this.placement = this.buildSystem.update(
        this.camera,
        this.player.position,
        PLAYER.radius,
        this.world,
        this.world.structures,
        this.inventory,
        this.objectives.blueprints,
        12,
      );
      if (this.input.consumeMousePressed(2)) {
        this.cancelBuildMode();
        return;
      }
      if (
        this.input.isPointerLocked() &&
        this.input.consumeMousePressed(0) &&
        performance.now() > this.attackGuardUntil
      ) {
        this.placeCurrentStructure();
      }
    } else {
      this.placement = null;
      this.handleAttack();
    }

    this.updateInteraction();
    if (this.input.consumePressed('KeyE') && this.currentInteraction && !this.buildSystem.activeType) {
      this.performInteraction();
    }

    this.nightDirector.update(
      dt,
      this.clock,
      this.player.position,
      this.enemies.enemies.filter((enemy) => enemy.alive).length,
      this.player.health > 0,
      this.world.structures.getBeacon()?.group.position ?? null,
    );
    if (this.state !== 'playing') return;

    const callbacks = this.enemyCallbacks();
    this.enemies.update(
      dt,
      this.elapsedTime,
      {
        position: this.player.position,
        eye: this.player.getEyePosition(),
        flashlight: this.player.flashlightOn,
        sprinting: this.player.sprinting,
        alive: this.player.health > 0,
      },
      callbacks,
    );
    if (this.state !== 'playing') return;
    this.updateTurrets(callbacks);

    this.world.update(
      dt,
      this.clock,
      this.camera,
      this.player.position,
      this.fx,
      true,
    );
    this.audio.update(
      dt,
      nightStrength(this.clock),
      Boolean(this.world.structures.litCampfireNear(this.player.position.x, this.player.position.z, 12)),
      this.siege.active,
    );

    if (this.player.health <= 0) {
      this.handleDeath(this.deathCause);
      return;
    }

    const objective = primaryObjective(this.objectives);
    if (objective.id !== this.lastObjectiveId) {
      this.lastObjectiveId = objective.id;
      this.ui.toast(`PROTOCOL UPDATED // ${objective.title.toUpperCase()}`, 'info');
    }

    if (this.autosaveTimer >= GAME.autosaveInterval && !this.siege.active) {
      this.autosaveTimer = 0;
      this.saveGame(false);
    }
  }

  private updateTitle(dt: number): void {
    if (!this.world || !this.player) return;
    this.titleAngle += dt * 0.025;
    const radius = 26;
    this.camera.position.set(
      Math.cos(this.titleAngle) * radius,
      10.8 + Math.sin(this.titleAngle * 0.7) * 1.4,
      4 + Math.sin(this.titleAngle) * radius,
    );
    this.camera.lookAt(0, 2.8, 4.2);
    if (Math.abs(this.camera.fov - 50) > 0.01) {
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }
    this.world.update(dt, 0.805, this.camera, this.player.position, this.fx, false);
    this.player.updateVisuals(dt, this.elapsedTime, this.cameraRig);
    this.audio.update(dt, nightStrength(0.805), false, false);
  }

  private updatePassive(dt: number): void {
    if (!this.world || !this.player || !this.cameraRig) return;
    this.world.update(dt, this.clock, this.camera, this.player.position, this.fx, false);
    this.player.updateVisuals(dt, this.elapsedTime, this.cameraRig);
    const nearFire = Boolean(
      this.world.structures.litCampfireNear(this.player.position.x, this.player.position.z, 12),
    );
    this.audio.update(dt, nightStrength(this.clock), nearFire, this.siege.active);
  }

  private render(): void {
    if (!this.world) return;
    if (this.postfx.active) this.postfx.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private toggleFlashlight(): void {
    if (this.player.battery <= 0.5) {
      this.notice('LAMP CELL DEPLETED', 'warning');
      return;
    }
    const on = this.player.toggleFlashlight();
    this.audio.flashlight();
    if (!on) this.ui.toast('LAMP DISENGAGED', 'info');
  }

  private updateEquippedWeapon(): void {
    const slot = selectedSlot(this.inventory);
    const item = slot?.item ?? null;
    const weapon: HotbarItemId | null =
      item === 'blade' || item === 'rifle' ? item : null;
    if (weapon !== this.equippedItem) {
      this.equippedItem = weapon;
      this.player.setWeapon(weapon);
    }
  }

  private handleAttack(): void {
    if (!this.input.isPointerLocked() || this.input.isMouseDown(2)) return;
    if (!this.input.consumeMousePressed(0) || performance.now() < this.attackGuardUntil) return;
    const slot = selectedSlot(this.inventory);
    if (!slot) return;
    const item = ITEMS[slot.item];
    if (item.kind === 'weapon') {
      if (this.weaponCooldown > 0) return;
      if (slot.item === 'blade') {
        this.attackMelee();
      } else if (slot.item === 'rifle') {
        this.attackRifle();
      }
    } else {
      this.useSelectedConsumable();
    }
  }

  private attackMelee(): void {
    if (this.player.stamina < COMBAT.bladeStamina) {
      this.notice('INSUFFICIENT STAMINA', 'warning');
      return;
    }
    this.player.stamina = Math.max(0, this.player.stamina - COMBAT.bladeStamina);
    this.player.sinceSprint = 0;
    this.weaponCooldown = COMBAT.bladeCooldown;
    this.player.playMelee();
    this.fx.slash(this.player.position, this.player.yaw);
    this.audio.swing();
    const forward = this.cameraRig.getForwardFlat();
    const hits = this.enemies.meleeAttack(
      this.player.position,
      forward,
      COMBAT.bladeRange,
      COMBAT.bladeArc,
      COMBAT.bladeDamage,
      this.enemyCallbacks(),
    );
    if (hits > 0) {
      this.audio.hit();
      this.cameraRig.addShake(0.12);
    }
  }

  private attackRifle(): void {
    if (this.inventory.resources.energy < COMBAT.rifleEnergyCost) {
      this.notice('NO LUMEN CHARGE', 'warning');
      return;
    }
    this.inventory.resources.energy -= COMBAT.rifleEnergyCost;
    this.inventoryVersion++;
    this.weaponCooldown = COMBAT.rifleCooldown;
    this.player.playShoot();
    this.audio.shoot();
    this.cameraRig.addShake(0.1);
    this.camera.updateMatrixWorld(true);
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const obstacleDistance = this.world.raycastStatics(
      this.camera.position,
      direction,
      COMBAT.rifleRange,
      true,
    );
    const enemyHit = this.enemies.raycast(this.camera.position, direction, COMBAT.rifleRange);
    const enemyValid =
      enemyHit && (obstacleDistance === null || enemyHit.distance < obstacleDistance - 0.08);
    const muzzle = this.player.getMuzzlePosition();
    let endpoint = this.camera.position.clone().addScaledVector(direction, COMBAT.rifleRange);
    if (enemyValid && enemyHit) {
      endpoint = enemyHit.point.clone();
      const damage = COMBAT.rifleDamage * (enemyHit.critical ? COMBAT.rifleCritMultiplier : 1);
      this.enemies.damageEnemy(enemyHit.enemy, damage, enemyHit.point, this.enemyCallbacks());
      this.audio.hit();
      this.fx.impact(enemyHit.point, enemyHit.critical ? 0xff9070 : 0xffc07a);
    } else if (obstacleDistance !== null) {
      endpoint = this.camera.position.clone().addScaledVector(direction, obstacleDistance);
      this.fx.impact(endpoint, 0xffc07a);
    }
    this.fx.tracer(muzzle, endpoint, 0xd8ffbe, 0.9);
    this.fx.muzzle(muzzle, direction);
    this.updateEquippedWeapon();
  }

  private useSelectedConsumable(): void {
    if (this.useCooldown > 0) return;
    const slot = selectedSlot(this.inventory);
    if (!slot) return;
    const item = ITEMS[slot.item];
    if (item.kind !== 'consumable') return;
    if (item.id === 'medkit') {
      if (this.player.health >= PLAYER.maxHealth) {
        this.notice('INTEGRITY ALREADY FULL', 'info');
        return;
      }
      this.player.heal(45);
      this.audio.heal();
      this.ui.toast('+45 INTEGRITY', 'success');
    } else if (item.id === 'ration') {
      if (this.player.hunger >= PLAYER.maxHunger) {
        this.notice('HUNGER ALREADY FULL', 'info');
        return;
      }
      this.player.feed(45);
      this.audio.eat();
      this.ui.toast('+45 HUNGER', 'success');
    } else if (item.id === 'battery') {
      if (this.player.battery >= 100) {
        this.notice('LAMP CELL ALREADY FULL', 'info');
        return;
      }
      this.player.rechargeBattery(55);
      this.audio.flashlight();
      this.ui.toast('LAMP CELL RECHARGED', 'success');
    }
    consumeSelected(this.inventory, 1);
    this.inventoryVersion++;
    this.useCooldown = 0.55;
    this.ui.refreshTerminal();
  }

  private updateInteraction(): void {
    if (this.state !== 'playing' || this.menuOpen || this.buildSystem.activeType) {
      this.clearInteraction();
      return;
    }
    let bestDistance = Infinity;
    let nextNode: ResourceNode | null = null;
    let nextInteractable: WorldInteractable | null = null;
    let nextStructure: Structure | null = null;
    let info: InteractionInfo | null = null;

    const node = this.world.resources.nearestNode(this.player.position, 3.7);
    if (node) {
      const distance = Math.hypot(
        node.position.x - this.player.position.x,
        node.position.z - this.player.position.z,
      );
      const toolBonus =
        (node.type === 'wood' && this.inventory.tools.axe) ||
        ((node.type === 'metal' || node.type === 'energy') && this.inventory.tools.pick)
          ? 2
          : 0;
      const amount = 2 + toolBonus;
      info = {
        kind: 'node',
        key: 'E',
        label: NODE_INFO[node.type].action,
        detail: `${NODE_INFO[node.type].label.toUpperCase()} // +${amount} ${NODE_INFO[node.type].hint.toUpperCase()}`,
      };
      nextNode = node;
      bestDistance = distance;
    }

    const interactable = this.world.nearestInteractable(this.player.position, 3.7);
    if (interactable) {
      const distance = Math.hypot(
        interactable.position.x - this.player.position.x,
        interactable.position.z - this.player.position.z,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        nextNode = null;
        nextInteractable = interactable;
        if (interactable.kind === 'blueprint') {
          const blueprint = interactable.blueprint;
          info = {
            kind: 'blueprint',
            key: 'E',
            label: 'RECOVER SCHEMATIC',
            detail: blueprint ? BLUEPRINTS[blueprint].name : 'DATA CORE',
          };
        } else {
          const loot = interactable.loot;
          const detail = loot
            ? Object.entries(loot)
                .map(([id, amount]) => `${amount ?? 0} ${RESOURCES[id as ResourceId].short}`)
                .join(' · ')
            : 'SALVAGE';
          info = {
            kind: 'loot',
            key: 'E',
            label: 'SALVAGE CACHE',
            detail,
          };
        }
      }
    }

    for (const structure of this.world.structures.structures) {
      const distance = Math.hypot(
        structure.x - this.player.position.x,
        structure.z - this.player.position.z,
      );
      if (structure.type === 'campfire' && distance < 3.3 && structure.fuel < 345) {
        if (distance < bestDistance) {
          bestDistance = distance;
          nextNode = null;
          nextInteractable = null;
          nextStructure = structure;
          info = {
            kind: 'campfire',
            key: 'E',
            label: 'REFUEL CAMPFIRE',
            detail: `BURN ${Math.ceil(structure.fuel)}s // 1 TIMBER`,
          };
        }
      } else if (structure.type === 'turret' && distance < 3.3 && structure.charge < 99) {
        if (distance < bestDistance) {
          bestDistance = distance;
          nextNode = null;
          nextInteractable = null;
          nextStructure = structure;
          info = {
            kind: 'turret',
            key: 'E',
            label: 'RECHARGE TURRET',
            detail: `${Math.round(structure.charge)}% // 5 LUMEN`,
          };
        }
      } else if (
        structure.type === 'beacon' &&
        distance < 4.8 &&
        !structure.active &&
        !this.nightDirector.inSiege
      ) {
        if (distance < bestDistance) {
          bestDistance = distance;
          nextNode = null;
          nextInteractable = null;
          nextStructure = structure;
          info = {
            kind: 'beacon',
            key: 'E',
            label: 'ACTIVATE BEACON',
            detail: 'BEGIN EXTRACTION UPLINK',
          };
        }
      }
    }

    this.interactionNode = nextNode;
    this.interactionInteractable = nextInteractable;
    this.interactionStructure = nextStructure;
    this.currentInteraction = info;
    this.world.resources.setHighlight(nextNode);
  }

  private clearInteraction(): void {
    this.currentInteraction = null;
    this.interactionNode = null;
    this.interactionInteractable = null;
    this.interactionStructure = null;
    this.world?.resources.setHighlight(null);
  }

  private performInteraction(): void {
    if (this.interactionNode) {
      const node = this.interactionNode;
      const result = this.world.resources.harvest(
        node,
        this.inventory.tools.axe,
        this.inventory.tools.pick,
      );
      addResource(this.inventory, result.resource, result.amount);
      this.stats.resourcesGathered += result.amount;
      this.addObjectiveResource(result.resource, result.amount);
      this.inventoryVersion++;
      this.audio.gather();
      this.fx.gather(node.position, NODE_INFO[result.resource].color);
      this.ui.toast(`+${result.amount} ${RESOURCES[result.resource].short}`, 'success');
      this.ui.refreshTerminal();
      this.clearInteraction();
      return;
    }
    if (this.interactionInteractable) {
      const interactable = this.interactionInteractable;
      if (interactable.kind === 'blueprint' && interactable.blueprint) {
        const blueprint = interactable.blueprint;
        if (!this.objectives.blueprints.includes(blueprint)) {
          this.objectives.blueprints.push(blueprint);
          this.stats.resourcesGathered += 0;
          this.ui.showDiscovery(
            BLUEPRINTS[blueprint].name,
            BLUEPRINTS[blueprint].site,
            BLUEPRINTS[blueprint].description,
            'blueprint',
          );
          this.ui.toast('SCHEMATIC ADDED TO FIELD TERMINAL', 'success');
          this.audio.craft();
        }
      } else if (interactable.kind === 'loot' && interactable.loot) {
        let total = 0;
        for (const id of Object.keys(interactable.loot) as ResourceId[]) {
          const amount = interactable.loot[id] ?? 0;
          addResource(this.inventory, id, amount);
          this.addObjectiveResource(id, amount);
          total += amount;
        }
        this.stats.resourcesGathered += total;
        this.inventoryVersion++;
        this.ui.toast(`CACHE RECOVERED // ${total} UNITS`, 'success');
        this.audio.pickup();
        this.fx.burst(interactable.position, 0xffc06b, 16, {
          speed: 2.5,
          life: 0.7,
          size: 0.08,
          gravity: -2,
        });
      }
      this.world.takeInteractable(interactable);
      this.ui.refreshTerminal();
      this.clearInteraction();
      return;
    }
    if (this.interactionStructure) {
      const structure = this.interactionStructure;
      if (structure.type === 'campfire') {
        if (this.inventory.resources.wood < 1) {
          this.notice('NO TIMBER FOR THE FIRE', 'warning');
          return;
        }
        this.inventory.resources.wood -= 1;
        this.inventoryVersion++;
        this.world.structures.addFuel(structure, 60);
        this.audio.fireAdd();
        this.ui.toast('CAMPFIRE FUEL +60s', 'success');
      } else if (structure.type === 'turret') {
        if (this.inventory.resources.energy < 5) {
          this.notice('NEED 5 LUMEN TO RECHARGE', 'warning');
          return;
        }
        this.inventory.resources.energy -= 5;
        this.inventoryVersion++;
        this.world.structures.rechargeTurret(structure, 50);
        this.audio.flashlight();
        this.ui.toast('TURRET CHARGE +50%', 'success');
      } else if (structure.type === 'beacon') {
        this.activateBeacon(structure);
      }
      this.ui.refreshTerminal();
      this.clearInteraction();
    }
  }

  private activateBeacon(structure: Structure): void {
    if (this.nightDirector.inSiege || structure.active) return;
    if (!isNight(this.clock)) this.clock = 0.80;
    this.objectives.beaconActivated = true;
    this.markBeaconPlaced();
    this.world.structures.activateBeacon(structure);
    this.nightDirector.startSiege(this.player.position);
    this.clearInteraction();
  }

  private markBeaconPlaced(): void {
    this.objectives.beaconPlaced = true;
  }

  private addObjectiveResource(id: ResourceId, amount: number): void {
    if (id === 'wood') this.objectives.woodGathered += amount;
    if (id === 'metal') this.objectives.metalGathered += amount;
    if (id === 'energy') this.objectives.energyGathered += amount;
    if (id === 'food') this.objectives.foodGathered += amount;
  }

  private placeCurrentStructure(): void {
    const placement = this.placement;
    if (!placement) return;
    if (!placement.valid) {
      this.notice(placement.reason?.toUpperCase() ?? 'INVALID PLACEMENT', 'warning');
      return;
    }
    const def = BUILDS[placement.type];
    const state = evaluateBuild(
      def,
      this.inventory,
      this.objectives.blueprints,
      this.world.structures.countOf(placement.type),
    );
    if (!state.ok) {
      this.notice(state.reason ?? 'CONSTRUCTION UNAVAILABLE', 'warning');
      return;
    }
    if (!payCost(def.cost, this.inventory.resources)) return;
    const structure = this.world.structures.create(
      placement.type,
      placement.x,
      placement.z,
      placement.rotation,
    );
    this.stats.structuresBuilt += 1;
    this.inventoryVersion++;
    this.audio.build();
    this.fx.burst(
      new THREE.Vector3(structure.x, structure.y + 0.5, structure.z),
      0x8fffdc,
      20,
      { speed: 2.4, life: 0.7, size: 0.1, gravity: -3 },
    );
    if (placement.type === 'campfire') this.objectives.builtCampfire = true;
    if (placement.type === 'shelter') this.objectives.builtShelter = true;
    if (placement.type === 'turret') this.objectives.builtTurret = true;
    if (placement.type === 'beacon') {
      this.objectives.beaconPlaced = true;
      this.ui.showBanner('BEACON DEPLOYED', 'RETURN TO THE PAD AND INITIATE THE UPLINK');
    }
    this.ui.toast(`${def.name.toUpperCase()} DEPLOYED`, 'success');
    const keepBuilding =
      (placement.type === 'wall' || placement.type === 'campfire' || placement.type === 'turret') &&
      this.buildState(placement.type).ok;
    if (!keepBuilding) {
      this.cancelBuildMode(true);
      this.input.requestPointerLock();
    }
    this.placement = null;
    this.autosaveTimer = Math.max(this.autosaveTimer, GAME.autosaveInterval - 6);
  }

  private enemyCallbacks(): EnemyCallbacks {
    return {
      damagePlayer: (amount, enemy) => this.damagePlayer(amount, enemy),
      damageStructure: (structure, amount, enemy) => {
        const destroyed = this.world.structures.damage(structure, amount, this.fx);
        if (destroyed) {
          this.audio.build();
          this.ui.toast('A STRUCTURE WAS DESTROYED', 'danger');
        }
        void enemy;
      },
      onKill: (enemy) => {
        this.stats.kills += 1;
        this.audio.enemyDie();
        void enemy;
      },
      onGrowl: (enemy) => {
        if (performance.now() < this.growlCooldown) return;
        this.growlCooldown = performance.now() + 1200 + Math.random() * 1600;
        this.audio.growl(enemy.type);
      },
    };
  }

  private damagePlayer(amount: number, enemy: Enemy): void {
    if (this.state !== 'playing') return;
    this.deathCause =
      enemy.type === 'warden'
        ? 'Killed by the Warden'
        : `Killed by a ${enemy.type}`;
    const died = this.player.applyDamage(amount);
    this.ui.damageFlash();
    this.cameraRig.addShake(0.22);
    this.audio.hurt();
    this.fx.burst(
      new THREE.Vector3(this.player.position.x, this.player.position.y + 1.2, this.player.position.z),
      0xff7d58,
      10,
      { speed: 1.8, life: 0.35, size: 0.07, gravity: -3 },
    );
    if (died) this.handleDeath(this.deathCause);
  }

  private updateTurrets(callbacks: EnemyCallbacks): void {
    for (const turret of this.world.structures.getTurrets()) {
      if (turret.turretTimer > 0) continue;
      let target: Enemy | null = null;
      let bestDistance = 25;
      const origin = new THREE.Vector3(turret.x, turret.y + 1.55, turret.z);
      for (const enemy of this.enemies.enemies) {
        if (!enemy.alive) continue;
        const distance = enemy.position.distanceTo(turret.group.position);
        if (distance > bestDistance) continue;
        if (!this.world.hasLineOfSight(origin, enemy.eyePosition)) continue;
        target = enemy;
        bestDistance = distance;
      }
      if (!target) continue;
      if (this.world.structures.fireTurret(turret, target.eyePosition, this.fx)) {
        turret.turretTimer = 0.52;
        this.enemies.damageEnemy(target, 14, target.eyePosition, callbacks);
        if (performance.now() > this.turretSoundCooldown) {
          this.turretSoundCooldown = performance.now() + 140;
          this.audio.turretFire();
        }
      }
    }
  }

  private findSpawnPoint(minDistance: number, maxDistance: number): THREE.Vector3 | null {
    if (!this.player) return null;
    for (let attempt = 0; attempt < 28; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = minDistance + Math.random() * (maxDistance - minDistance);
      const x = this.player.position.x + Math.cos(angle) * distance;
      const z = this.player.position.z + Math.sin(angle) * distance;
      if (Math.hypot(x, z) > 88) continue;
      if (this.world.terrain.slopeAt(x, z) > 0.35) continue;
      if (!this.world.isAreaFree(x, z, 0.9)) continue;
      return new THREE.Vector3(x, this.world.groundHeight(x, z), z);
    }
    return null;
  }

  private notice(message: string, kind: 'info' | 'success' | 'warning' | 'danger' = 'info'): void {
    if (this.noticeCooldown > 0) return;
    this.noticeCooldown = 0.8;
    this.ui.toast(message, kind);
  }

  private getRecipe(recipeId: string) {
    return [...RECIPES].find((recipe) => recipe.id === recipeId) ?? null;
  }

  private installDebugApi(): void {
    const api = {
      getState: () => ({
        state: this.state,
        seed: this.seed,
        day: this.day,
        clock: this.clock,
        night: this.nightDirector.nightNumber,
        player: {
          x: Math.round(this.player.position.x * 100) / 100,
          y: Math.round(this.player.position.y * 100) / 100,
          z: Math.round(this.player.position.z * 100) / 100,
          health: Math.round(this.player.health),
          hunger: Math.round(this.player.hunger),
        },
        enemies: this.enemies.enemies.filter((enemy) => enemy.alive).length,
        structures: this.world.structures.structures.length,
        pointerLocked: this.input.isPointerLocked(),
      }),
      setTime: (clock: number) => {
        if (!this.world) return;
        this.clock = Math.max(0, Math.min(0.999, clock));
        this.nightDirector.syncClock(this.clock);
      },
      enterNight: () => {
        if (!this.world) return;
        this.clock = 0.86;
        this.nightDirector.syncClock(this.clock);
        this.spawnWave(4);
      },
      spawnWave: (count = 4) => {
        this.spawnWave(count);
      },
      spawnWaveAt: (count: number, distance: number) => {
        this.spawnWave(count, distance);
      },
      giveResources: (resources: Partial<Record<ResourceId, number>>) => {
        for (const id of Object.keys(resources) as ResourceId[]) {
          addResource(this.inventory, id, resources[id] ?? 0);
        }
        this.inventoryVersion++;
        this.ui.refreshTerminal();
        this.ui.updateHud();
      },
      teleport: (x: number, z: number) => {
        this.player.setPosition(new THREE.Vector3(x, this.world.groundHeight(x, z), z));
        this.cameraRig.reset();
      },
      openTerminal: (tab: TerminalTab) => {
        if (this.state !== 'playing') return;
        if (!this.menuOpen) this.openTerminal(tab);
        else this.ui.openTerminal(tab);
      },
      closeTerminal: () => this.closeTerminal(),
      startBuild: (type: BuildType) => this.beginBuild(type),
      save: () => this.saveGame(true),
      setQuality: (quality: QualityLevel) => {
        this.settings.quality = quality;
        this.applySettings(this.settings);
      },
    };
    (window as unknown as { __OUTPOST__?: typeof api }).__OUTPOST__ = api;
  }

  private spawnWave(count: number, distance = 13): void {
    if (!this.world || !this.player) return;
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.4;
      const radius = distance + Math.random() * 5;
      const x = this.player.position.x + Math.cos(angle) * radius;
      const z = this.player.position.z + Math.sin(angle) * radius;
      const y = this.world.groundHeight(x, z);
      const type = chooseEnemyType(3, Math.random());
      this.enemies.spawn(type, new THREE.Vector3(x, y, z), Math.max(1, this.nightDirector.nightNumber));
    }
    this.ui.toast('DEBUG WAVE MATERIALIZED', 'info');
  }
}
