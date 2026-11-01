import * as THREE from 'three';
import { Rng } from '../core/Rng';

interface Particle {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  gravity: number;
  drag: number;
  shrink: boolean;
}

interface Tracer {
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  life: number;
  maxLife: number;
}

interface Slash {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

export interface BurstOptions {
  speed?: number;
  spread?: number;
  gravity?: number;
  size?: number;
  life?: number;
  upward?: number;
  drag?: number;
  shrink?: boolean;
}

const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float mask = smoothstep(0.5, 0.12, d);
    gl_FragColor = vec4(vColor * vAlpha, vAlpha * mask);
  }
`;

export class FX {
  private readonly scene: THREE.Scene;
  private readonly particles: Particle[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly maxParticles = 900;
  private readonly tracers: Tracer[] = [];
  private readonly slashes: Slash[] = [];
  private readonly rng = new Rng('fx');
  private readonly slashGeometry = new THREE.TorusGeometry(1.15, 0.035, 4, 24, Math.PI * 1.15);
  private readonly particleMaterial: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.alphas = new Float32Array(this.maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);

    this.particleMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(this.geometry, this.particleMaterial);
    points.frustumCulled = false;
    points.renderOrder = 8;
    scene.add(points);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        color: new THREE.Color(1, 1, 1),
        gravity: 0,
        drag: 0,
        shrink: true,
      });
    }
  }

  private acquire(): Particle | null {
    for (const particle of this.particles) {
      if (!particle.active) return particle;
    }
    return null;
  }

  burst(position: THREE.Vector3, color: THREE.ColorRepresentation, count: number, options: BurstOptions = {}): void {
    const speed = options.speed ?? 3.5;
    const spread = options.spread ?? 1;
    const gravity = options.gravity ?? -4;
    const size = options.size ?? 0.1;
    const life = options.life ?? 0.7;
    const upward = options.upward ?? 0.4;
    const drag = options.drag ?? 0.92;
    const shrink = options.shrink ?? true;

    for (let i = 0; i < count; i++) {
      const particle = this.acquire();
      if (!particle) break;
      particle.active = true;
      particle.position.copy(position);
      particle.position.x += this.rng.range(-0.15, 0.15);
      particle.position.z += this.rng.range(-0.15, 0.15);
      particle.velocity.set(
        this.rng.range(-1, 1) * speed * spread,
        this.rng.range(0.2, 1.25) * speed * upward,
        this.rng.range(-1, 1) * speed * spread,
      );
      particle.maxLife = life * this.rng.range(0.55, 1.25);
      particle.life = particle.maxLife;
      particle.size = size * this.rng.range(0.55, 1.4);
      particle.color.set(color);
      particle.gravity = gravity;
      particle.drag = drag;
      particle.shrink = shrink;
    }
  }

  impact(position: THREE.Vector3, color: THREE.ColorRepresentation = 0xffd18a): void {
    this.burst(position, color, 8, {
      speed: 2.3,
      life: 0.35,
      size: 0.065,
      gravity: -5,
      upward: 0.4,
    });
  }

  gather(position: THREE.Vector3, color: THREE.ColorRepresentation): void {
    this.burst(position.clone().add(new THREE.Vector3(0, 0.7, 0)), color, 14, {
      speed: 1.9,
      life: 0.65,
      size: 0.075,
      gravity: -1.2,
      upward: 0.9,
    });
  }

  muzzle(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.burst(position, 0xffd9a0, 7, {
      speed: 2.2,
      life: 0.18,
      size: 0.06,
      gravity: 0,
      upward: 0.2,
    });
    const end = position.clone().addScaledVector(direction, 1.2);
    this.tracer(position, end, 0xffd9a0, 0.7);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation = 0x8fffe8, opacity = 0.75): void {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 7;
    this.scene.add(line);
    this.tracers.push({ line, material, life: 0.08, maxLife: 0.08 });
  }

  slash(position: THREE.Vector3, yaw: number): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0xa7fff0,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.slashGeometry, material);
    mesh.position.copy(position);
    mesh.position.y += 1.2;
    mesh.rotation.set(0.18, yaw + Math.PI * 0.5, -0.7);
    mesh.scale.setScalar(1.25);
    mesh.renderOrder = 6;
    this.scene.add(mesh);
    this.slashes.push({ mesh, material, life: 0.2, maxLife: 0.2 });
  }

  ember(position: THREE.Vector3): void {
    this.burst(position, 0xff9b4f, 1, {
      speed: 0.8,
      life: 1.4,
      size: 0.06,
      gravity: 1.2,
      upward: 1.1,
      spread: 0.35,
    });
  }

  update(dt: number): void {
    let write = 0;
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.velocity.y += particle.gravity * dt;
      particle.velocity.multiplyScalar(Math.pow(particle.drag, dt * 60));
      particle.position.addScaledVector(particle.velocity, dt);
      const t = Math.max(0, particle.life / particle.maxLife);
      const alpha = Math.min(1, t * 1.8);
      this.positions[write * 3] = particle.position.x;
      this.positions[write * 3 + 1] = particle.position.y;
      this.positions[write * 3 + 2] = particle.position.z;
      this.colors[write * 3] = particle.color.r;
      this.colors[write * 3 + 1] = particle.color.g;
      this.colors[write * 3 + 2] = particle.color.b;
      this.sizes[write] = particle.size * (particle.shrink ? 0.45 + t * 0.9 : 1);
      this.alphas[write] = alpha;
      write++;
    }
    this.geometry.setDrawRange(0, write);
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i] as Tracer;
      tracer.life -= dt;
      tracer.material.opacity = Math.max(0, tracer.life / tracer.maxLife) * 0.8;
      if (tracer.life <= 0) {
        this.scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        tracer.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const slash = this.slashes[i] as Slash;
      slash.life -= dt;
      slash.material.opacity = Math.max(0, slash.life / slash.maxLife) * 0.68;
      slash.mesh.scale.addScalar(dt * 1.6);
      if (slash.life <= 0) {
        this.scene.remove(slash.mesh);
        slash.material.dispose();
        this.slashes.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const particle of this.particles) particle.active = false;
    this.geometry.setDrawRange(0, 0);
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.material.dispose();
    }
    this.tracers.length = 0;
    for (const slash of this.slashes) {
      this.scene.remove(slash.mesh);
      slash.material.dispose();
    }
    this.slashes.length = 0;
  }

  dispose(): void {
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.material.dispose();
    }
    for (const slash of this.slashes) {
      this.scene.remove(slash.mesh);
      slash.material.dispose();
    }
    this.slashGeometry.dispose();
    this.geometry.dispose();
    this.particleMaterial.dispose();
  }
}
