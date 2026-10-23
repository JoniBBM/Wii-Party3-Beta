/**
 * Alien-Vulkan des Weltalls: brodelnder Plasmasee im Krater, ein leuchtender Plasmastrom an der
 * Nordflanke mit Becken, violetter Dampf und türkises Glühen – je nach Druck heller und unruhiger.
 * Beim Ausbruch fliegen Kristallbrocken und Plasma, und Meteoriten mit Leuchtspur stürzen vom
 * Himmel und schlagen in der Landschaft ein. Gleiche Schnittstelle wie buildVolcano (craterTop!).
 */
import * as THREE from 'three';
import { CRATER, lavaFlowPoints } from '../ground.ts';
import type { IslandLayout } from '../layout.ts';
import type { Effects } from '../particles.ts';
import type { Heightfield } from '../terrain.ts';
import type { VolcanoFx } from '../volcano.ts';
import { GLSL_NOISE } from '../worldfx.ts';
import { crystalGeometry, haloTexture } from './kit.ts';

const PLASMA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform float uFlow;
  varying vec2 vUv;
  varying vec3 vW;
  ${GLSL_NOISE}
  void main() {
    vec2 p = vW.xz * 1.4 + vec2(0.0, -uTime * uFlow);
    float n = fxNoise(p + uTime * 0.15) * 0.6 + fxNoise(p * 2.4 - uTime * 0.35) * 0.4;
    float swirl = smoothstep(0.35, 0.65, n);
    float veins = smoothstep(0.07, 0.0, abs(fxNoise(p * 1.2 + 4.0) - 0.5));
    vec3 mint = vec3(0.25, 1.0, 0.78);
    vec3 teal = vec3(0.05, 0.62, 0.66);
    vec3 violet = vec3(0.42, 0.16, 0.85);
    vec3 col = mix(mint, teal, swirl);
    col = mix(col, violet, smoothstep(0.62, 0.9, n) * (0.8 - uHeat * 0.5));
    col = mix(col, vec3(0.92, 1.0, 0.97), veins * (0.45 + uHeat * 0.55));
    // Ränder des Stroms dunkler (erstarrtes Plasma)
    float edge = uFlow > 0.3 ? smoothstep(0.55, 1.0, abs(vUv.x - 0.5) * 2.0) : 0.0;
    col = mix(col, vec3(0.16, 0.1, 0.32), edge * 0.8);
    float pulse = 0.85 + sin(uTime * 2.2 + vW.x) * 0.15;
    gl_FragColor = vec4(col * (1.0 + uHeat * 1.5) * pulse, 1.0);
  }
`;

const PLASMA_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform float uBubble;
  varying vec2 vUv;
  varying vec3 vW;
  ${GLSL_NOISE}
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    float b = fxNoise(w.xz * 1.3 + uTime * 0.6) * fxNoise(w.xz * 0.7 - uTime * 0.4);
    w.y += b * uBubble * (0.15 + uHeat * 0.4);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

function plasmaMaterial(flow: number, bubble: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0.3 }, uFlow: { value: flow }, uBubble: { value: bubble } },
    vertexShader: PLASMA_VERT,
    fragmentShader: PLASMA_FRAG,
    toneMapped: false,
  });
}

interface Flying {
  mesh: THREE.Object3D;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  /** Meteor: Leuchtspur, Einschlag am Boden */
  meteor: boolean;
  trail: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function buildSpaceVolcano(layout: IslandLayout, effects: Effects, opts: { light: boolean; field?: Heightfield }): VolcanoFx {
  const v = layout.volcano;
  const group = new THREE.Group();
  group.name = 'space-volcano';
  const field = opts.field;
  const ground = (x: number, z: number) => field?.height(x, z) ?? 0;

  // Plasmasee im Krater
  const lakeGeo = new THREE.RingGeometry(0, CRATER.lava + 0.25, 40, 8);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMat = plasmaMaterial(0.05, 1);
  const lake = new THREE.Mesh(lakeGeo, lakeMat);
  lake.position.set(v.x, CRATER.lavaY, v.z);
  group.add(lake);
  const mats = [lakeMat];

  // Plasmastrom an der Nordflanke mit Becken
  if (field) {
    const flow = lavaFlowPoints();
    const pts = flow.map((p) => new THREE.Vector3(p.x, field.height(p.x, p.z), p.z));
    const positions: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[Math.min(pts.length - 1, i + 1)]!;
      const o = pts[Math.max(0, i - 1)]!;
      const dx = q.x - o.x;
      const dz = q.z - o.z;
      const l = Math.hypot(dx, dz) || 1;
      const w = flow[i]!.w;
      for (const side of [-1, 1]) {
        const x = p.x - (dz / l) * w * side;
        const z = p.z + (dx / l) * w * side;
        positions.push(x, Math.max(field.height(x, z), field.height(p.x, p.z)) + 0.12, z);
        uvs.push(side > 0 ? 1 : 0, i / pts.length);
      }
      if (i < pts.length - 1) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    const flowMat = plasmaMaterial(0.6, 0);
    flowMat.polygonOffset = true;
    flowMat.polygonOffsetFactor = -2;
    group.add(new THREE.Mesh(geo, flowMat));
    mats.push(flowMat);
    const end = pts[pts.length - 1]!;
    const poolGeo = new THREE.CircleGeometry(1.5, 28);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = plasmaMaterial(0.08, 0);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(end.x, end.y + 0.09, end.z);
    group.add(pool);
    mats.push(poolMat);
    const poolLight = new THREE.PointLight('#3cffc8', opts.light ? 7 : 0, 9, 1.8);
    poolLight.position.set(end.x, end.y + 1.2, end.z);
    group.add(poolLight);
  }

  const light = new THREE.PointLight('#40ffd0', opts.light ? 26 : 0, 22, 1.6);
  light.position.set(v.x, CRATER.lavaY + 2.5, v.z);
  group.add(light);

  // Fliegende Kristallbrocken und Meteoriten (wiederverwendete Geometrien)
  const shardGeo = crystalGeometry();
  const shardMats = ['#7dffe0', '#ff7ad8', '#b58cff'].map((c) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, flatShading: true });
    m.emissive.set(c);
    m.emissiveIntensity = 1.3;
    return m;
  });
  const meteorGeo = new THREE.IcosahedronGeometry(0.95, 0);
  const meteorMat = new THREE.MeshStandardMaterial({ color: '#5c4a86', roughness: 0.9, flatShading: true });
  meteorMat.emissive.set('#ff6a3c');
  meteorMat.emissiveIntensity = 0.9;
  const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color('#ffb36b').multiplyScalar(1.8), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const flying: Flying[] = [];
  /** Meteoriten, die noch fallen sollen (Sekunden bis zum Start) */
  const queue: { at: number; target: THREE.Vector3 }[] = [];

  let pressure = 0;
  let shownPressure = 0;
  let smokeAcc = 0;
  let flash = 0;
  let clock = 0;
  const craterTop = new THREE.Vector3(v.x, CRATER.lavaY + 0.6, v.z);
  const tmp = new THREE.Vector3();

  /** Dampf aus dem Krater: violett, mit steigendem Druck dichter */
  const steam = (intensity: number) => {
    effects.smoke.emit(1, (p) => {
      const k = 0.75 + (1 - intensity) * 0.2;
      Object.assign(p, {
        x: craterTop.x + rnd(-1, 1),
        y: craterTop.y + 1.2,
        z: craterTop.z + rnd(-1, 1),
        vx: rnd(0.2, 0.7),
        vy: rnd(1.2, 2.2) * (0.7 + intensity),
        vz: rnd(-0.3, 0.3),
        maxLife: rnd(4, 6),
        size: rnd(1.6, 2.4),
        sizeEnd: rnd(5, 8) * (0.8 + intensity * 0.6),
        r: 0.78 * k,
        g: 0.68 * k,
        b: 0.98 * k,
        alpha: 0.32 + intensity * 0.28,
        drag: 0.2,
      });
    });
    if (intensity > 0.4 && Math.random() < intensity * 0.6)
      effects.glow.emit(1, (p) => {
        Object.assign(p, { x: craterTop.x + rnd(-0.8, 0.8), y: craterTop.y + 0.8, z: craterTop.z + rnd(-0.8, 0.8), vx: rnd(-1, 1), vy: rnd(3, 6), vz: rnd(-1, 1), maxLife: rnd(0.6, 1.2), size: rnd(0.3, 0.5), sizeEnd: 0.05, r: 0.3, g: 1, b: 0.8, alpha: 1, gravity: 7 });
      });
  };

  const launchMeteor = (target: THREE.Vector3) => {
    const m = new THREE.Mesh(meteorGeo, meteorMat);
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(4.2);
    m.add(halo);
    // von hoch oben schräg herab, ~2,2 s Flugzeit
    const from = new THREE.Vector3(target.x + rnd(-30, 30), 70 + rnd(0, 15), target.z - rnd(25, 45));
    const t = 2.2;
    const vel = target.clone().sub(from).divideScalar(t);
    m.position.copy(from);
    m.scale.setScalar(rnd(0.7, 1.3));
    group.add(m);
    flying.push({ mesh: m, v: vel, spin: new THREE.Vector3(rnd(1, 4), rnd(1, 4), 0), life: t + 0.5, meteor: true, trail: 0 });
  };

  return {
    group,
    craterTop,
    setPressure(p) {
      pressure = Math.max(0, Math.min(1, p));
    },
    update(t, dt) {
      clock += dt;
      shownPressure += (pressure - shownPressure) * Math.min(1, dt * 1.5);
      flash = Math.max(0, flash - dt * 0.6);
      const heat = Math.min(1, shownPressure + flash);
      for (const m of mats) {
        m.uniforms.uTime!.value = t;
        m.uniforms.uHeat!.value = heat;
      }
      if (opts.light) light.intensity = 16 + heat * 40 + Math.sin(t * 3) * 4;
      smokeAcc += dt * (1.2 + shownPressure * 6);
      while (smokeAcc > 1) {
        smokeAcc -= 1;
        steam(shownPressure);
      }
      // Meteoriten nacheinander starten
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.at > clock) continue;
        launchMeteor(queue[i]!.target);
        queue.splice(i, 1);
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i]!;
        f.life -= dt;
        if (!f.meteor) f.v.y -= 9.8 * dt;
        f.mesh.position.addScaledVector(f.v, dt);
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
        const p = f.mesh.position;
        if (f.meteor) {
          // Leuchtspur: Funken und Rauch hinter dem Meteor
          f.trail += dt;
          while (f.trail > 0.035) {
            f.trail -= 0.035;
            effects.glow.emit(1, (q) => {
              Object.assign(q, { x: p.x + rnd(-0.3, 0.3), y: p.y + rnd(-0.3, 0.3), z: p.z + rnd(-0.3, 0.3), vx: rnd(-0.4, 0.4), vy: rnd(-0.2, 0.4), vz: rnd(-0.4, 0.4), maxLife: rnd(0.7, 1.2), size: rnd(1.4, 2.4), sizeEnd: 0.2, r: 1, g: rnd(0.45, 0.7), b: rnd(0.2, 0.5), alpha: 1, drag: 1 });
            });
          }
          if (Math.random() < 0.5)
            effects.smoke.emit(1, (q) => {
              Object.assign(q, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0.3, vz: 0, maxLife: rnd(1.4, 2.2), size: 1.2, sizeEnd: rnd(3, 4.5), r: 0.55, g: 0.45, b: 0.78, alpha: 0.55, drag: 0.5 });
            });
        }
        const g = ground(p.x, p.z);
        const hit = f.meteor && p.y <= Math.max(g, 0) + 0.2;
        if (f.life <= 0 || hit || p.y < -2) {
          if (hit) {
            // Einschlag: Lichtblitz, Funken, Staub, kleine Kristallsplitter
            const gy = Math.max(g, 0);
            effects.smoke.emit(26, (q) => {
              const a = Math.random() * Math.PI * 2;
              const s = rnd(1.5, 4);
              Object.assign(q, { x: p.x, y: gy + 0.3, z: p.z, vx: Math.cos(a) * s, vy: rnd(0.5, 2.5), vz: Math.sin(a) * s, maxLife: rnd(1.2, 2.2), size: rnd(1, 1.6), sizeEnd: rnd(3, 5), r: 0.72, g: 0.62, b: 0.92, alpha: 0.6, drag: 2 });
            });
            effects.sparkle(p.x, gy, p.z, new THREE.Color('#ffd27a'), 30, 2.4);
            effects.glow.emit(60, (q) => {
              const a = Math.random() * Math.PI * 2;
              const s = rnd(2, 7);
              Object.assign(q, { x: p.x, y: gy + 0.3, z: p.z, vx: Math.cos(a) * s, vy: rnd(3, 8), vz: Math.sin(a) * s, maxLife: rnd(0.7, 1.2), size: rnd(0.6, 1.2), sizeEnd: 0.05, r: 1, g: rnd(0.4, 0.7), b: 0.3, alpha: 1, gravity: 9 });
            });
            if (g < 0.1) effects.splash(p.x, 0, p.z, true);
          } else if (!f.meteor && f.life > -1 && p.y > -1) effects.dust(p.x, p.y, p.z, new THREE.Color('#b9a8ff'), 6);
          f.mesh.removeFromParent();
          flying.splice(i, 1);
        }
      }
    },
    erupt() {
      // Plasma-Fontäne: türkise und rosa Glut statt Lava, dazu eine violette Dampfwolke
      effects.glow.emit(320, (p) => {
        const a = Math.random() * Math.PI * 2;
        const s = rnd(2, 10);
        const pink = Math.random() < 0.3;
        Object.assign(p, { x: craterTop.x + rnd(-1, 1), y: craterTop.y + 1.5, z: craterTop.z + rnd(-1, 1), vx: Math.cos(a) * s, vy: rnd(8, 20), vz: Math.sin(a) * s, maxLife: rnd(1.8, 3.2), size: rnd(1.4, 2.6), sizeEnd: 0.4, r: pink ? 1 : rnd(0.05, 0.2), g: pink ? rnd(0.2, 0.35) : 1, b: pink ? 0.8 : rnd(0.55, 0.75), alpha: 1, gravity: 9.8, drag: 0.1 });
      });
      effects.smoke.emit(120, (p) => {
        const a = Math.random() * Math.PI * 2;
        const s = rnd(0.5, 3);
        Object.assign(p, { x: craterTop.x, y: craterTop.y + rnd(1.5, 3.5), z: craterTop.z, vx: Math.cos(a) * s, vy: rnd(3, 8), vz: Math.sin(a) * s, maxLife: rnd(4, 7), size: rnd(4, 7), sizeEnd: rnd(12, 20), r: 0.42, g: 0.3, b: 0.68, alpha: 0.8, drag: 0.5 });
      });
      // Kristallbrocken fliegen aus dem Krater
      for (let i = 0; i < 28; i++) {
        const m = new THREE.Mesh(shardGeo, shardMats[i % shardMats.length]!);
        m.scale.setScalar(rnd(1.0, 1.9));
        m.position.copy(craterTop).add(tmp.set(rnd(-1, 1), 1.2, rnd(-1, 1)));
        const a = Math.random() * Math.PI * 2;
        const s = rnd(3, 9);
        group.add(m);
        flying.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * s, rnd(9, 19), Math.sin(a) * s), spin: new THREE.Vector3(rnd(0, 6), rnd(0, 6), 0), life: rnd(2.4, 3.8), meteor: false, trail: 0 });
      }
      // Meteoriten schlagen rund um den Vulkan ein (nicht auf dem Weg: dort stehen Figuren)
      for (let k = 0; k < 9; k++) {
        let target: THREE.Vector3 | null = null;
        for (let tries = 0; tries < 20 && !target; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = rnd(14, 42);
          const x = v.x + Math.cos(a) * r;
          const z = v.z + Math.sin(a) * r * 0.85;
          if (field && field.pathDistance(x, z) < 3) continue;
          target = new THREE.Vector3(x, Math.max(0, ground(x, z)), z);
        }
        if (target) queue.push({ at: clock + 0.3 + k * 0.35 + Math.random() * 0.25, target });
      }
      flash = 1;
      shownPressure = 1;
      pressure = 0;
    },
  };
}
