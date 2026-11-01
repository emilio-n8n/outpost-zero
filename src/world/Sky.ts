import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { daylight, moonDirection, nightStrength, skyPalette, sunDirection } from '../game/daynight';

const skyVertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const skyFragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vDir;

  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunColor;
  uniform vec3 uDuskColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uDaylight;
  uniform float uNight;
  uniform float uDusk;
  uniform float uAurora;
  uniform float uTime;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm21(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += noise21(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float up = smoothstep(-0.18, 0.04, dir.y);
    vec3 color = mix(uBottom, uHorizon, up);
    color = mix(color, uTop, smoothstep(0.0, 0.72, dir.y));

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float sunCore = smoothstep(0.9992, 0.99955, sunDot);
    float sunHalo = pow(sunDot, 18.0) * 0.28 + pow(sunDot, 180.0) * 0.8;
    color += uSunColor * (sunCore * 2.4 + sunHalo) * (0.22 + uDaylight * 0.78);

    float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
    float moonCore = smoothstep(0.99955, 0.99982, moonDot);
    color += vec3(0.62, 0.76, 0.95) * moonCore * uNight * 1.75;
    color += vec3(0.20, 0.32, 0.5) * pow(moonDot, 90.0) * uNight * 0.2;

    float horizonBand = exp(-abs(dir.y) * 9.0);
    float sunSide = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 3.0);
    color = mix(color, uDuskColor, uDusk * horizonBand * (0.22 + sunSide * 0.66));

    if (uAurora > 0.01 && dir.y > 0.03) {
      float az = atan(dir.z, dir.x);
      vec2 auroraUv = vec2(az * 1.8 + uTime * 0.012, dir.y * 3.5 - uTime * 0.018);
      float broad = fbm21(auroraUv * 1.45);
      float veil = smoothstep(0.34, 0.68, broad);
      float curtain = smoothstep(0.04, 0.2, dir.y) * (1.0 - smoothstep(0.58, 0.9, dir.y));
      float ribbon = sin(az * 7.0 + sin(az * 3.2) * 2.2 + uTime * 0.12) * 0.5 + 0.5;
      float streak = smoothstep(0.48, 0.94, ribbon) * veil * curtain;
      float fine = smoothstep(0.55, 0.92, fbm21(auroraUv * 3.7 + 11.0));
      float wash = smoothstep(0.04, 0.14, dir.y) * (1.0 - smoothstep(0.25, 0.5, dir.y)) * smoothstep(0.28, 0.8, broad);
      vec3 auroraColor = mix(vec3(0.08, 0.95, 0.68), vec3(0.48, 0.24, 0.98), 0.35 + broad * 0.3);
      color += auroraColor * (streak * 1.35 + fine * streak * 0.6 + wash * 0.32) * uAurora;
    }

    float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
    color += vec3(dither);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function makePlanetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#6b5b58');
  gradient.addColorStop(0.18, '#a47d6f');
  gradient.addColorStop(0.34, '#82645c');
  gradient.addColorStop(0.52, '#c19a7f');
  gradient.addColorStop(0.7, '#725951');
  gradient.addColorStop(0.86, '#a9826d');
  gradient.addColorStop(1, '#5a4a46');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rng = new Rng('planet-bands');
  for (let i = 0; i < 90; i++) {
    const y = rng.range(0, canvas.height);
    const height = rng.range(1, 8);
    ctx.globalAlpha = rng.range(0.025, 0.12);
    ctx.fillStyle = rng.chance(0.55) ? '#f0cdb0' : '#3e3137';
    ctx.beginPath();
    ctx.ellipse(rng.range(0, canvas.width), y, rng.range(30, 230), height, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 210, 180, 0.45)');
    gradient.addColorStop(0.4, 'rgba(255, 180, 140, 0.13)');
    gradient.addColorStop(1, 'rgba(255, 160, 120, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Sky {
  readonly group: THREE.Group;
  private readonly domeMaterial: THREE.ShaderMaterial;
  private readonly starMaterial: THREE.PointsMaterial;
  private readonly starMaterialFar: THREE.PointsMaterial;
  private readonly planet: THREE.Group;
  private readonly glowSprite: THREE.Sprite;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'sky';
    scene.add(this.group);

    const palette = skyPalette(0.8);
    this.domeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(palette.top) },
        uHorizon: { value: new THREE.Color(palette.horizon) },
        uBottom: { value: new THREE.Color(palette.bottom) },
        uSunColor: { value: new THREE.Color(palette.sun) },
        uDuskColor: { value: new THREE.Color(0xff6f45) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uDaylight: { value: 0 },
        uNight: { value: 1 },
        uDusk: { value: 1 },
        uAurora: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), this.domeMaterial);
    dome.renderOrder = -100;
    dome.frustumCulled = false;
    this.group.add(dome);

    const starPositions: number[] = [];
    const farPositions: number[] = [];
    const rng = new Rng('outpost-zero-stars');
    for (let i = 0; i < 1500; i++) {
      const azimuth = rng.range(0, Math.PI * 2);
      const elevation = Math.acos(rng.range(0.02, 1));
      const radius = 560;
      starPositions.push(
        Math.sin(elevation) * Math.cos(azimuth) * radius,
        Math.cos(elevation) * radius,
        Math.sin(elevation) * Math.sin(azimuth) * radius,
      );
    }
    for (let i = 0; i < 250; i++) {
      const azimuth = rng.range(0, Math.PI * 2);
      const elevation = Math.acos(rng.range(0.25, 1));
      const radius = 570;
      farPositions.push(
        Math.sin(elevation) * Math.cos(azimuth) * radius,
        Math.cos(elevation) * radius,
        Math.sin(elevation) * Math.sin(azimuth) * radius,
      );
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xcdf9f2,
      size: 1.65,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const stars = new THREE.Points(starGeometry, this.starMaterial);
    stars.renderOrder = -98;
    stars.frustumCulled = false;
    this.group.add(stars);

    const farGeometry = new THREE.BufferGeometry();
    farGeometry.setAttribute('position', new THREE.Float32BufferAttribute(farPositions, 3));
    this.starMaterialFar = new THREE.PointsMaterial({
      color: 0x9bd9ff,
      size: 2.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const farStars = new THREE.Points(farGeometry, this.starMaterialFar);
    farStars.renderOrder = -97;
    farStars.frustumCulled = false;
    this.group.add(farStars);

    this.planet = new THREE.Group();
    this.planet.position.set(-210, 60, -335);
    this.planet.renderOrder = -99;
    const planetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(42, 40, 28),
      new THREE.MeshBasicMaterial({
        map: makePlanetTexture(),
        fog: false,
        toneMapped: false,
      }),
    );
    this.planet.add(planetMesh);

    const rings = new THREE.Mesh(
      new THREE.RingGeometry(56, 80, 96),
      new THREE.MeshBasicMaterial({
        color: 0xc9aa8d,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    rings.rotation.set(1.12, 0.18, -0.16);
    this.planet.add(rings);

    const ringDust = new THREE.Mesh(
      new THREE.RingGeometry(51, 86, 96),
      new THREE.MeshBasicMaterial({
        color: 0x9f8b7d,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      }),
    );
    ringDust.rotation.copy(rings.rotation);
    this.planet.add(ringDust);

    this.glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.glowSprite.scale.set(170, 170, 1);
    this.glowSprite.position.copy(this.planet.position);
    this.glowSprite.renderOrder = -100;
    this.group.add(this.glowSprite);
    this.group.add(this.planet);
  }

  update(camera: THREE.Camera, clock: number, elapsed: number, night = nightStrength(clock)): void {
    this.group.position.copy(camera.position);
    const palette = skyPalette(clock);
    const sun = sunDirection(clock);
    const moon = moonDirection(clock);
    const uniforms = this.domeMaterial.uniforms;
    (uniforms.uTop?.value as THREE.Color).setHex(palette.top);
    (uniforms.uHorizon?.value as THREE.Color).setHex(palette.horizon);
    (uniforms.uBottom?.value as THREE.Color).setHex(palette.bottom);
    (uniforms.uSunColor?.value as THREE.Color).setHex(palette.sun);
    (uniforms.uSunDir?.value as THREE.Vector3).set(sun.x, sun.y, sun.z);
    (uniforms.uMoonDir?.value as THREE.Vector3).set(moon.x, moon.y, moon.z);
    uniforms.uDaylight!.value = daylight(clock);
    uniforms.uNight!.value = night;
    uniforms.uDusk!.value = Math.max(0, 1 - Math.abs(sun.y) * 4.2);
    uniforms.uAurora!.value = night * 0.95;
    uniforms.uTime!.value = elapsed;

    this.starMaterial.opacity = Math.pow(night, 1.4) * 0.9;
    this.starMaterialFar.opacity = Math.pow(night, 1.6) * 0.75;
    this.glowSprite.material.opacity = 0.32 + night * 0.28;
    this.planet.rotation.y = elapsed * 0.0015;
    this.planet.rotation.z = -0.08;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry.dispose();
        const material = child.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      }
    });
    this.glowSprite.material.map?.dispose();
    this.glowSprite.material.dispose();
  }
}
