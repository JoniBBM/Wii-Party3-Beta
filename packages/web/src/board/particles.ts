/** Leichtgewichtiges Partikelsystem (Rauch, Funken, Konfetti, Lava, Staub). */
import * as THREE from 'three';

export type ParticleShape = 'soft' | 'confetti' | 'star';

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  sizeEnd: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  gravity: number;
  drag: number;
  angle: number;
  spin: number;
}

const vertex = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  attribute float aAngle;
  varying vec4 vColor;
  varying float vAngle;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vAngle = aAngle;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = (shape: ParticleShape) => /* glsl */ `
  varying vec4 vColor;
  varying float vAngle;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vAngle), s = sin(vAngle);
    p = mat2(c, -s, s, c) * p;
    float a = 1.0;
    ${
      shape === 'confetti'
        ? 'float w = abs(cos(vAngle * 1.7)) * 0.32 + 0.06; a = step(abs(p.x), w) * step(abs(p.y), 0.18);'
        : shape === 'star'
          ? 'float r = length(p); float ang = atan(p.y, p.x); float star = 0.18 + 0.16 * pow(abs(cos(ang * 2.0)), 6.0); a = smoothstep(star, star - 0.08, r) + smoothstep(0.5, 0.0, r) * 0.35;'
          : 'float r = length(p); a = smoothstep(0.5, 0.0, r); a *= a;'
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
    #include <colorspace_fragment>
  }
`;

export class ParticleSystem {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private angles: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(
    private max: number,
    shape: ParticleShape,
    opts: { additive?: boolean; depthWrite?: boolean } = {},
  ) {
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 4);
    this.sizes = new Float32Array(max);
    this.angles = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAngle', new THREE.BufferAttribute(this.angles, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment(shape),
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: opts.depthWrite ?? false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setScale(viewportHeight: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale!.value = viewportHeight * 0.75;
  }

  emit(count: number, init: (p: Particle, i: number) => void) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.max) this.particles.shift();
      const p: Particle = {
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1, sizeEnd: 1,
        r: 1, g: 1, b: 1, alpha: 1, gravity: 0, drag: 0, angle: Math.random() * 6.28, spin: 0,
      };
      init(p, i);
      this.particles.push(p);
    }
  }

  get count() {
    return this.particles.length;
  }

  update(dt: number) {
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.vy -= p.gravity * dt;
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.vz *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.angle += p.spin * dt;
      alive.push(p);
    }
    this.particles = alive;
    alive.forEach((p, i) => {
      const t = p.life / p.maxLife;
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      const fadeIn = Math.min(1, t * 8);
      const fadeOut = 1 - Math.pow(t, 2.2);
      this.colors[i * 4] = p.r;
      this.colors[i * 4 + 1] = p.g;
      this.colors[i * 4 + 2] = p.b;
      this.colors[i * 4 + 3] = p.alpha * fadeIn * fadeOut;
      this.sizes[i] = p.size + (p.sizeEnd - p.size) * t;
      this.angles[i] = p.angle;
    });
    this.geo.setDrawRange(0, alive.length);
    for (const name of ['position', 'aColor', 'aSize', 'aAngle']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Fertige Effekte */
export class Effects {
  readonly group = new THREE.Group();
  readonly smoke = new ParticleSystem(500, 'soft');
  readonly glow = new ParticleSystem(700, 'soft', { additive: true });
  readonly confetti = new ParticleSystem(900, 'confetti', { depthWrite: false });
  readonly stars = new ParticleSystem(300, 'star', { additive: true });

  constructor() {
    this.group.add(this.smoke.points, this.glow.points, this.confetti.points, this.stars.points);
  }

  setScale(h: number) {
    for (const s of [this.smoke, this.glow, this.confetti, this.stars]) s.setScale(h);
  }

  update(dt: number) {
    this.smoke.update(dt);
    this.glow.update(dt);
    this.confetti.update(dt);
    this.stars.update(dt);
  }

  /** Staubwolke beim Landen */
  dust(x: number, y: number, z: number, color = new THREE.Color('#e9d6a8'), n = 10) {
    this.smoke.emit(n, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.8, 1.6);
      Object.assign(p, { x, y: y + 0.1, z, vx: Math.cos(a) * s, vy: rnd(0.3, 0.9), vz: Math.sin(a) * s, maxLife: rnd(0.6, 1), size: rnd(0.5, 0.8), sizeEnd: rnd(1.4, 2), r: color.r, g: color.g, b: color.b, alpha: 0.55, drag: 3 });
    });
  }

  /** Funkelnde Sterne (Sieg, Gipfel, Befreiung) */
  sparkle(x: number, y: number, z: number, color = new THREE.Color('#fff3a0'), n = 24, spread = 1.4) {
    this.stars.emit(n, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.5, 2.2) * spread;
      Object.assign(p, { x, y: y + rnd(0.3, 1.4), z, vx: Math.cos(a) * s, vy: rnd(1, 3), vz: Math.sin(a) * s, maxLife: rnd(0.8, 1.6), size: rnd(0.5, 0.9), sizeEnd: 0.1, r: color.r, g: color.g, b: color.b, alpha: 1, gravity: 2.5, drag: 1.2, spin: rnd(-4, 4) });
    });
  }

  /** Konfetti-Regen */
  confettiBurst(x: number, y: number, z: number, colors: string[], n = 160, power = 1) {
    const cs = colors.map((c) => new THREE.Color(c));
    this.confetti.emit(n, (p, i) => {
      const c = cs[i % cs.length]!;
      const a = Math.random() * Math.PI * 2;
      const s = rnd(1, 5) * power;
      Object.assign(p, { x, y, z, vx: Math.cos(a) * s, vy: rnd(5, 10) * power, vz: Math.sin(a) * s, maxLife: rnd(2.5, 4), size: rnd(0.35, 0.55), sizeEnd: rnd(0.3, 0.5), r: c.r, g: c.g, b: c.b, alpha: 1, gravity: 6, drag: 1.6, spin: rnd(-10, 10) });
    });
  }

  /** Feuerwerk */
  firework(x: number, y: number, z: number, color: string) {
    const c = new THREE.Color(color);
    this.glow.emit(70, (p) => {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = rnd(5, 7);
      Object.assign(p, { x, y, z, vx: r * Math.cos(a) * s, vy: u * s, vz: r * Math.sin(a) * s, maxLife: rnd(1.1, 1.6), size: rnd(0.5, 0.7), sizeEnd: 0.05, r: c.r, g: c.g, b: c.b, alpha: 1, gravity: 3, drag: 1.4 });
    });
    this.stars.emit(14, (p) => {
      Object.assign(p, { x: x + rnd(-1, 1), y: y + rnd(-1, 1), z: z + rnd(-1, 1), maxLife: rnd(0.6, 1.2), size: rnd(0.6, 1), sizeEnd: 0, r: 1, g: 1, b: 0.85, alpha: 1 });
    });
  }

  /** Rauch aus dem Krater (je nach Druck dichter und dunkler) */
  volcanoSmoke(x: number, y: number, z: number, intensity: number) {
    const dark = 0.35 + (1 - intensity) * 0.45;
    this.smoke.emit(1, (p) => {
      Object.assign(p, { x: x + rnd(-1, 1), y, z: z + rnd(-1, 1), vx: rnd(0.2, 0.7), vy: rnd(1.2, 2.2) * (0.7 + intensity), vz: rnd(-0.3, 0.3), maxLife: rnd(4, 6), size: rnd(1.6, 2.4), sizeEnd: rnd(5, 8) * (0.8 + intensity * 0.6), r: dark, g: dark * 0.97, b: dark * 0.95, alpha: 0.35 + intensity * 0.3, drag: 0.2 });
    });
    if (intensity > 0.4 && Math.random() < intensity * 0.6) {
      this.glow.emit(1, (p) => {
        Object.assign(p, { x: x + rnd(-0.8, 0.8), y: y - 0.4, z: z + rnd(-0.8, 0.8), vx: rnd(-1, 1), vy: rnd(3, 6), vz: rnd(-1, 1), maxLife: rnd(0.6, 1.2), size: rnd(0.3, 0.5), sizeEnd: 0.05, r: 1, g: rnd(0.35, 0.6), b: 0.1, alpha: 1, gravity: 7 });
      });
    }
  }

  /** Ausbruch: Lavabomben und große Rauchwolke */
  eruption(x: number, y: number, z: number) {
    this.glow.emit(320, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(2, 10);
      Object.assign(p, { x: x + rnd(-1, 1), y, z: z + rnd(-1, 1), vx: Math.cos(a) * s, vy: rnd(8, 20), vz: Math.sin(a) * s, maxLife: rnd(1.8, 3.2), size: rnd(1.1, 2.2), sizeEnd: 0.4, r: 1, g: rnd(0.3, 0.65), b: rnd(0.02, 0.12), alpha: 1, gravity: 9.8, drag: 0.1 });
    });
    this.smoke.emit(120, (p) => {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.5, 3);
      Object.assign(p, { x, y: y + rnd(0, 2), z, vx: Math.cos(a) * s, vy: rnd(3, 8), vz: Math.sin(a) * s, maxLife: rnd(4, 7), size: rnd(4, 7), sizeEnd: rnd(12, 20), r: 0.3, g: 0.27, b: 0.26, alpha: 0.75, drag: 0.5 });
    });
  }

  dispose() {
    for (const s of [this.smoke, this.glow, this.confetti, this.stars]) s.dispose();
  }
}
