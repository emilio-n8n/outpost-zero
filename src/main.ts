import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import './style.css';
import * as THREE from 'three';
import { Rng } from './core/Rng';
import { fbm2D, smoothstep } from './core/noise';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root missing');

app.innerHTML = `
  <div id="scene"></div>
  <div id="title-screen">
    <div class="title-topline"><span>DEEP RANGE // SURVIVAL PROTOCOL</span><span>BUILD 0.1.0</span></div>
    <div class="title-copy">
      <div class="eyebrow"><span></span>LAST TRANSMISSION RECOVERED</div>
      <h1>OUTPOST<br><em>ZERO</em></h1>
      <p class="lede">The station is dead. The planet is not.<br>Scavenge, build shelter, and make it through the night.</p>
      <div class="title-actions">
        <button id="boot-start" class="btn btn-primary">Establish Uplink <span>→</span></button>
        <button class="btn btn-ghost" disabled>Continue Expedition</button>
      </div>
      <div class="title-meta">
        <span>PROCEDURAL WORLD</span><span>DAY / NIGHT</span><span>PERSISTENT SAVE</span>
      </div>
    </div>
    <div class="title-footer">
      <span id="boot-status">TERRAIN LINK ESTABLISHED // SIGNAL STABLE</span>
      <span>CLICK TO ENABLE AUDIO</span>
    </div>
    <div class="scanlines"></div>
  </div>
`;

const container = document.querySelector<HTMLDivElement>('#scene');
if (!container) throw new Error('Scene container missing');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071216);
scene.fog = new THREE.FogExp2(0x0a1b1e, 0.0125);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(22, 13, 28);

const hemi = new THREE.HemisphereLight(0x8be4d4, 0x241712, 1.4);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffbd82, 3.6);
sun.position.set(-30, 26, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -38;
sun.shadow.camera.right = 38;
sun.shadow.camera.top = 38;
sun.shadow.camera.bottom = -38;
sun.shadow.bias = -0.0004;
scene.add(sun);

const rng = new Rng('outpost-zero-preview');
const terrainSize = 190;
const segments = 128;
const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
geometry.rotateX(-Math.PI / 2);
const positions = geometry.attributes.position;
const colors: number[] = [];
const color = new THREE.Color();
for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const z = positions.getZ(i);
  const radius = Math.hypot(x, z);
  const edge = smoothstep(66, 96, radius);
  const height =
    fbm2D(x * 0.018, z * 0.018, 811, 5) * 10 +
    fbm2D(x * 0.061, z * 0.061, 112, 3) * 1.8 +
    edge * edge * 23 +
    Math.pow(Math.max(0, 1 - Math.hypot(x, z) / 27), 2) * 1.5;
  positions.setY(i, height - 4);
  const rock = smoothstep(0.55, 0.9, fbm2D(x * 0.05 + 10, z * 0.05, 99, 3));
  color.set(rock > 0.48 ? 0x445254 : 0x344b43);
  color.lerp(new THREE.Color(0x756348), smoothstep(0.35, 0.7, fbm2D(x * 0.03, z * 0.03, 44, 3)) * 0.65);
  color.multiplyScalar(0.82 + rng.next() * 0.25);
  colors.push(color.r, color.g, color.b);
}
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
geometry.computeVertexNormals();
const terrain = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0.02 }),
);
terrain.receiveShadow = true;
scene.add(terrain);

function makeTree(x: number, z: number, scale: number, hue: number): THREE.Group {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.32, 5.4, 5),
    new THREE.MeshStandardMaterial({ color: 0x3b3129, roughness: 0.95, flatShading: true }),
  );
  trunk.position.y = 2.7;
  trunk.castShadow = true;
  tree.add(trunk);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.52),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.42, 0.34),
      emissive: new THREE.Color().setHSL(hue, 0.7, 0.08),
      emissiveIntensity: 0.7,
      roughness: 0.82,
      flatShading: true,
    }),
  );
  canopy.position.y = 5.25;
  canopy.scale.set(1.2, 0.62, 1.2);
  canopy.castShadow = true;
  tree.add(canopy);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, 1.4, 4),
    new THREE.MeshBasicMaterial({ color: 0x8fffe0 }),
  );
  stem.position.y = 5.8;
  tree.add(stem);
  return tree;
}

for (let i = 0; i < 60; i++) {
  const angle = rng.range(0, Math.PI * 2);
  const radius = rng.range(15, 72);
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  if (Math.hypot(x, z) < 12) continue;
  const y = fbm2D(x * 0.018, z * 0.018, 811, 5) * 10 + fbm2D(x * 0.061, z * 0.061, 112, 3) * 1.8 - 4;
  const tree = makeTree(x, z, rng.range(0.7, 1.6), rng.range(0.35, 0.62));
  tree.position.set(x, y, z);
  scene.add(tree);
}

const pod = new THREE.Group();
const hull = new THREE.Mesh(
  new THREE.CapsuleGeometry(2.5, 3.2, 6, 12),
  new THREE.MeshStandardMaterial({ color: 0xc7cec7, roughness: 0.55, metalness: 0.3, flatShading: true }),
);
hull.rotation.z = 0.52;
hull.rotation.x = 0.15;
hull.position.set(0, 3.2, 0);
hull.castShadow = true;
pod.add(hull);
const stripe = new THREE.Mesh(
  new THREE.CylinderGeometry(2.56, 2.56, 0.45, 12, 1, true),
  new THREE.MeshStandardMaterial({ color: 0xe8913f, emissive: 0x54230c, roughness: 0.6 }),
);
stripe.rotation.z = 0.52;
stripe.position.set(0, 3.9, 0);
pod.add(stripe);
for (let i = 0; i < 3; i++) {
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 4, 5),
    new THREE.MeshStandardMaterial({ color: 0x3d4445, metalness: 0.4, roughness: 0.7 }),
  );
  const a = (i / 3) * Math.PI * 2;
  leg.position.set(Math.cos(a) * 1.8, 1.4, Math.sin(a) * 1.8);
  leg.rotation.z = Math.cos(a) * 0.55;
  leg.rotation.x = Math.sin(a) * 0.55;
  pod.add(leg);
}
pod.position.y = -0.6;
scene.add(pod);

const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.12, 8, 5),
  new THREE.MeshBasicMaterial({ color: 0xffb25e }),
);
beacon.position.set(4, 4, -3);
scene.add(beacon);
const beaconGlow = new THREE.PointLight(0xff9d48, 45, 30, 2);
beaconGlow.position.set(4, 8, -3);
scene.add(beaconGlow);

const planet = new THREE.Mesh(
  new THREE.SphereGeometry(26, 32, 24),
  new THREE.MeshBasicMaterial({ color: 0x8c7063, fog: false }),
);
planet.position.set(-100, 75, -170);
scene.add(planet);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(34, 49, 64),
  new THREE.MeshBasicMaterial({ color: 0xc4a98d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false }),
);
ring.position.copy(planet.position);
ring.rotation.x = 0.9;
ring.rotation.y = -0.3;
scene.add(ring);

const stars = (() => {
  const points: number[] = [];
  const srng = new Rng(9);
  for (let i = 0; i < 900; i++) {
    const theta = srng.range(0, Math.PI * 2);
    const phi = Math.acos(srng.range(0.05, 1));
    const r = 500;
    points.push(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(theta) * r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.Points(
    g,
    new THREE.PointsMaterial({ color: 0xc9f4ef, size: 1.4, transparent: true, opacity: 0.85, depthWrite: false }),
  );
})();
scene.add(stars);

const clock = new THREE.Clock();
let orbit = 0;
function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  orbit += dt * 0.035;
  camera.position.set(Math.cos(orbit) * 27, 10 + Math.sin(orbit * 0.7) * 3, Math.sin(orbit) * 27);
  camera.lookAt(0, 3.2, 0);
  sun.position.set(Math.cos(orbit * 0.5) * 34, 28, Math.sin(orbit * 0.5) * 34);
  warmPulse += dt;
  beaconGlow.intensity = 38 + Math.sin(warmPulse * 5.5) * 8;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
let warmPulse = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.querySelector('#boot-splash')?.remove();
const startButton = document.querySelector<HTMLButtonElement>('#boot-start');
startButton?.addEventListener('click', () => {
  startButton.textContent = 'UPLINK RESERVED // NEXT BUILD';
  startButton.disabled = true;
});

requestAnimationFrame(frame);
