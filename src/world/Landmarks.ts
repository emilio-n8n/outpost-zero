import * as THREE from 'three';
import { OUTPOST, SITES, type SiteConfig } from '../config';
import { BLUEPRINTS, type BlueprintId, type Cost, type ResourceId } from '../game/data';
import { Rng } from '../core/Rng';
import type { FX } from '../fx/FX';
import type { CircleCollider, WorldInteractable, WorldPOI } from './types';
import type { Terrain } from './Terrain';

function createTextTexture(text: string, sub: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 179, 92, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 40, 964, 176);
    ctx.fillStyle = 'rgba(255, 179, 92, 0.92)';
    ctx.font = '700 96px "Chakra Petch", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 512, 138);
    ctx.font = '500 34px "Rajdhani", monospace';
    ctx.fillStyle = 'rgba(157, 233, 229, 0.74)';
    ctx.fillText(sub, 512, 188);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createSchematicTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#061a1c';
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = 'rgba(110, 255, 229, 0.22)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 512; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 320);
      ctx.stroke();
    }
    for (let y = 0; y < 320; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(130, 255, 235, 0.92)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(256, 150, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(256, 40);
    ctx.lineTo(256, 260);
    ctx.moveTo(146, 150);
    ctx.lineTo(366, 150);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 179, 92, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(70, 270);
    ctx.lineTo(180, 270);
    ctx.lineTo(210, 240);
    ctx.lineTo(330, 240);
    ctx.lineTo(360, 270);
    ctx.lineTo(450, 270);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160, 255, 238, 0.9)';
    ctx.font = '600 22px "Chakra Petch", monospace';
    ctx.fillText('DEEP RANGE // RECOVERY', 28, 38);
    ctx.fillStyle = 'rgba(255, 179, 92, 0.85)';
    ctx.font = '500 18px "Rajdhani", monospace';
    ctx.fillText('SCHEMATIC DATA CORE', 28, 300);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeCrate(): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: 0x6d7a78,
    roughness: 0.58,
    metalness: 0.4,
    flatShading: true,
  });
  const orange = new THREE.MeshStandardMaterial({
    color: 0xb56b34,
    roughness: 0.7,
    metalness: 0.25,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.7, 0.72), metal);
  body.position.y = 0.35;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  for (const x of [-0.3, 0.3]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.74, 0.76), orange);
    band.position.set(x, 0.35, 0);
    group.add(band);
  }
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.06, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x87ffe9, toneMapped: false }),
  );
  stripe.position.set(0, 0.55, 0.37);
  group.add(stripe);
  return group;
}

function makeDataPad(screenMaterial: THREE.MeshBasicMaterial): THREE.Group {
  const group = new THREE.Group();
  const standMat = new THREE.MeshStandardMaterial({
    color: 0x4e5b5c,
    roughness: 0.5,
    metalness: 0.55,
    flatShading: true,
  });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), standMat);
  post.position.y = 0.5;
  post.castShadow = true;
  group.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.08, 6), standMat);
  base.position.y = 0.04;
  group.add(base);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.74, 0.12), standMat);
  frame.position.set(0, 1.28, 0.02);
  frame.rotation.x = -0.12;
  frame.castShadow = true;
  group.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.6), screenMaterial);
  screen.position.set(0, 1.28, 0.085);
  screen.rotation.x = -0.12;
  group.add(screen);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.75),
    new THREE.MeshBasicMaterial({
      color: 0x5fffe4,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  glow.position.set(0, 1.28, 0.1);
  glow.rotation.x = -0.12;
  group.add(glow);
  return group;
}

export class Landmarks {
  readonly interactables: WorldInteractable[] = [];
  readonly pois: WorldPOI[] = [];
  readonly emberSources: THREE.Vector3[] = [];
  private readonly scene: THREE.Scene;
  private readonly terrain: Terrain;
  private readonly addCollider: (collider: CircleCollider) => void;
  private readonly root = new THREE.Group();
  private readonly padRing: THREE.Mesh;
  private readonly padLights: THREE.Mesh[] = [];
  private readonly padLightMaterial: THREE.MeshBasicMaterial;
  private readonly screenMaterial: THREE.MeshBasicMaterial;
  private readonly padGlowMaterial: THREE.MeshBasicMaterial;
  private readonly markerMaterial: THREE.MeshBasicMaterial;
  private readonly schematicTexture: THREE.CanvasTexture;
  private padLightPhase = 0;
  private emberTimer = 0;
  private readonly rng = new Rng('landmarks');
  private readonly padMeshes: THREE.Mesh[] = [];
  private readonly outlineMeshes: THREE.Mesh[] = [];

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    seed: string,
    addCollider: (collider: CircleCollider) => void,
    looted: ReadonlySet<string>,
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.addCollider = addCollider;
    this.root.name = 'landmarks';
    scene.add(this.root);

    this.schematicTexture = createSchematicTexture();
    this.screenMaterial = new THREE.MeshBasicMaterial({
      map: this.schematicTexture,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.padLightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc06b,
      toneMapped: false,
    });
    this.padGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb15a,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x77ffe8,
      toneMapped: false,
    });

    this.padRing = this.buildOutpost(seed, looted);
    for (const site of SITES) {
      this.buildRuin(site, seed, looted);
    }

    this.pois.push({
      id: 'outpost',
      label: 'Outpost Zero',
      x: OUTPOST.x,
      z: OUTPOST.z,
      kind: 'outpost',
    });
    this.pois.push({
      id: 'beacon-pad',
      label: 'Landing Pad',
      x: OUTPOST.beaconPad.x,
      z: OUTPOST.beaconPad.z,
      kind: 'pad',
    });
  }

  private mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    shadows = true,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private buildOutpost(seed: string, looted: ReadonlySet<string>): THREE.Mesh {
    const rng = new Rng(`${seed}:outpost`);
    void rng;
    const ground = this.terrain.heightAt(OUTPOST.x, OUTPOST.z);
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0xb5bcb3,
      roughness: 0.55,
      metalness: 0.35,
      flatShading: true,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b4547,
      roughness: 0.65,
      metalness: 0.5,
      flatShading: true,
    });
    const orangeMaterial = new THREE.MeshStandardMaterial({
      color: 0xc77a3d,
      roughness: 0.68,
      metalness: 0.22,
      flatShading: true,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b6267,
      emissive: 0x17484f,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.4,
    });

    const pod = new THREE.Group();
    pod.position.set(0, ground, 9);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.35, 3.0, 8, 14), hullMaterial);
    body.position.y = 3.3;
    body.rotation.z = 0.47;
    body.rotation.x = 0.1;
    body.castShadow = true;
    body.receiveShadow = true;
    pod.add(body);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.55, 14, 1, true), orangeMaterial);
    stripe.position.y = 3.9;
    stripe.rotation.z = 0.47;
    pod.add(stripe);
    const window = new THREE.Mesh(new THREE.CylinderGeometry(2.37, 2.37, 1.05, 14, 1, true, 0.2, 1.3), glassMaterial);
    window.position.set(0.2, 4.7, 0.2);
    window.rotation.z = 0.47;
    pod.add(window);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, 4.2, 5), darkMaterial);
      leg.position.set(Math.cos(angle) * 1.9, 1.35, Math.sin(angle) * 1.9);
      leg.rotation.z = Math.cos(angle) * 0.48;
      leg.rotation.x = Math.sin(angle) * 0.48;
      leg.castShadow = true;
      pod.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.2, 6), darkMaterial);
      foot.position.set(Math.cos(angle) * 2.7, 0.1, Math.sin(angle) * 2.7);
      pod.add(foot);
    }
    const beaconLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9c52, toneMapped: false }),
    );
    beaconLight.position.set(1.1, 6.2, 0);
    pod.add(beaconLight);
    this.root.add(pod);
    this.addCollider({
      x: 0,
      z: 9,
      radius: 2.3,
      enabled: true,
      blocksSight: true,
      tag: 'landmark',
      id: 'outpost-pod',
    });

    const crater = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 32),
      new THREE.MeshBasicMaterial({
        color: 0x12191a,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(0, ground + 0.03, 9);
    crater.renderOrder = 1;
    this.root.add(crater);

    const mast = new THREE.Group();
    mast.position.set(-7.5, ground, -6);
    const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.18, 7.5, 6), darkMaterial);
    mastPole.position.y = 3.75;
    mastPole.castShadow = true;
    mast.add(mastPole);
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6 - i * 0.35, 0.08, 0.08), darkMaterial);
      bar.position.y = 3.0 + i * 1.4;
      mast.add(bar);
    }
    const dish = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.36, 16, 1, true), hullMaterial);
    dish.position.set(0.4, 6.4, 0.25);
    dish.rotation.set(0.5, 0.8, 0.1);
    mast.add(dish);
    this.root.add(mast);
    this.addCollider({
      x: -7.5,
      z: -6,
      radius: 0.65,
      enabled: true,
      blocksSight: true,
      tag: 'landmark',
      id: 'outpost-mast',
    });

    const solar = new THREE.Group();
    solar.position.set(9, ground, 7);
    for (let i = 0; i < 2; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.4), new THREE.MeshStandardMaterial({
        color: 0x283e42,
        roughness: 0.35,
        metalness: 0.55,
        emissive: 0x0a2327,
        emissiveIntensity: 0.5,
      }));
      panel.position.set(0, 1.35 + i * 0.12, i * 1.55);
      panel.rotation.x = -0.36;
      panel.rotation.y = -0.18;
      panel.castShadow = true;
      solar.add(panel);
    }
    const solarStand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.18), darkMaterial);
    solarStand.position.set(0, 0.65, 0.7);
    solar.add(solarStand);
    this.root.add(solar);

    this.buildPad(ground);
    this.buildOutpostCache(ground, looted.has('outpost-cache'));

    const groundText = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.2),
      new THREE.MeshBasicMaterial({
        map: createTextTexture('OUTPOST ZERO', 'DEEP RANGE // SURVIVAL PROTOCOL'),
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    groundText.rotation.x = -Math.PI / 2;
    groundText.rotation.z = -0.08;
    groundText.position.set(0, ground + 0.08, 3.6);
    groundText.renderOrder = 2;
    this.root.add(groundText);

    return this.padRingMesh;
  }

  private buildPad(ground: number): void {
    const padY = this.terrain.heightAt(OUTPOST.beaconPad.x, OUTPOST.beaconPad.z);
    const padBase = new THREE.Mesh(
      new THREE.CylinderGeometry(OUTPOST.beaconPad.radius, OUTPOST.beaconPad.radius + 0.2, 0.16, 20),
      new THREE.MeshStandardMaterial({
        color: 0x303a3b,
        roughness: 0.62,
        metalness: 0.5,
      }),
    );
    padBase.position.set(OUTPOST.beaconPad.x, padY + 0.08, OUTPOST.beaconPad.z);
    padBase.receiveShadow = true;
    this.root.add(padBase);
    this.padMeshes.push(padBase);

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(OUTPOST.beaconPad.radius - 0.3, 32),
      new THREE.MeshStandardMaterial({
        color: 0x28312f,
        roughness: 0.75,
        metalness: 0.35,
      }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(OUTPOST.beaconPad.x, padY + 0.17, OUTPOST.beaconPad.z);
    this.root.add(inner);
    this.padMeshes.push(inner);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(OUTPOST.beaconPad.radius - 0.28, 0.045, 6, 64),
      this.padLightMaterial,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(OUTPOST.beaconPad.x, padY + 0.2, OUTPOST.beaconPad.z);
    this.root.add(ring);
    this.padMeshes.push(ring);
    this.padRingMesh = ring;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.08), this.padLightMaterial);
      light.position.set(
        OUTPOST.beaconPad.x + Math.cos(angle) * (OUTPOST.beaconPad.radius - 0.65),
        padY + 0.21,
        OUTPOST.beaconPad.z + Math.sin(angle) * (OUTPOST.beaconPad.radius - 0.65),
      );
      light.rotation.y = -angle;
      this.root.add(light);
      this.padLights.push(light);
      this.padMeshes.push(light);
    }

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(OUTPOST.beaconPad.radius * 1.25, 24),
      this.padGlowMaterial,
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(OUTPOST.beaconPad.x, padY + 0.06, OUTPOST.beaconPad.z);
    glow.renderOrder = 2;
    this.root.add(glow);
    this.outlineMeshes.push(glow);

    const padLight = new THREE.PointLight(0xffa352, 7, 14, 2);
    padLight.position.set(OUTPOST.beaconPad.x, padY + 1.2, OUTPOST.beaconPad.z);
    this.root.add(padLight);

    void ground;
  }

  private buildOutpostCache(ground: number, alreadyLooted: boolean): void {
    const group = makeCrate();
    group.position.set(-3.5, this.terrain.heightAt(-3.5, 2), 2);
    this.root.add(group);
    const id = 'outpost-cache';
    const looted = alreadyLooted;
    group.visible = !looted;
    this.interactables.push({
      id,
      kind: 'loot',
      position: new THREE.Vector3(-3.5, this.terrain.heightAt(-3.5, 2) + 0.6, 2),
      radius: 2.7,
      label: 'SALVAGE CACHE',
      detail: '2 alloy · 1 lumen',
      loot: { metal: 2, energy: 1 },
      object: group,
      looted,
    });
    void ground;
  }

  private buildRuin(site: SiteConfig, seed: string, looted: ReadonlySet<string>): void {
    const rng = new Rng(`${seed}:${site.id}`);
    const ground = this.terrain.heightAt(site.x, site.z);
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: site.id === 'freighter' ? 0x9a8f7c : 0xaab1a8,
      roughness: 0.66,
      metalness: 0.32,
      flatShading: true,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x3c4546,
      roughness: 0.6,
      metalness: 0.5,
      flatShading: true,
    });
    const orangeMaterial = new THREE.MeshStandardMaterial({
      color: 0xa86636,
      roughness: 0.7,
      metalness: 0.2,
    });

    const group = new THREE.Group();
    group.position.set(site.x, ground, site.z);
    this.root.add(group);
    void rng;

    if (site.id === 'survey') {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(3.3, 14, 8, 0, Math.PI * 1.55, 0, Math.PI * 0.52),
        hullMaterial,
      );
      dome.position.set(-1.8, 0.25, 0.4);
      dome.rotation.set(0.16, 0.4, 0.22);
      dome.castShadow = true;
      dome.receiveShadow = true;
      group.add(dome);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.12, 5, 24), orangeMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(-1.8, 0.27, 0.4);
      group.add(rim);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 3.4, 5), darkMaterial);
      strut.position.set(1.3, 1.2, 1.2);
      strut.rotation.z = 0.6;
      strut.castShadow = true;
      group.add(strut);
      this.addCollider({
        x: site.x - 1.8,
        z: site.z + 0.4,
        radius: 3.0,
        enabled: true,
        blocksSight: true,
        tag: 'landmark',
        id: `${site.id}-dome`,
      });
      this.emberSources.push(new THREE.Vector3(site.x - 2.2, ground + 2.5, site.z + 0.5));
    } else if (site.id === 'freighter') {
      const hull = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.55, 9.5, 12, 1, true),
        hullMaterial,
      );
      hull.rotation.z = Math.PI * 0.48;
      hull.rotation.y = 0.45;
      hull.position.set(-1.2, 1.55, 0.2);
      hull.castShadow = true;
      hull.receiveShadow = true;
      group.add(hull);
      const hullEnd = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.16, 5, 18), orangeMaterial);
      hullEnd.rotation.y = Math.PI * 0.5;
      hullEnd.position.set(-4.8, 1.6, 0.2);
      group.add(hullEnd);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.28, 2.0), hullMaterial);
      wing.position.set(3.2, 0.72, -0.9);
      wing.rotation.set(0.18, -0.35, 0.33);
      wing.castShadow = true;
      group.add(wing);
      for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4 - i * 0.38, 0.2), darkMaterial);
        rib.position.set(-1.4 + i * 0.9, 0.8, -1.6);
        rib.rotation.z = rng.range(-0.5, 0.5);
        group.add(rib);
      }
      this.addCollider({
        x: site.x - 1.2,
        z: site.z + 0.2,
        radius: 3.1,
        enabled: true,
        blocksSight: true,
        tag: 'landmark',
        id: `${site.id}-hull`,
      });
      this.emberSources.push(new THREE.Vector3(site.x - 1.6, ground + 1.2, site.z + 0.4));
    } else {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.9, 10), darkMaterial);
      base.position.set(0, 0.45, 0);
      base.castShadow = true;
      group.add(base);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 11, 7), hullMaterial);
      mast.position.set(0, 6, 0);
      mast.rotation.z = 0.06;
      mast.castShadow = true;
      group.add(mast);
      const dish = new THREE.Mesh(new THREE.ConeGeometry(2.6, 0.9, 18, 1, true), hullMaterial);
      dish.position.set(1.1, 8.2, 0.4);
      dish.rotation.set(0.48, 0.3, 0.6);
      dish.castShadow = true;
      group.add(dish);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 5, 24), orangeMaterial);
      ring.position.set(0, 4.2, 0);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + 0.8;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 3.4, 5), darkMaterial);
        leg.position.set(Math.cos(angle) * 1.5, 1.8, Math.sin(angle) * 1.5);
        leg.rotation.z = Math.cos(angle) * 0.45;
        leg.rotation.x = Math.sin(angle) * 0.45;
        group.add(leg);
      }
      this.addCollider({
        x: site.x,
        z: site.z,
        radius: 2.5,
        enabled: true,
        blocksSight: true,
        tag: 'landmark',
        id: `${site.id}-mast`,
      });
      this.emberSources.push(new THREE.Vector3(site.x + 0.4, ground + 1.0, site.z));
    }

    const crate = makeCrate();
    crate.position.set(2.2, 0, 2.0);
    group.add(crate);
    const crateId = `${site.id}-cache`;
    const crateLooted = looted.has(crateId);
    crate.visible = !crateLooted;
    this.interactables.push({
      id: crateId,
      kind: 'loot',
      position: new THREE.Vector3(site.x + 2.2, ground + 0.6, site.z + 2.0),
      radius: 2.7,
      label: 'SALVAGE CACHE',
      detail: site.id === 'relay' ? '6 lumen · 4 alloy' : site.id === 'freighter' ? '6 alloy · 2 lumen' : '4 alloy · 2 biomass',
      loot:
        site.id === 'relay'
          ? { energy: 6, metal: 4 }
          : site.id === 'freighter'
            ? { metal: 6, energy: 2 }
            : { metal: 4, food: 2 },
      object: crate,
      looted: crateLooted,
    });

    const pad = makeDataPad(this.screenMaterial);
    pad.position.set(-2.6, 0, 2.7);
    pad.rotation.y = 0.5;
    group.add(pad);
    const padId = `${site.id}-datapad`;
    const padLooted = looted.has(padId);
    pad.visible = !padLooted;
    this.interactables.push({
      id: padId,
      kind: 'blueprint',
      position: new THREE.Vector3(site.x - 2.6, ground + 1.0, site.z + 2.7),
      radius: 2.8,
      label: 'DATA CORE',
      detail: BLUEPRINTS[site.blueprint].name,
      blueprint: site.blueprint,
      object: pad,
      looted: padLooted,
    });

    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), this.markerMaterial);
    marker.position.set(2.9, 2.8, 2.0);
    group.add(marker);
    this.markerMeshes.push(marker);

    this.pois.push({
      id: site.id,
      label: site.label,
      x: site.x,
      z: site.z,
      kind: 'wreck',
    });
  }

  private padRingMesh!: THREE.Mesh;
  private markerMeshes: THREE.Mesh[] = [];

  update(dt: number, elapsed: number, fx: FX): void {
    this.padLightPhase += dt;
    this.padRing.rotation.z = elapsed * 0.14;
    for (let i = 0; i < this.padLights.length; i++) {
      const pulse = 0.7 + Math.sin(elapsed * 2.2 + i * 0.55) * 0.3;
      this.padLights[i]!.scale.setScalar(pulse);
    }
    this.markerMaterial.color.setHSL(0.47, 0.65, 0.62 + Math.sin(elapsed * 2.1) * 0.1);
    this.screenMaterial.opacity = 1;
    this.padGlowMaterial.opacity = 0.28 + Math.sin(elapsed * 1.4) * 0.08;
    this.emberTimer -= dt;
    if (this.emberTimer <= 0 && this.emberSources.length > 0) {
      this.emberTimer = this.rng.range(0.35, 1.2);
      const source = this.emberSources[this.rng.int(0, this.emberSources.length - 1)] as THREE.Vector3;
      fx.ember(source.clone().add(new THREE.Vector3(this.rng.range(-0.4, 0.4), 0, this.rng.range(-0.4, 0.4))));
    }
  }

  hideInteractable(interactable: WorldInteractable): void {
    interactable.looted = true;
    interactable.object.visible = false;
  }

  getLootedIds(): string[] {
    return this.interactables.filter((entry) => entry.looted).map((entry) => entry.id);
  }

  dispose(): void {
    this.scene.remove(this.root);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        geometries.add(child.geometry);
        if (Array.isArray(child.material)) child.material.forEach((entry) => materials.add(entry));
        else materials.add(child.material);
      }
    });
    for (const material of materials) {
      if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map);
      if ('emissiveMap' in material && material.emissiveMap instanceof THREE.Texture) {
        textures.add(material.emissiveMap);
      }
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    this.schematicTexture.dispose();
  }
}

