import * as THREE from 'three';
import type { Game, InteractionInfo, SiegeState, TerminalTab } from '../game/Game';
import {
  BLUEPRINTS,
  BUILDS,
  ITEMS,
  RECIPES,
  RESOURCES,
  RESOURCE_ORDER,
  TOOLS,
  canAfford,
  type BlueprintId,
  type BuildType,
  type IconId,
  type RecipeDefinition,
  type ResourceId,
} from '../game/data';
import { formatClock, isNight, phaseLabel, secondsUntilDawn, secondsUntilDusk } from '../game/daynight';
import { primaryObjective } from '../game/objectives';
import type { World } from '../world/World';
import { fbm2D } from '../core/noise';
import { icon, type IconName } from './icons';

const TIPS = [
  'Night temperature will kill you faster than the creatures. Keep a fire alive.',
  'Lumen charge is ammunition. Every pulse rifle shot spends a piece of your future.',
  'A salvage axe doubles timber yield. Build it before your first night.',
  'The beacon schematic is in the relay wreck, south of the basin.',
  'Creatures are drawn to bright light. A flashlight buys sight, not safety.',
  'Barricades do not stop a brute for long. Layer them, and keep a fallback.',
  'Cooked rations restore far more hunger than raw biomass.',
  'A shelter core becomes your respawn point. Place it on flat ground.',
  'The final uplink only advances while you are close to the beacon.',
  'Listen. The wind drops before something comes through the treeline.',
  'Crystals regrow. Scrap regrows. Trees regrow. You do not.',
];

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0');
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${pad(minutes, 2)}:${pad(remaining)}`;
}

function formatRunTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  return `${minutes}m ${pad(total % 60)}s`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function costMarkup(
  cost: Partial<Record<ResourceId, number>>,
  inventoryResources: Record<ResourceId, number>,
  compact = false,
): string {
  return RESOURCE_ORDER.filter((id) => (cost[id] ?? 0) > 0)
    .map((id) => {
      const need = cost[id] ?? 0;
      const have = inventoryResources[id] ?? 0;
      const enough = have >= need;
      return `<span class="cost-chip ${enough ? 'is-met' : 'is-missing'} ${compact ? 'is-compact' : ''}">
        ${icon(RESOURCES[id].icon, 'cost-icon')}
        <strong>${need}</strong><small>${compact ? RESOURCES[id].short : `${have}/${need}`}</small>
      </span>`;
    })
    .join('');
}

function slotMarkup(
  content: string,
  options: { key?: string; qty?: number; selected?: boolean; empty?: boolean; action?: string; value?: string } = {},
): string {
  const classes = ['hotbar-slot', options.selected ? 'is-selected' : '', options.empty ? 'is-empty' : '']
    .filter(Boolean)
    .join(' ');
  const action = options.action ? `data-action="${options.action}"` : '';
  const value = options.value !== undefined ? `data-value="${options.value}"` : '';
  return `<button class="${classes}" ${action} ${value} type="button">
    ${options.key ? `<span class="slot-key">${options.key}</span>` : ''}
    <span class="slot-glyph">${content}</span>
    ${options.qty && options.qty > 1 ? `<span class="slot-qty">${options.qty}</span>` : ''}
  </button>`;
}

export class UI {
  readonly root: HTMLElement;
  private readonly game: Game;
  private currentTab: TerminalTab = 'inventory';
  private settingsOpen = false;
  private helpOpen = false;
  private readonly cache = new Map<string, HTMLElement>();
  private readonly textCache = new Map<string, string>();
  private readonly widthCache = new Map<string, string>();
  private hotbarSignature = '';
  private statusSignature = '';
  private objectiveSignature = '';
  private minimapBase: HTMLCanvasElement | null = null;
  private minimapWorld: World | null = null;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapContext: CanvasRenderingContext2D | null = null;
  private minimapTimestamp = 0;
  private bannerTimer = 0;
  private discoveryTimer = 0;
  private damageTimer = 0;
  private loadingTipIndex = 0;
  private loadingTipTimer = 0;
  private readonly enemyBars = new Map<string, HTMLElement>();
  private lastFrameProjection = 0;

  constructor(game: Game) {
    this.game = game;
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) throw new Error('Missing #app');
    app.insertAdjacentHTML('beforeend', this.template());
    this.root = this.get('ui-root');
    this.minimapCanvas = this.get<HTMLCanvasElement>('minimap');
    this.minimapContext = this.minimapCanvas.getContext('2d');
    this.bindEvents();
    this.bindSettings();
    this.startLoadingTips();
  }

  private template(): string {
    const hotbarKeys = ['1', '2', '3', '4', '5', '6'];
    const resourceChips = RESOURCE_ORDER.map(
      (id) => `<div class="resource-chip" title="${RESOURCES[id].name}">
        <span class="resource-icon" style="--resource-color:${RESOURCES[id].color}">${icon(RESOURCES[id].icon)}</span>
        <span class="resource-count" id="hud-resource-${id}">0</span>
      </div>`,
    ).join('');
    return `
      <div id="ui-root">
        <div id="loading-screen" class="ui-screen is-visible">
          <div class="loading-noise"></div>
          <div class="loading-shell">
            <div class="loading-kicker">DEEP RANGE SURVIVAL PROTOCOL // LINK ${pad(0, 4)}</div>
            <div class="loading-logo">OUTPOST <em>ZERO</em></div>
            <div class="loading-signal"><span></span><span></span><span></span><span></span><span></span></div>
            <div class="loading-status" id="loading-status">INITIALIZING SUIT LINK</div>
            <div class="loading-track"><i id="loading-bar"></i></div>
            <div class="loading-meta"><span id="loading-percent">0%</span><span>ESTABLISHING LOCAL UPLINK</span></div>
            <p class="loading-tip" id="loading-tip">${TIPS[0]}</p>
          </div>
          <div class="loading-corner top-left">DEEP RANGE // 04</div>
          <div class="loading-corner bottom-right">BUILD 1.0.0</div>
        </div>

        <div id="title-screen" class="ui-screen">
          <div class="title-ambient"></div>
          <div class="title-topline">
            <span><i class="status-dot"></i> DEEP RANGE // SURVIVAL PROTOCOL</span>
            <span>LAST TRANSMISSION RECOVERED</span>
          </div>
          <main class="title-copy">
            <div class="eyebrow"><span></span> OUTPOST ZERO // FINAL LOG</div>
            <h1>OUTPOST<br><em>ZERO</em></h1>
            <p class="lede">The station is dead. The planet is not.<br>Scavenge, build shelter, and make it through the night.</p>
            <div class="title-actions">
              <button id="btn-new-game" class="btn btn-primary" data-action="new-game" type="button">
                <span>NEW EXPEDITION</span><span class="btn-arrow">${icon('arrow')}</span>
              </button>
              <button id="btn-continue" class="btn btn-ghost" data-action="continue" type="button">
                CONTINUE EXPEDITION <small id="continue-sub">NO CHECKPOINT</small>
              </button>
            </div>
            <div class="title-subactions">
              <button class="text-btn" type="button" data-action="settings" data-context="title">SETTINGS</button>
              <span></span>
              <button class="text-btn" type="button" data-action="help" data-context="title">FIELD MANUAL</button>
            </div>
            <div class="title-meta">
              <span>PROCEDURAL BASIN</span><span>NIGHTFALL SURVIVAL</span><span>PERSISTENT CHECKPOINTS</span>
            </div>
          </main>
          <footer class="title-footer">
            <span id="title-seed">SEED // UNKNOWN</span>
            <span>WASD MOVE&nbsp;&nbsp;·&nbsp;&nbsp;E INTERACT&nbsp;&nbsp;·&nbsp;&nbsp;TAB FIELD KIT</span>
            <span>BUILD 1.0.0</span>
          </footer>
          <div class="scanlines"></div>
        </div>

        <div id="hud" class="hud">
          <div class="hud-film"></div>
          <div class="damage-flash" id="damage-flash"></div>
          <div class="low-health" id="low-health"></div>

          <section class="hud-top-left">
            <div class="hud-brand"><span class="status-dot"></span> OUTPOST ZERO <em>// SUIT LINK 04</em></div>
            <div class="vitals panel">
              <div class="vital">
                <div class="vital-line"><span>${icon('heart')} INTEGRITY</span><strong id="health-value">100</strong></div>
                <div class="bar health"><i id="health-bar"></i><span class="bar-ticks"></span></div>
              </div>
              <div class="vital">
                <div class="vital-line"><span>${icon('drop')} HUNGER</span><strong id="hunger-value">100</strong></div>
                <div class="bar hunger"><i id="hunger-bar"></i><span class="bar-ticks"></span></div>
              </div>
              <div class="vital">
                <div class="vital-line"><span>${icon('bolt')} STAMINA</span><strong id="stamina-value">100</strong></div>
                <div class="bar stamina"><i id="stamina-bar"></i><span class="bar-ticks"></span></div>
              </div>
              <div class="vital vital-lamp">
                <div class="vital-line"><span>LAMP CELL</span><strong id="battery-value">100%</strong></div>
                <div class="bar battery"><i id="battery-bar"></i></div>
              </div>
            </div>
            <div class="status-chips" id="status-chips"></div>
          </section>

          <section class="hud-top-center">
            <div class="clock-card panel">
              <div class="clock-head"><span id="clock-day">DAY 01</span><span id="clock-phase">DAYLIGHT</span></div>
              <div class="clock-body"><strong id="clock-time">08:42</strong><span id="cycle-icon">${icon('sun')}</span></div>
              <div class="cycle-track"><i id="cycle-fill"></i><span class="cycle-dawn"></span><span class="cycle-dusk"></span></div>
              <div class="clock-note" id="night-note">DUSK IN 03:51</div>
            </div>
          </section>

          <section class="hud-top-right">
            <div class="minimap-shell">
              <div class="minimap-head"><span>BASIN SCAN</span><span id="minimap-coords">000 · 000</span></div>
              <div class="minimap-frame">
                <canvas id="minimap" width="320" height="320"></canvas>
                <div class="minimap-grid"></div>
                <div class="minimap-sweep"></div>
                <div class="minimap-north">N</div>
                <div class="minimap-vignette"></div>
              </div>
              <div class="minimap-legend"><span><i class="dot player"></i>YOU</span><span><i class="dot hostile"></i>HOSTILE</span><span><i class="dot poi"></i>WRECK</span></div>
            </div>
            <div class="objective-card panel" id="objective-card">
              <div class="objective-top"><span>SURVIVAL PROTOCOL</span><span id="objective-index">01</span></div>
              <h3 id="objective-title">Gather xeno timber</h3>
              <p id="objective-desc">Harvest the pale trees surrounding the crash site.</p>
              <div class="objective-progress" id="objective-progress-wrap">
                <div class="objective-track"><i id="objective-bar"></i></div>
                <span id="objective-progress">0 / 8</span>
              </div>
              <div class="objective-hint"><span>${icon('info')}</span><span id="objective-hint">Look for trees nearby. Press E to harvest.</span></div>
              <div class="objective-meta"><span id="objective-nights">NIGHTS SURVIVED 00</span><span id="objective-blueprints">SCHEMATICS 0/3</span></div>
            </div>
          </section>

          <div class="crosshair" id="crosshair">
            <span class="crosshair-line top"></span><span class="crosshair-line right"></span>
            <span class="crosshair-line bottom"></span><span class="crosshair-line left"></span>
            <span class="crosshair-dot"></span>
          </div>
          <div class="weapon-readout" id="weapon-readout">ARC CUTTER // READY</div>

          <div class="interaction-prompt" id="interaction-prompt">
            <span class="keycap" id="interaction-key">E</span>
            <span class="interaction-copy"><strong id="interaction-label">HARVEST</strong><small id="interaction-detail">XENO TREE</small></span>
            <span class="interaction-decoration"></span>
          </div>

          <div class="siege-hud" id="siege-hud">
            <div class="siege-head"><span>ORBITAL UPLINK</span><strong id="siege-percent">0%</strong></div>
            <div class="siege-track"><i id="siege-bar"></i></div>
            <div class="siege-note" id="siege-note">MAINTAIN POSITION INSIDE THE PAD</div>
          </div>

          <div class="build-hud" id="build-hud">
            <div class="build-head"><span>CONSTRUCTION MODE</span><strong id="build-name">BARRICADE</strong></div>
            <div class="build-note" id="build-status">PLACEMENT READY</div>
            <div class="build-controls"><span>[LMB] PLACE</span><span>[R] ROTATE</span><span>[ESC] CANCEL</span></div>
          </div>

          <div class="hud-bottom">
            <div class="controls-hint"><span>WASD</span> MOVE <span>SHIFT</span> SPRINT <span>E</span> INTERACT <span>F</span> LAMP</div>
            <div class="hotbar" id="hotbar">
              ${hotbarKeys.map((key) => slotMarkup('', { key, empty: true })).join('')}
            </div>
            <div class="resource-strip">${resourceChips}</div>
          </div>

          <div class="pointer-hint" id="pointer-hint"><span class="mouse-glyph">+</span> CLICK TO CAPTURE MOUSE <small>ESC RELEASES</small></div>
          <div class="fps-readout" id="fps-readout">60 FPS</div>
          <div class="enemy-bars" id="enemy-bars"></div>
        </div>

        <div id="terminal-screen" class="ui-screen terminal-screen">
          <div class="terminal-backdrop"></div>
          <div class="terminal-shell">
            <header class="terminal-header">
              <div class="terminal-title"><span class="terminal-kicker">DEEP RANGE // FIELD SYSTEM</span><h2>FIELD TERMINAL</h2></div>
              <div class="terminal-status"><i class="status-dot"></i> LOCAL LINK <span>//</span> SUIT 04</div>
              <button class="icon-btn" data-action="terminal-close" type="button" aria-label="Close field terminal">${icon('close')}</button>
            </header>
            <nav class="terminal-tabs">
              <button data-action="terminal-tab" data-tab="inventory" data-testid="tab-inventory" type="button"><span>01</span> ${icon('menu')} INVENTORY</button>
              <button data-action="terminal-tab" data-tab="crafting" data-testid="tab-crafting" type="button"><span>02</span> ${icon('spark')} CRAFTING</button>
              <button data-action="terminal-tab" data-tab="build" data-testid="tab-build" type="button"><span>03</span> ${icon('shield')} CONSTRUCTION</button>
              <div class="terminal-tab-line"></div>
              <button class="terminal-close-text" data-action="terminal-close" type="button">[TAB] CLOSE</button>
            </nav>
            <div class="terminal-content" id="terminal-content"></div>
            <footer class="terminal-footer">
              <span>RESOURCE LINK <i class="status-dot"></i> STABLE</span>
              <span>SELECT WITH MOUSE · USE WITH CLICK · ESC OPENS SYSTEM MENU</span>
              <span>OZ-FS // 1.0</span>
            </footer>
          </div>
        </div>

        <div id="pause-screen" class="ui-screen pause-screen">
          <div class="pause-backdrop"></div>
          <div class="pause-shell">
            <div class="pause-head"><span class="eyebrow"><span></span> SYSTEM HOLD</span><h2>PAUSED</h2><p>SUIT LINK STANDBY // ENVIRONMENT SIMULATION FROZEN</p></div>
            <div class="pause-body">
              <div class="pause-menu">
                <button class="pause-item" data-action="resume" type="button"><span>01</span> RESUME SUIT LINK ${icon('arrow')}</button>
                <button class="pause-item" id="pause-save" data-action="save" type="button"><span>02</span> SAVE CHECKPOINT ${icon('save')}</button>
                <button class="pause-item" id="pause-load" data-action="load" type="button"><span>03</span> LOAD CHECKPOINT</button>
                <button class="pause-item" data-action="settings" data-context="pause" type="button"><span>04</span> SETTINGS ${icon('menu')}</button>
                <button class="pause-item" data-action="help" data-context="pause" type="button"><span>05</span> FIELD MANUAL</button>
                <button class="pause-item is-danger" data-action="quit" type="button"><span>06</span> ABANDON EXPEDITION ${icon('close')}</button>
              </div>
              <aside class="pause-telemetry">
                <span>RUN TELEMETRY</span>
                <dl>
                  <div><dt>DAY</dt><dd id="pause-day">01</dd></div>
                  <div><dt>NIGHTS SURVIVED</dt><dd id="pause-nights">00</dd></div>
                  <div><dt>HOSTILES DOWN</dt><dd id="pause-kills">00</dd></div>
                  <div><dt>FIELD TIME</dt><dd id="pause-time">00m 00s</dd></div>
                </dl>
                <p>THE BASIN DOES NOT STOP FOR YOU. NEITHER DOES THE COLD.</p>
              </aside>
            </div>
          </div>
        </div>

        <div id="settings-screen" class="ui-screen settings-screen">
          <div class="settings-backdrop"></div>
          <div class="settings-shell">
            <header><div><span class="eyebrow"><span></span> TERMINAL CONFIG</span><h2>SETTINGS</h2></div><button class="icon-btn" data-action="settings-close" aria-label="Close settings" type="button">${icon('close')}</button></header>
            <div class="settings-body">
              <section>
                <h3>DISPLAY</h3>
                <label class="field"><span>QUALITY PRESET</span><select id="setting-quality" data-setting="quality"><option value="low">LOW // PERFORMANCE</option><option value="medium">MEDIUM // BALANCED</option><option value="high">HIGH // CINEMATIC</option></select></label>
                <label class="field"><span>MOUSE SENSITIVITY <em id="setting-sensitivity-value">1.00</em></span><input id="setting-sensitivity" data-setting="sensitivity" type="range" min="0.35" max="2.2" step="0.05" /></label>
                <label class="check-field"><input id="setting-fps" data-setting="showFps" type="checkbox" /><span class="check-box"></span><span>SHOW PERFORMANCE COUNTER</span></label>
              </section>
              <section>
                <h3>AUDIO MIX</h3>
                <label class="field"><span>MASTER <em id="setting-master-value">80%</em></span><input id="setting-master" data-setting="master" type="range" min="0" max="1" step="0.01" /></label>
                <label class="field"><span>SCORE <em id="setting-music-value">50%</em></span><input id="setting-music" data-setting="music" type="range" min="0" max="1" step="0.01" /></label>
                <label class="field"><span>EFFECTS <em id="setting-sfx-value">80%</em></span><input id="setting-sfx" data-setting="sfx" type="range" min="0" max="1" step="0.01" /></label>
                <p class="settings-note">Audio is synthesized in real time. No external files are streamed.</p>
              </section>
              <section class="settings-controls">
                <h3>FIELD CONTROLS</h3>
                <div class="key-grid">
                  <span><kbd>W A S D</kbd> MOVE</span><span><kbd>SHIFT</kbd> SPRINT</span>
                  <span><kbd>SPACE</kbd> JUMP</span><span><kbd>E</kbd> INTERACT / USE</span>
                  <span><kbd>LMB</kbd> ATTACK / PLACE</span><span><kbd>RMB</kbd> AIM / CANCEL PLACE</span>
                  <span><kbd>TAB</kbd> INVENTORY</span><span><kbd>C</kbd> CRAFTING</span>
                  <span><kbd>B</kbd> CONSTRUCTION</span><span><kbd>F</kbd> FLASHLIGHT</span>
                  <span><kbd>1—6</kbd> HOTBAR</span><span><kbd>ESC</kbd> SYSTEM HOLD</span>
                </div>
              </section>
            </div>
            <footer><button class="text-btn" data-action="settings-reset" type="button">RESTORE DEFAULTS</button><button class="btn btn-primary btn-small" data-action="settings-close" type="button">CLOSE CONFIG <span>${icon('arrow')}</span></button></footer>
          </div>
        </div>

        <div id="help-screen" class="ui-screen help-screen">
          <div class="settings-backdrop"></div>
          <div class="help-shell">
            <header><div><span class="eyebrow"><span></span> SURVIVAL PROTOCOL</span><h2>FIELD MANUAL</h2></div><button class="icon-btn" data-action="help-close" aria-label="Close field manual" type="button">${icon('close')}</button></header>
            <div class="help-body">
              <article><span class="manual-index">01</span><h3>STAY WARM</h3><p>Deep night cold will drain suit integrity when you are away from firelight. Build a campfire early, then a shelter core. Refuel fires with timber.</p></article>
              <article><span class="manual-index">02</span><h3>READ THE GROUND</h3><p>Timber grows in the fungal groves. Lumen crystals emerge from the ridges. Alloy scrap sits near the wrecks. Food pods grow in damp lowlands.</p></article>
              <article><span class="manual-index">03</span><h3>RECOVER SCHEMATICS</h3><p>Three wreck sites hold data cores. The Survey Wreck unlocks the pulse rifle, the Freighter the Tesla turret, and the Relay the signal beacon.</p></article>
              <article><span class="manual-index">04</span><h3>BUILD SMART</h3><p>Walls block creatures; brutes break them. Aim for chokepoints. A turret consumes charge but can cover a flank while you fall back.</p></article>
              <article><span class="manual-index">05</span><h3>GET HOME</h3><p>Craft and place the signal beacon on the outpost pad. Activate it, then stay inside the uplink radius until rescue locks on.</p></article>
            </div>
            <footer><span>DEEP RANGE RESEARCH // LAST EMPLOYEE HANDBOOK</span><button class="btn btn-primary btn-small" data-action="help-close" type="button">CLOSE MANUAL <span>${icon('arrow')}</span></button></footer>
          </div>
        </div>

        <div id="death-screen" class="ui-screen end-screen death-screen">
          <div class="end-backdrop"></div>
          <div class="end-content">
            <span class="end-kicker">SUIT LINK TERMINATED</span>
            <h2>SIGNAL <em>LOST</em></h2>
            <p class="end-cause" id="death-cause">Cold exposure</p>
            <div class="end-stats">
              <div><span>DAYS SURVIVED</span><strong id="death-days">01</strong></div>
              <div><span>NIGHTS SURVIVED</span><strong id="death-nights">00</strong></div>
              <div><span>HOSTILES DOWN</span><strong id="death-kills">00</strong></div>
              <div><span>FIELD TIME</span><strong id="death-time">00m</strong></div>
            </div>
            <div class="end-actions">
              <button class="btn btn-primary" data-action="respawn" type="button">WAKE AT NEXT DAWN <span>${icon('arrow')}</span></button>
              <button class="btn btn-ghost" id="death-load" data-action="load" type="button">LOAD CHECKPOINT</button>
              <button class="text-btn" data-action="quit" type="button">ABANDON EXPEDITION</button>
            </div>
            <p class="end-note">Emergency recovery costs 30% of carried resources. Your shelter becomes the respawn point.</p>
          </div>
        </div>

        <div id="victory-screen" class="ui-screen end-screen victory-screen">
          <div class="end-backdrop"></div>
          <div class="end-content">
            <span class="end-kicker">ORBITAL EXTRACTION // LOCK ACQUIRED</span>
            <h2>YOU'RE <em>LEAVING</em></h2>
            <p class="end-cause">The carrier has broken atmosphere. Outpost Zero is silent behind you.</p>
            <div class="end-stats">
              <div><span>DAYS</span><strong id="victory-days">01</strong></div>
              <div><span>NIGHTS</span><strong id="victory-nights">00</strong></div>
              <div><span>HOSTILES</span><strong id="victory-kills">00</strong></div>
              <div><span>STRUCTURES</span><strong id="victory-structures">00</strong></div>
              <div><span>FIELD TIME</span><strong id="victory-time">00m</strong></div>
            </div>
            <div class="end-actions">
              <button class="btn btn-primary" data-action="new-game" type="button">NEW EXPEDITION <span>${icon('arrow')}</span></button>
              <button class="btn btn-ghost" data-action="quit" type="button">RETURN TO TITLE</button>
            </div>
          </div>
        </div>

        <div id="discovery-overlay" class="discovery-overlay">
          <div class="discovery-line"></div>
          <div class="discovery-icon" id="discovery-icon">${icon('blueprint')}</div>
          <div><span>SCHEMATIC RECOVERED</span><h3 id="discovery-title">PULSE RIFLE SCHEMATIC</h3><p id="discovery-desc">Unlocks the pulse rifle at the field terminal.</p></div>
        </div>

        <div class="toast-stack" id="toast-stack"></div>

        <div id="area-banner" class="area-banner">
          <span id="banner-subtitle">EVENT</span>
          <h2 id="banner-title">NIGHT 01</h2>
          <div class="banner-rule"></div>
        </div>
        <div class="global-grain"></div>
      </div>
    `;
  }

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    let element = this.cache.get(id);
    if (!element) {
      const found = document.getElementById(id);
      if (!found) throw new Error(`Missing UI element: #${id}`);
      element = found;
      this.cache.set(id, element);
    }
    return element as T;
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (!actionEl || actionEl.hasAttribute('disabled')) return;
      const action = actionEl.dataset.action;
      const value = actionEl.dataset.value ?? '';
      if (!action) return;
      if (action !== 'settings-reset') this.game.audio.uiClick();
      switch (action) {
        case 'new-game':
          void this.game.startNewGame();
          break;
        case 'continue':
          void this.game.continueGame();
          break;
        case 'settings':
          this.showSettings();
          break;
        case 'help':
          this.showHelp();
          break;
        case 'settings-close':
          this.hideSettings();
          break;
        case 'help-close':
          this.hideHelp();
          break;
        case 'settings-reset':
          this.resetSettings();
          break;
        case 'resume':
          this.game.resume();
          break;
        case 'save':
          this.game.saveGame(true);
          break;
        case 'load':
          void this.game.loadCheckpoint();
          break;
        case 'quit':
          this.game.quitToTitle();
          break;
        case 'respawn':
          this.game.respawnFromDeath();
          break;
        case 'terminal-close':
          this.game.closeTerminal();
          break;
        case 'terminal-tab':
          this.setTab(value as TerminalTab);
          break;
        case 'craft':
          this.game.craft(value);
          break;
        case 'build':
          this.game.beginBuild(value as BuildType);
          break;
        case 'select-slot':
          this.game.selectHotbar(Number.parseInt(value, 10));
          this.refreshTerminal();
          this.game.audio.uiClick();
          break;
        case 'use-slot':
          this.game.useHotbar(Number.parseInt(value, 10));
          this.refreshTerminal();
          break;
        case 'eat-biomass':
          this.game.eatBiomass();
          this.refreshTerminal();
          break;
        default:
          break;
      }
    });
    this.root.addEventListener(
      'keydown',
      (event) => {
        if (event.code !== 'Escape') return;
        if (this.settingsOpen) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.hideSettings();
        } else if (this.helpOpen) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.hideHelp();
        }
      },
      true,
    );
  }

  private bindSettings(): void {
    const inputs = this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]');
    for (const input of inputs) {
      const handler = (): void => {
        this.readSettingsForm();
        this.updateSettingLabels();
        this.game.applySettings(this.game.settings);
      };
      input.addEventListener('input', handler);
      if (input instanceof HTMLSelectElement) input.addEventListener('change', handler);
    }
    this.updateSettingLabels();
  }

  private updateSettingLabels(): void {
    const settings = this.game.settings;
    this.get('setting-sensitivity-value').textContent = settings.sensitivity.toFixed(2);
    this.get('setting-master-value').textContent = `${Math.round(settings.masterVolume * 100)}%`;
    this.get('setting-music-value').textContent = `${Math.round(settings.musicVolume * 100)}%`;
    this.get('setting-sfx-value').textContent = `${Math.round(settings.sfxVolume * 100)}%`;
  }

  private syncSettingsForm(): void {
    const settings = this.game.settings;
    (this.get<HTMLSelectElement>('setting-quality')).value = settings.quality;
    (this.get<HTMLInputElement>('setting-sensitivity')).value = settings.sensitivity.toString();
    (this.get<HTMLInputElement>('setting-master')).value = settings.masterVolume.toString();
    (this.get<HTMLInputElement>('setting-music')).value = settings.musicVolume.toString();
    (this.get<HTMLInputElement>('setting-sfx')).value = settings.sfxVolume.toString();
    (this.get<HTMLInputElement>('setting-fps')).checked = settings.showFps;
    this.updateSettingLabels();
  }

  private readSettingsForm(): void {
    const quality = (this.get<HTMLSelectElement>('setting-quality')).value;
    this.game.settings.quality = quality === 'low' || quality === 'high' ? quality : 'medium';
    this.game.settings.sensitivity = Number.parseFloat(
      (this.get<HTMLInputElement>('setting-sensitivity')).value,
    );
    this.game.settings.masterVolume = Number.parseFloat(
      (this.get<HTMLInputElement>('setting-master')).value,
    );
    this.game.settings.musicVolume = Number.parseFloat(
      (this.get<HTMLInputElement>('setting-music')).value,
    );
    this.game.settings.sfxVolume = Number.parseFloat(
      (this.get<HTMLInputElement>('setting-sfx')).value,
    );
    this.game.settings.showFps = (this.get<HTMLInputElement>('setting-fps')).checked;
  }

  private resetSettings(): void {
    this.game.resetSettings();
    this.syncSettingsForm();
    this.game.audio.uiClick();
  }

  private startLoadingTips(): void {
    window.setInterval(() => {
      if (this.get('loading-screen').classList.contains('is-visible')) {
        this.loadingTipIndex = (this.loadingTipIndex + 1) % TIPS.length;
        this.setLoading(this.lastLoadingProgress, this.lastLoadingStatus, TIPS[this.loadingTipIndex]);
      }
    }, 4200);
  }

  private lastLoadingProgress = 0;
  private lastLoadingStatus = 'INITIALIZING';

  setLoading(progress: number, status: string, tip?: string): void {
    this.lastLoadingProgress = progress;
    this.lastLoadingStatus = status;
    this.hideAllScreens();
    this.get('loading-screen').classList.add('is-visible');
    this.get('loading-screen').classList.remove('is-error');
    this.setWidth('loading-bar', Math.max(2, Math.min(100, progress)), '%');
    this.get('loading-percent').textContent = `${Math.round(progress)}%`;
    this.get('loading-status').textContent = status;
    if (tip) this.get('loading-tip').textContent = tip;
    this.get('hud').classList.remove('is-visible');
  }

  showLoadingError(message: string): void {
    this.setLoading(100, 'SUIT LINK FAILURE');
    this.get('loading-screen').classList.add('is-error');
    this.get('loading-status').textContent = message;
    const bar = this.get('loading-bar');
    bar.style.background = 'var(--danger)';
    this.get('loading-tip').textContent = 'Reload the page. If the fault persists, this browser may not support WebGL2.';
  }

  hideLoading(): void {
    this.get('loading-screen').classList.remove('is-visible');
  }

  showTitle(hasSave: boolean, summary: { day: number; clock: string; playTime: number } | null): void {
    this.hideAllScreens();
    this.hideHud();
    this.get('title-screen').classList.add('is-visible');
    this.get('title-seed').textContent = `SEED // ${this.game.seed.toUpperCase()}`;
    const continueButton = this.get<HTMLButtonElement>('btn-continue');
    continueButton.disabled = !hasSave;
    const sub = this.get('continue-sub');
    sub.textContent = hasSave && summary
      ? `DAY ${pad(summary.day)} · ${summary.clock} · ${formatRunTime(summary.playTime)}`
      : 'NO CHECKPOINT';
    this.syncSettingsForm();
  }

  hideTitle(): void {
    this.get('title-screen').classList.remove('is-visible');
  }

  beginRun(): void {
    this.hideAllScreens();
    this.hideLoading();
    this.get('hud').classList.add('is-visible');
    this.get('hud').classList.remove('is-dead');
  }

  showHud(): void {
    this.get('hud').classList.add('is-visible');
  }

  hideHud(): void {
    this.get('hud').classList.remove('is-visible');
    this.get('hud').classList.remove('is-dead');
  }

  showPause(): void {
    this.get('pause-screen').classList.add('is-visible');
    this.get('pause-day').textContent = pad(this.game.day);
    this.get('pause-nights').textContent = pad(this.game.stats.nightsSurvived);
    this.get('pause-kills').textContent = pad(this.game.stats.kills);
    this.get('pause-time').textContent = formatRunTime(this.game.playTime);
    const loadButton = this.get<HTMLButtonElement>('pause-load');
    loadButton.disabled = !this.game.hasSave();
    this.get('hud').classList.add('is-paused');
  }

  hidePause(): void {
    this.get('pause-screen').classList.remove('is-visible');
    this.get('hud').classList.remove('is-paused');
  }

  openTerminal(tab: TerminalTab): void {
    this.get('terminal-screen').classList.add('is-visible');
    this.root.classList.add('is-modal');
    this.setTab(tab);
  }

  closeTerminal(): void {
    this.get('terminal-screen').classList.remove('is-visible');
    this.root.classList.remove('is-modal');
  }

  setTab(tab: TerminalTab): void {
    this.currentTab = tab;
    const content = this.get('terminal-content');
    content.scrollTop = 0;
    const tabs = this.root.querySelectorAll<HTMLElement>('[data-action="terminal-tab"]');
    tabs.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tab === tab);
    });
    content.innerHTML = this.tabContent(tab);
    this.game.audio.uiClick();
  }

  refreshTerminal(): void {
    if (!this.get('terminal-screen').classList.contains('is-visible')) return;
    this.get('terminal-content').innerHTML = this.tabContent(this.currentTab);
  }

  private tabContent(tab: TerminalTab): string {
    if (tab === 'crafting') return this.craftingContent();
    if (tab === 'build') return this.buildContent();
    return this.inventoryContent();
  }

  private inventoryContent(): string {
    const inventory = this.game.inventory;
    const player = this.game.player;
    const objectives = this.game.objectives;
    const resourceCards = RESOURCE_ORDER.map(
      (id) => `
        <article class="resource-card">
          <div class="resource-card-icon" style="--resource-color:${RESOURCES[id].color}">${icon(RESOURCES[id].icon)}</div>
          <div><span>${RESOURCES[id].name}</span><strong>${inventory.resources[id]}</strong></div>
          <p>${RESOURCES[id].description}</p>
        </article>`,
    ).join('');
    const toolCards = (Object.keys(TOOLS) as Array<keyof typeof TOOLS>)
      .map((id) => {
        const owned = inventory.tools[id];
        return `<div class="upgrade-card ${owned ? 'is-owned' : ''}">
          <div class="upgrade-icon">${icon(TOOLS[id].icon)}</div>
          <div><strong>${TOOLS[id].name}</strong><span>${owned ? 'UPGRADE INSTALLED' : 'NOT CRAFTED'}</span><p>${TOOLS[id].description}</p></div>
          <em>${owned ? icon('check') : icon('lock')}</em>
        </div>`;
      })
      .join('');
    const blueprintCards = (Object.keys(BLUEPRINTS) as BlueprintId[])
      .map((id) => {
        const found = objectives.blueprints.includes(id);
        return `<div class="schematic-card ${found ? 'is-found' : ''}">
          <div class="schematic-icon">${icon('blueprint')}</div>
          <div><strong>${BLUEPRINTS[id].name}</strong><span>${found ? 'DATA CORE DECRYPTED' : `LOCATED: ${BLUEPRINTS[id].site.toUpperCase()}`}</span></div>
          <em>${found ? icon('check') : icon('lock')}</em>
        </div>`;
      })
      .join('');
    const hotbarSlots = inventory.hotbar
      .map((slot, index) => {
        const item = slot ? ITEMS[slot.item] : null;
        const selected = index === inventory.selected;
        return `<div class="terminal-slot-wrap ${selected ? 'is-selected' : ''}">
          ${slotMarkup(
            item ? `<span class="slot-icon-wrap">${icon(item.icon)}</span>` : `<span class="slot-empty">EMPTY</span>`,
            { key: (index + 1).toString(), qty: slot?.qty, selected, action: 'select-slot', value: index.toString() },
          )}
          ${slot && item?.kind === 'consumable' ? `<button class="slot-use" data-action="use-slot" data-value="${index}" type="button">USE</button>` : ''}
        </div>`;
      })
      .join('');
    return `
      <div class="terminal-body-grid">
        <section class="terminal-main">
          <div class="section-heading"><span>STORAGE MANIFEST</span><strong>${inventory.resources.wood + inventory.resources.metal + inventory.resources.energy + inventory.resources.food} UNITS</strong></div>
          <div class="resource-grid">${resourceCards}</div>
          <div class="section-heading"><span>FIELD UPGRADES</span><strong>PERMANENT</strong></div>
          <div class="upgrade-list">${toolCards}</div>
          <div class="section-heading"><span>RECOVERED SCHEMATICS</span><strong>${objectives.blueprints.length} / 3</strong></div>
          <div class="schematic-list">${blueprintCards}</div>
        </section>
        <aside class="terminal-side">
          <div class="suit-readout">
            <div class="readout-head"><span>SUIT DIAGNOSTICS</span><i class="status-dot"></i></div>
            <div class="readout-row"><span>INTEGRITY</span><strong>${Math.round(player.health)}%</strong></div>
            <div class="readout-row"><span>HUNGER</span><strong>${Math.round(player.hunger)}%</strong></div>
            <div class="readout-row"><span>STAMINA</span><strong>${Math.round(player.stamina)}%</strong></div>
            <div class="readout-row"><span>LAMP CELL</span><strong>${Math.round(player.battery)}%</strong></div>
          </div>
          <div class="section-heading"><span>CARRIED GEAR</span><strong>HOTBAR</strong></div>
          <div class="terminal-hotbar">${hotbarSlots}</div>
          <button class="biomass-button" data-action="eat-biomass" type="button" ${inventory.resources.food <= 0 ? 'disabled' : ''}>
            ${icon('food')} CONSUME 1 BIOMASS <span>+12 HUNGER · ${inventory.resources.food} LEFT</span>
          </button>
          <div class="terminal-note">
            <span>${icon('info')}</span>
            <p>Tools are permanent passive upgrades. Select a weapon or consumable in the hotbar, then use it in the field with LMB.</p>
          </div>
        </aside>
      </div>`;
  }

  private recipeCard(recipe: RecipeDefinition): string {
    const state = this.game.recipeState(recipe.id);
    const owned = state.reason === 'Already crafted';
    const blueprint = recipe.blueprint ? BLUEPRINTS[recipe.blueprint] : null;
    const status = owned ? 'OWNED' : state.ok ? 'READY TO FABRICATE' : (state.reason ?? 'UNAVAILABLE');
    const buttonLabel = owned ? 'INSTALLED' : state.ok ? 'FABRICATE' : 'LOCKED';
    return `<article class="recipe-card ${state.ok ? 'is-ready' : ''} ${owned ? 'is-owned' : ''}">
      <div class="recipe-icon">${icon(recipe.icon, recipe.category === 'weapons' ? 'icon-weapon' : '')}</div>
      <div class="recipe-copy">
        <div class="recipe-name"><h4>${recipe.name}</h4><span class="recipe-tag">${recipe.category.toUpperCase()}</span></div>
        <p>${recipe.description}</p>
        <div class="recipe-costs">${costMarkup(recipe.cost, this.game.inventory.resources)}</div>
        <div class="recipe-flags">
          ${blueprint ? `<span class="${this.game.objectives.blueprints.includes(recipe.blueprint) ? 'is-met' : 'is-missing'}">${icon('blueprint')} ${blueprint.site.toUpperCase()}</span>` : ''}
          ${recipe.requiresFire ? `<span class="${this.game.getNearbyFire() ? 'is-met' : 'is-missing'}">${icon('campfire')} LIT CAMPFIRE</span>` : ''}
        </div>
      </div>
      <div class="recipe-action">
        <span class="recipe-state ${state.ok ? 'is-ready' : ''}">${status}</span>
        <button class="mini-btn" data-action="craft" data-value="${recipe.id}" type="button" ${state.ok ? '' : 'disabled'}>${buttonLabel}</button>
      </div>
    </article>`;
  }

  private craftingContent(): string {
    const categories: Array<{ id: RecipeDefinition['category']; label: string; icon: IconName }> = [
      { id: 'field', label: 'FIELD TOOLS', icon: 'axe' },
      { id: 'weapons', label: 'WEAPONS', icon: 'rifle' },
      { id: 'survival', label: 'SURVIVAL', icon: 'medkit' },
    ];
    const sections = categories
      .map((category) => {
        const recipes = RECIPES.filter((recipe) => recipe.category === category.id);
        return `<section class="craft-section">
          <div class="section-heading"><span>${icon(category.icon)} ${category.label}</span><strong>${recipes.length} BLUEPRINTS</strong></div>
          <div class="recipe-list">${recipes.map((recipe) => this.recipeCard(recipe)).join('')}</div>
        </section>`;
      })
      .join('');
    return `<div class="craft-layout"><div class="craft-main">${sections}</div>
      <aside class="craft-aside">
        <div class="craft-bench">
          <span class="bench-label">FABRICATION STATUS</span>
          <div class="bench-signal"><i></i><i></i><i></i><i></i></div>
          <strong>${this.game.getNearbyFire() ? 'HEAT SOURCE LINKED' : 'NO HEAT SOURCE NEARBY'}</strong>
          <p>Cooked rations require a lit campfire within four metres. All other construction is field-portable.</p>
        </div>
        <div class="terminal-note"><span>${icon('info')}</span><p>Fabrication consumes resources immediately. Permanent tools and schematics are retained across checkpoints.</p></div>
      </aside></div>`;
  }

  private buildContent(): string {
    return `<div class="build-layout">
      <div class="build-intro">
        <span class="eyebrow"><span></span> CONSTRUCTION LINK</span>
        <h3>MAKE THE BASIN YOURS</h3>
        <p>Place structures directly from the field terminal. Choose a module, close the terminal, then aim at the ground and confirm placement. Barricades snap to a coarse grid; the beacon only fits the outpost landing pad.</p>
        <div class="build-stats"><span><b>${this.game.stats.structuresBuilt}</b> DEPLOYED</span><span><b>${this.game.world.structures.countOf('wall')}</b> BARRICADES</span><span><b>${this.game.world.structures.countOf('campfire')}</b> FIRES</span></div>
      </div>
      <div class="build-grid">
        ${(Object.keys(BUILDS) as BuildType[])
          .map((type) => this.buildCard(type))
          .join('')}
      </div>
      <aside class="terminal-note build-tip"><span>${icon('warning')}</span><p>Creatures will destroy unguarded structures. Keep repair materials in reserve and layer fallback positions.</p></aside>
    </div>`;
  }

  private buildCard(type: BuildType): string {
    const def = BUILDS[type];
    const state = this.game.buildState(type);
    const count = this.game.world.structures.countOf(type);
    const limitReached = count >= def.limit;
    const blueprintLocked = def.blueprint ? !this.game.objectives.blueprints.includes(def.blueprint) : false;
    const status = limitReached
      ? 'LIMIT REACHED'
      : blueprintLocked
        ? 'SCHEMATIC REQUIRED'
        : state.ok
          ? 'READY TO DEPLOY'
          : (state.reason ?? 'UNAVAILABLE');
    return `<article class="build-card ${state.ok ? 'is-ready' : ''}">
      <div class="build-card-head"><div class="build-icon">${icon(def.icon)}</div><div><span>${def.role}</span><h4>${def.name}</h4></div><em>${count}/${def.limit}</em></div>
      <p>${def.description}</p>
      <div class="build-costs">${costMarkup(def.cost, this.game.inventory.resources, true)}</div>
      <div class="build-card-foot"><span class="${state.ok ? 'is-ready' : ''}">${status}</span><button class="mini-btn" data-action="build" data-value="${type}" type="button" ${state.ok ? '' : 'disabled'}>${blueprintLocked ? 'LOCKED' : 'DEPLOY'}</button></div>
    </article>`;
  }

  showSettings(): void {
    this.settingsOpen = true;
    this.syncSettingsForm();
    this.get('settings-screen').classList.add('is-visible');
  }

  hideSettings(): void {
    this.settingsOpen = false;
    this.get('settings-screen').classList.remove('is-visible');
    this.game.audio.uiClick();
  }

  showHelp(): void {
    this.helpOpen = true;
    this.get('help-screen').classList.add('is-visible');
  }

  hideHelp(): void {
    this.helpOpen = false;
    this.get('help-screen').classList.remove('is-visible');
    this.game.audio.uiClick();
  }

  isModalOpen(): boolean {
    return this.settingsOpen || this.helpOpen;
  }

  closeTopModal(): void {
    if (this.settingsOpen) this.hideSettings();
    else if (this.helpOpen) this.hideHelp();
  }

  showDeath(cause: string, stats: { days: number; nights: number; kills: number; playTime: number }): void {
    this.hidePause();
    this.closeTerminal();
    this.hideHud();
    this.get('death-cause').textContent = cause;
    this.get('death-days').textContent = pad(stats.days);
    this.get('death-nights').textContent = pad(stats.nights);
    this.get('death-kills').textContent = pad(stats.kills);
    this.get('death-time').textContent = formatRunTime(stats.playTime);
    const loadButton = this.get<HTMLButtonElement>('death-load');
    loadButton.disabled = !this.game.hasSave();
    this.get('death-screen').classList.add('is-visible');
  }

  hideDeath(): void {
    this.get('death-screen').classList.remove('is-visible');
  }

  showVictory(stats: {
    days: number;
    nights: number;
    kills: number;
    structures: number;
    playTime: number;
  }): void {
    this.hidePause();
    this.closeTerminal();
    this.hideHud();
    this.get('victory-days').textContent = pad(stats.days);
    this.get('victory-nights').textContent = pad(stats.nights);
    this.get('victory-kills').textContent = pad(stats.kills);
    this.get('victory-structures').textContent = pad(stats.structures);
    this.get('victory-time').textContent = formatRunTime(stats.playTime);
    this.get('victory-screen').classList.add('is-visible');
  }

  hideVictory(): void {
    this.get('victory-screen').classList.remove('is-visible');
  }

  showBanner(title: string, subtitle: string): void {
    const banner = this.get('area-banner');
    this.get('banner-title').textContent = title;
    this.get('banner-subtitle').textContent = subtitle;
    banner.classList.remove('is-visible');
    void banner.offsetWidth;
    banner.classList.add('is-visible');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => banner.classList.remove('is-visible'), 4200);
  }

  showDiscovery(title: string, subtitle: string, description: string, iconName: IconName = 'blueprint'): void {
    this.get('discovery-title').textContent = title;
    this.get('discovery-desc').textContent = description;
    this.get('discovery-icon').innerHTML = icon(iconName);
    const overlay = this.get('discovery-overlay');
    overlay.classList.remove('is-visible');
    void overlay.offsetWidth;
    overlay.classList.add('is-visible');
    window.clearTimeout(this.discoveryTimer);
    this.discoveryTimer = window.setTimeout(() => overlay.classList.remove('is-visible'), 4600);
    void subtitle;
  }

  toast(message: string, kind: 'info' | 'success' | 'warning' | 'danger' = 'info'): void {
    const stack = this.get('toast-stack');
    const toast = document.createElement('div');
    toast.className = `toast is-${kind}`;
    const glyph =
      kind === 'danger' ? 'warning' : kind === 'success' ? 'check' : kind === 'warning' ? 'warning' : 'info';
    toast.innerHTML = `<span class="toast-icon">${icon(glyph as IconName)}</span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    for (const child of Array.from(stack.children).slice(0, 4)) child.remove();
    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  damageFlash(): void {
    const flash = this.get('damage-flash');
    flash.classList.remove('is-active');
    void flash.offsetWidth;
    flash.classList.add('is-active');
    window.clearTimeout(this.damageTimer);
    this.damageTimer = window.setTimeout(() => flash.classList.remove('is-active'), 320);
  }

  onWorldChanged(world: World): void {
    this.minimapWorld = world;
    this.minimapBase = null;
    this.buildMinimapBase();
  }

  private buildMinimapBase(): void {
    if (!this.minimapWorld) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(320, 320);
    const world = this.minimapWorld;
    for (let py = 0; py < 320; py++) {
      for (let px = 0; px < 320; px++) {
        const x = (px / 319) * 200 - 100;
        const z = (py / 319) * 200 - 100;
        const height = world.terrain.minimapHeight(x, z);
        const slope =
          Math.abs(world.terrain.minimapHeight(x + 1.5, z) - height) +
          Math.abs(world.terrain.minimapHeight(x, z + 1.5) - height);
        const forest = fbm2D(x * 0.035, z * 0.035, 29, 3);
        const radius = Math.hypot(x, z);
        let r = 14 + height * 0.7;
        let g = 25 + height * 0.9 + forest * 10;
        let b = 25 + height * 0.55 + forest * 7;
        r += slope * 18;
        g += slope * 12;
        b += slope * 12;
        if (radius > 70) {
          const edge = Math.min(1, (radius - 70) / 28);
          r *= 1 - edge * 0.45;
          g *= 1 - edge * 0.45;
          b *= 1 - edge * 0.4;
        }
        if (slope > 3.2) {
          r += 16;
          g += 14;
          b += 14;
        }
        const index = (py * 320 + px) * 4;
        image.data[index] = Math.min(255, Math.max(0, r));
        image.data[index + 1] = Math.min(255, Math.max(0, g));
        image.data[index + 2] = Math.min(255, Math.max(0, b));
        image.data[index + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const vignette = ctx.createRadialGradient(160, 160, 40, 160, 160, 190);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.76, 'rgba(2,8,9,0.2)');
    vignette.addColorStop(1, 'rgba(2,8,9,0.85)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 320, 320);
    ctx.strokeStyle = 'rgba(126, 231, 216, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = (i / 4) * 320;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 320);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(320, p);
      ctx.stroke();
    }
    this.minimapBase = canvas;
  }

  private drawMinimap(): void {
    if (!this.minimapContext || !this.minimapWorld || !this.minimapCanvas) return;
    const ctx = this.minimapContext;
    const size = this.minimapCanvas.width;
    ctx.clearRect(0, 0, size, size);
    if (this.minimapBase) ctx.drawImage(this.minimapBase, 0, 0, size, size);
    const toMap = (x: number, z: number): [number, number] => [
      ((x + 100) / 200) * size,
      ((z + 100) / 200) * size,
    ];

    for (const structure of this.game.world.structures.structures) {
      const [x, y] = toMap(structure.x, structure.z);
      ctx.fillStyle =
        structure.type === 'campfire'
          ? '#ffb35c'
          : structure.type === 'beacon'
            ? '#ffd36b'
            : structure.type === 'shelter'
              ? '#8af5e6'
              : '#86b0b3';
      ctx.fillRect(x - 1.8, y - 1.8, 3.6, 3.6);
    }

    for (const poi of this.minimapWorld.pois) {
      const [x, y] = toMap(poi.x, poi.z);
      ctx.save();
      ctx.translate(x, y);
      if (poi.kind === 'outpost') {
        ctx.fillStyle = '#8ffff0';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(143,255,240,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
      } else if (poi.kind === 'pad') {
        ctx.strokeStyle = '#ffc06b';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-3.5, -3.5, 7, 7);
      } else {
        ctx.fillStyle = '#ffc06b';
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3, -3, 6, 6);
      }
      ctx.restore();
    }

    if (isNight(this.game.clock) || this.game.state !== 'playing') {
      for (const enemy of this.game.enemies.enemies) {
        if (!enemy.alive) continue;
        if (Math.hypot(enemy.position.x - this.game.player.position.x, enemy.position.z - this.game.player.position.z) > 52) continue;
        const [x, y] = toMap(enemy.position.x, enemy.position.z);
        ctx.fillStyle = enemy.type === 'warden' ? '#ff4f4f' : '#ff7a58';
        ctx.beginPath();
        ctx.arc(x, y, enemy.type === 'warden' ? 4 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const objective = primaryObjective(this.game.objectives);
    if (objective.target) {
      const [x, y] = toMap(objective.target.x, objective.target.z);
      const pulse = 6 + Math.sin(performance.now() * 0.004) * 2;
      ctx.strokeStyle = '#ffc06b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, pulse + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    const [px, py] = toMap(this.game.player.position.x, this.game.player.position.z);
    const angle = Math.PI - this.game.player.yaw;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = '#b9fff4';
    ctx.shadowColor = '#7dffe7';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.4, 6);
    ctx.lineTo(0, 3.2);
    ctx.lineTo(-5.4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const coords = this.get('minimap-coords');
    coords.textContent = `${pad(Math.round(this.game.player.position.x), 3)} · ${pad(Math.round(this.game.player.position.z), 3)}`;
  }

  updateHud(): void {
    if (!this.get('hud').classList.contains('is-visible')) return;
    const game = this.game;
    const player = game.player;
    const inventory = game.inventory;
    const clock = game.clock;

    this.setBar('health-bar', player.health, 100);
    this.setBar('hunger-bar', player.hunger, 100);
    this.setBar('stamina-bar', player.stamina, 100);
    this.setBar('battery-bar', player.battery, 100);
    this.setText('health-value', Math.round(player.health).toString());
    this.setText('hunger-value', Math.round(player.hunger).toString());
    this.setText('stamina-value', Math.round(player.stamina).toString());
    this.setText('battery-value', `${Math.round(player.battery)}%`);

    const healthBar = this.get('health-bar');
    healthBar.classList.toggle('is-critical', player.health <= 25);
    healthBar.classList.toggle('is-warning', player.health > 25 && player.health <= 50);

    this.setText('clock-day', `DAY ${pad(game.day)}`);
    this.setText('clock-phase', isNight(clock) ? `NIGHT ${pad(game.nightDirector.nightNumber)}` : phaseLabel(clock));
    this.setText('clock-time', formatClock(clock));
    const night = isNight(clock);
    this.setText(
      'night-note',
      night
        ? `FIRST LIGHT IN ${formatDuration(secondsUntilDawn(clock))}`
        : `DUSK IN ${formatDuration(secondsUntilDusk(clock))}`,
    );
    const cycleIcon = this.get('cycle-icon');
    if (cycleIcon.dataset.mode !== (night ? 'night' : 'day')) {
      cycleIcon.dataset.mode = night ? 'night' : 'day';
      cycleIcon.innerHTML = icon(night ? 'moon' : 'sun');
    }
    this.setWidth('cycle-fill', clock * 100, '%');

    const objective = primaryObjective(game.objectives);
    const objectiveKey = `${objective.id}:${objective.progress?.current ?? ''}:${game.objectives.nightsSurvived}:${game.objectives.blueprints.length}`;
    if (objectiveKey !== this.objectiveSignature) {
      this.objectiveSignature = objectiveKey;
      this.setText('objective-index', pad(objective.index));
      this.setText('objective-title', objective.title);
      this.setText('objective-desc', objective.description);
      this.setText('objective-hint', objective.hint);
      this.setText('objective-nights', `NIGHTS SURVIVED ${pad(game.stats.nightsSurvived)}`);
      this.setText('objective-blueprints', `SCHEMATICS ${game.objectives.blueprints.length}/3`);
      const progress = objective.progress;
      this.get('objective-progress-wrap').style.display = progress ? 'flex' : 'none';
      if (progress) {
        this.setWidth('objective-bar', (progress.current / progress.target) * 100, '%');
        this.setText('objective-progress', `${progress.current} / ${progress.target}`);
      }
    }

    for (const id of RESOURCE_ORDER) {
      this.setText(`hud-resource-${id}`, inventory.resources[id].toString());
    }

    const selected = inventory.hotbar[inventory.selected] ?? null;
    const selectedItem = selected ? ITEMS[selected.item] : null;
    const energy = inventory.resources.energy;
    let weaponText = 'UNARMED';
    if (selectedItem?.id === 'blade') weaponText = 'ARC CUTTER // READY';
    else if (selectedItem?.id === 'rifle') weaponText = `PULSE RIFLE // CHARGE ${energy}`;
    else if (selectedItem) weaponText = `${selectedItem.short} ×${selected.qty ?? 0} // LMB USE`;
    this.setText('weapon-readout', weaponText);
    this.get('weapon-readout').classList.toggle('is-low', selectedItem?.id === 'rifle' && energy <= 2);

    this.renderHotbar(inventory, selected);

    const statuses: string[] = [];
    if (game.siege.active) statuses.push('<span class="status-chip is-danger">UPLINK CONTESTED</span>');
    if (player.cold) statuses.push('<span class="status-chip is-warning">COLD EXPOSURE</span>');
    if (player.hunger <= 0) statuses.push('<span class="status-chip is-danger">STARVING</span>');
    else if (player.hunger < 25) statuses.push('<span class="status-chip is-warning">HUNGER LOW</span>');
    if (player.health < 30) statuses.push('<span class="status-chip is-danger">CRITICAL</span>');
    if (game.world.structures.warmthAt(player.position.x, player.position.z).near) {
      statuses.push('<span class="status-chip is-safe">WARM</span>');
    }
    if (player.flashlightOn) statuses.push(`<span class="status-chip is-info">LAMP ${Math.round(player.battery)}%</span>`);
    if (night) statuses.push('<span class="status-chip is-info">NIGHTFALL</span>');
    const statusHtml = statuses.join('');
    if (statusHtml !== this.statusSignature) {
      this.statusSignature = statusHtml;
      this.get('status-chips').innerHTML = statusHtml;
    }

    this.get('low-health').style.opacity = player.health < 30 ? `${(1 - player.health / 30) * 0.55}` : '0';

    const interaction = game.currentInteraction;
    this.setInteraction(interaction);
    const crosshair = this.get('crosshair');
    crosshair.classList.toggle('is-interactive', Boolean(interaction));
    crosshair.classList.toggle('is-danger', game.enemies.enemies.some((enemy) => enemy.alive && enemy.aggro));
    crosshair.classList.toggle('is-invalid', Boolean(game.placement && !game.placement.valid));
    crosshair.classList.toggle('is-building', Boolean(game.buildSystem.activeType));

    const placement = game.placement;
    const buildHud = this.get('build-hud');
    if (game.buildSystem.activeType && placement) {
      buildHud.classList.add('is-visible');
      const def = BUILDS[game.buildSystem.activeType];
      this.setText('build-name', def.name.toUpperCase());
      this.setText('build-status', placement.valid ? 'PLACEMENT READY' : (placement.reason ?? 'INVALID POSITION').toUpperCase());
      buildHud.classList.toggle('is-invalid', !placement.valid);
    } else if (game.buildSystem.activeType) {
      buildHud.classList.add('is-visible');
      this.setText('build-status', 'AIM AT THE GROUND');
    } else {
      buildHud.classList.remove('is-visible');
    }

    const siege = game.siege;
    const siegeHud = this.get('siege-hud');
    if (siege.active) {
      siegeHud.classList.add('is-visible');
      this.setWidth('siege-bar', siege.progress * 100, '%');
      this.setText('siege-percent', `${Math.round(siege.progress * 100)}%`);
      this.setText(
        'siege-note',
        siege.inRange
          ? `RESCUE LOCK IN ${formatDuration(siege.timeLeft)} · HOLD POSITION`
          : 'UPLINK PAUSED · RETURN TO THE LANDING PAD',
      );
      siegeHud.classList.toggle('is-warning', !siege.inRange);
    } else {
      siegeHud.classList.remove('is-visible');
    }

    const pointerHint = this.get('pointer-hint');
    pointerHint.classList.toggle(
      'is-visible',
      game.state === 'playing' && !game.input.isPointerLocked() && !game.menuOpen,
    );

    this.setText('fps-readout', `${Math.round(game.fps)} FPS`);
    this.get('fps-readout').style.display = game.settings.showFps ? 'block' : 'none';

    if (performance.now() - this.minimapTimestamp > 95) {
      this.minimapTimestamp = performance.now();
      this.drawMinimap();
    }
    this.updateEnemyBars();
  }

  private setInteraction(interaction: InteractionInfo | null): void {
    const prompt = this.get('interaction-prompt');
    if (!interaction) {
      prompt.classList.remove('is-visible');
      return;
    }
    prompt.classList.add('is-visible');
    this.setText('interaction-key', interaction.key ?? 'E');
    this.setText('interaction-label', interaction.label);
    this.setText('interaction-detail', interaction.detail);
  }

  private renderHotbar(
    inventory: Game['inventory'],
    selected: { item: string; qty: number } | null,
  ): void {
    const signature = `${this.game.inventoryVersion}:${inventory.selected}:${selected?.item ?? ''}:${selected?.qty ?? 0}`;
    if (signature === this.hotbarSignature) return;
    this.hotbarSignature = signature;
    const hotbar = this.get('hotbar');
    hotbar.innerHTML = inventory.hotbar
      .map((slot, index) => {
        const item = slot ? ITEMS[slot.item] : null;
        return slotMarkup(
          item ? `<span class="hud-slot-icon">${icon(item.icon)}</span>` : `<span class="hud-slot-empty">—</span>`,
          {
            key: (index + 1).toString(),
            qty: slot?.qty,
            selected: index === inventory.selected,
            empty: !item,
          },
        );
      })
      .join('');
  }

  private updateEnemyBars(): void {
    const container = this.get('enemy-bars');
    if (this.game.state !== 'playing' || this.game.menuOpen) {
      container.classList.remove('is-active');
      return;
    }
    const camera = this.game.camera;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const seen = new Set<string>();
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive) continue;
      if (!enemy.aggro && enemy.health >= enemy.maxHealth) continue;
      const distance = enemy.position.distanceTo(this.game.player.position);
      if (distance > 48) continue;
      const point = new THREE.Vector3(enemy.position.x, enemy.position.y + enemy.height + 0.28, enemy.position.z);
      point.project(camera);
      if (point.z < -1 || point.z > 1) continue;
      const x = (point.x * 0.5 + 0.5) * width;
      const y = (-point.y * 0.5 + 0.5) * height;
      if (x < 0 || x > width || y < 0 || y > height) continue;
      seen.add(enemy.id);
      let element = this.enemyBars.get(enemy.id);
      if (!element) {
        element = document.createElement('div');
        element.className = 'enemy-bar';
        element.innerHTML = `<span class="enemy-name"></span><div class="enemy-track"><i></i></div>`;
        container.appendChild(element);
        this.enemyBars.set(enemy.id, element);
      }
      element.dataset.type = enemy.type;
      element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      const name = element.querySelector<HTMLElement>('.enemy-name');
      if (name) name.textContent = enemy.type === 'warden' ? 'WARDEN' : enemy.type.toUpperCase();
      const fill = element.querySelector<HTMLElement>('.enemy-track i');
      if (fill) fill.style.width = `${Math.max(0, (enemy.health / enemy.maxHealth) * 100)}%`;
      element.classList.toggle('is-visible', distance < 48);
    }
    for (const [id, element] of this.enemyBars) {
      if (!seen.has(id)) {
        element.remove();
        this.enemyBars.delete(id);
      }
    }
    container.classList.toggle('is-active', this.enemyBars.size > 0);
    this.lastFrameProjection = performance.now();
  }

  private hideAllScreens(): void {
    for (const id of [
      'loading-screen',
      'title-screen',
      'terminal-screen',
      'pause-screen',
      'settings-screen',
      'help-screen',
      'death-screen',
      'victory-screen',
    ]) {
      this.get(id).classList.remove('is-visible');
    }
    this.root.classList.remove('is-modal');
    this.settingsOpen = false;
    this.helpOpen = false;
  }

  private setText(id: string, value: string): void {
    if (this.textCache.get(id) === value) return;
    this.textCache.set(id, value);
    this.get(id).textContent = value;
  }

  private setWidth(id: string, percent: number, suffix = '%'): void {
    const value = `${Math.max(0, Math.min(100, percent))}${suffix}`;
    if (this.widthCache.get(id) === value) return;
    this.widthCache.set(id, value);
    this.get(id).style.width = value;
  }

  private setBar(id: string, value: number, max: number): void {
    this.setWidth(id, (value / max) * 100);
  }

  resetCaches(): void {
    this.hotbarSignature = '';
    this.statusSignature = '';
    this.objectiveSignature = '';
    this.textCache.clear();
    this.widthCache.clear();
  }

  dispose(): void {
    this.root.remove();
  }
}
