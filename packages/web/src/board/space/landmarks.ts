/**
 * Wahrzeichen des Alien-Planeten (Gegenstücke zur Insel): Mondbasis am Landeplatz (statt Hafendorf),
 * Kristalltempel mit Kuppel (statt Stufenpyramide), Leuchtsäulen am Weg (statt Säulenallee),
 * Sternentor, Antennenmast mit Schüssel und Leuchtfeuer (statt Leuchtturm), Metallbrücke mit
 * Leuchtgeländer über die Schlucht, Kabel-Geländer an den Klippen, Metall-Leiter in den Krater,
 * Raketenrampe mit Rakete am Gipfel (Ziel), Kristallbogen, Raumschiff-Wrack, kreisende Raumschiffe,
 * Energiebogen am Plasmafall, Forschungslager, Monolith-Ruine auf der Hochebene.
 */
import * as THREE from 'three';
import { RIVER, RIVER_POOL, VOLCANO } from '@insel/shared';
import type { Emitter } from '../ambient.ts';
import { placeModel, type Placement } from '../assets.ts';
import { CRATER } from '../ground.ts';
import type { KeepOut, LandmarkResult } from '../landmarks.ts';
import type { IslandLayout } from '../layout.ts';
import { mergeStatic } from '../merge.ts';
import { noise2, rand } from '../noise.ts';
import type { Heightfield } from '../terrain.ts';
import { inCorridor, stuntCorridors } from '../views.ts';
import { crystalCluster, glowifyAll, glowMat, haloTexture, mat, mesh, rockGeometry } from './kit.ts';
import { KIT_COLORS } from './palette.ts';

const B = (n: string) => `space/base/${n}`;
const K = (n: string) => `space/craft/${n}`;

export const SPACE_LANDMARK_MODELS = [
  ...['base_large', 'dome', 'house_cylinder', 'house_single', 'house_support', 'roof_antenna', 'roof_radar', 'solar_ground', 'solar_structure', 'metal_support'].map(B),
  ...['satelliteDish_large', 'machine_generatorLarge', 'machine_wireless', 'platform_large', 'barrels', 'structure_detailed'].map(B),
  ...['rocket_baseA', 'rocket_fuelA', 'rocket_sidesA', 'rocket_topA', 'rocket_finsA', 'craft_cargoA', 'craft_cargoB', 'craft_speederA', 'craft_speederB', 'craft_racer', 'rover', 'ship_a', 'ship_b'].map(K),
  'nature/statue_head',
];

const METAL = '#e9ebf7';
const METAL_DARK = '#8f8cb8';
const HULL = '#4b4775';
const CYAN = '#5cffe0';
const PINK = '#ff6fcf';

export function buildSpaceLandmarks(models: Map<string, THREE.Group>, field: Heightfield, layout: IslandLayout): LandmarkResult {
  const root = new THREE.Group();
  root.name = 'space-landmarks';
  const R = rand(5150);
  const keepOut: KeepOut[] = [];
  const fires: Emitter[] = [];
  const smokes: Emitter[] = [];
  const perches: THREE.Vector3[] = [];
  const updaters: ((t: number, dt: number) => void)[] = [];
  const extraBlockers: { x: number; z: number; r: number; top: number }[] = [];
  const H = (x: number, z: number) => field.height(x, z);

  const add = (name: string, p: Placement, height?: number, colors: Record<string, string> = KIT_COLORS) => {
    const m = models.get(name);
    if (!m) return null;
    const o = placeModel(m, p, height, { colors });
    root.add(o);
    return o;
  };
  const ground = (x: number, z: number, lift = 0) => ({ x, z, y: H(x, z) + lift });
  const footY = (x: number, z: number, r: number) => {
    let y = Infinity;
    for (let a = 0; a < 8; a++) y = Math.min(y, H(x + Math.cos(a) * r, z + Math.sin(a) * r));
    return Math.min(y, H(x, z));
  };
  /** Lampe: Metallpfosten mit leuchtender Kugel (Partikel wie bei Fackeln, nur in Plasmafarben) */
  const lamp = (x: number, z: number, h = 1.7, color = CYAN) => {
    const y = H(x, z);
    root.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 6), mat(METAL_DARK, { rough: 0.5 }), x, y + h / 2, z));
    root.add(mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.12, 8), mat(HULL), x, y + h, z));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), glowMat(color, 2.2));
    orb.position.set(x, y + h + 0.16, z);
    root.add(orb);
    fires.push({ x, y: y + h + 0.16, z, count: 8, size: 0.45, rise: 0.4, spread: 0.06, life: 0.9 });
  };
  /** Plasma-Feuerschale (statt Lagerfeuer) */
  const brazier = (x: number, z: number) => {
    const p = ground(x, z);
    root.add(mesh(new THREE.CylinderGeometry(0.55, 0.38, 0.4, 8), mat(HULL, { rough: 0.6 }), p.x, p.y + 0.2, p.z));
    root.add(mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 16).rotateX(Math.PI / 2), glowMat(CYAN, 1.8), p.x, p.y + 0.41, p.z));
    fires.push({ x, y: p.y + 0.45, z, count: 24, size: 0.85, rise: 1.1, spread: 0.16, life: 0.9 });
    smokes.push({ x, y: p.y + 1.1, z, count: 12, size: 1.2, rise: 4, spread: 0.5, life: 5 });
    keepOut.push({ x, z, r: 2.2 });
  };

  // =========================================================================
  // Mondbasis am Landeplatz (Hafenbucht)
  // =========================================================================
  {
    const start = layout.fields[0]!;
    // Schwebende Landeplattformen über dem Plasma (statt Steg und Pfahlhütten)
    const pad = (x: number, z: number, s: number, rot: number) => {
      const y = 0.9;
      add(B('platform_large'), { x, y, z, rotY: rot, scale: s }, undefined);
      for (const [dx, dz] of [
        [-0.8, -0.8],
        [0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8],
      ] as const)
        root.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.6, 6), mat(METAL_DARK, { rough: 0.5 }), x + (dx * Math.cos(rot) - dz * Math.sin(rot)) * s, y - 1.3, z + (dx * Math.sin(rot) + dz * Math.cos(rot)) * s));
      root.add(mesh(new THREE.TorusGeometry(s * 0.85, 0.05, 6, 32).rotateX(Math.PI / 2), glowMat(CYAN, 1.6), x, y + s * 0.05 + 0.03, z));
      return y + s * 0.05;
    };
    const p1 = pad(-29.2, 20.4, 2.1, 0.2);
    add(K('craft_cargoA'), { x: -29.2, y: p1, z: 20.4, rotY: 1.2, scale: 1 }, 1.5);
    const p2 = pad(-33.6, 23.8, 1.8, -0.3);
    add(K('craft_speederB'), { x: -33.6, y: p2, z: 23.8, rotY: -0.6, scale: 1 }, 0.9);
    const p3 = pad(-29.6, 16.4, 1.6, 0.5);
    add(K('craft_racer'), { x: -29.6, y: p3, z: 16.4, rotY: 2.2, scale: 1 }, 0.8);
    // Steg aus Metall vom Ufer zu den Plattformen
    const deck = new THREE.BoxGeometry(0.42, 0.08, 1.6);
    for (let x = -23.4; x >= -27.2; x -= 0.44) root.add(mesh(deck, mat(METAL_DARK, { rough: 0.45 }), x, 0.92, 20.3));
    for (let x = -23.6; x >= -27.2; x -= 1.2) root.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6), mat(HULL), x, -0.3, 20.3 - 0.75), mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6), mat(HULL), x, -0.3, 20.3 + 0.75));
    keepOut.push({ x: -29.2, z: 20.4, r: 2.8 }, { x: -33.6, z: 23.8, r: 2.4 }, { x: -29.6, z: 16.4, r: 2.2 });
    // Module der Basis an Land
    const module = (name: string, x: number, z: number, rot: number, h: number, r: number) => {
      const y = footY(x, z, r * 0.6) - 0.05;
      const o = add(B(name), { x, y, z, rotY: rot, scale: 1 }, h);
      if (o) glowifyAll(o, 0.35);
      perches.push(new THREE.Vector3(x, y + h, z));
      keepOut.push({ x, z, r });
      return y;
    };
    module('base_large', -20.4, 13.6, 0.4, 3.0, 3.0);
    module('dome', -14.4, 17.6, 0.8, 2.6, 2.4);
    module('house_cylinder', -24.6, 13.2, -0.2, 2.4, 1.8);
    module('solar_structure', -17.2, 13.2, 0.3, 1.3, 1.6);
    add(B('solar_ground'), { ...ground(-23.0, 10.9), rotY: 0.4, scale: 1 }, 0.8);
    add(B('solar_ground'), { ...ground(-21.4, 10.4), rotY: 0.4, scale: 1 }, 0.8);
    add(B('machine_generatorLarge'), { ...ground(-17.3, 15.4), rotY: 1.9, scale: 1 }, 0.9);
    add(B('barrels'), { ...ground(-22.6, 16.0), rotY: 0.3, scale: 1 }, 0.5);
    add(B('barrels'), { ...ground(-16.3, 11.9), rotY: 2.1, scale: 1 }, 0.45);
    add(K('rover'), { ...ground(-19.0, 10.6), rotY: 2.6, scale: 1 }, 0.9);
    keepOut.push({ x: -17.3, z: 15.4, r: 1.2 }, { x: -22.2, z: 10.6, r: 2 });
    // Begrüßungsschild (Holo-Tafel) und Antenne mit Wimpel am Landeplatz
    {
      const p = ground(start.x - 2.8, start.z + 2.4);
      root.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6), mat(METAL_DARK), p.x, p.y + 0.65, p.z));
      const holo = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(1.2), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      holo.position.set(p.x, p.y + 1.55, p.z);
      holo.rotation.y = 0.9;
      holo.userData.dynamic = true;
      root.add(holo);
      updaters.push((t) => ((holo.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 3) * 0.1));
      add(B('roof_antenna'), { ...ground(start.x + 2.6, start.z - 2.0, -0.1), rotY: 0, scale: 1 }, 3.6);
    }
    brazier(-18.6, 11.6);
    lamp(start.x - 2.6, start.z - 1.4);
    lamp(start.x + 1.0, start.z + 2.9);
    // Radarturm oben auf der Klippe über der Basis
    add(B('metal_support'), { ...ground(-32.4, 9.8, -0.1), rotY: -0.6, scale: 1 }, 2.4);
    add(B('roof_radar'), { ...ground(-32.4, 9.8, 2.2), rotY: -0.6, scale: 1 }, 2.2);
    keepOut.push({ x: -32.4, z: 9.8, r: 1.8 });
    extraBlockers.push({ x: -20.4, z: 13.6, r: 2.6, top: H(-20.4, 13.6) + 3.2 });
  }

  // =========================================================================
  // Kristalltempel mit Kuppel (statt Stufenpyramide) und Leuchtsäulen am Weg
  // =========================================================================
  {
    const px = -3.4;
    const pz = 15.6;
    const size = 7.6;
    const levels = 3;
    const lvlH = 1.15;
    const base = footY(px, pz, size * 0.6) - 0.25;
    const g = new THREE.Group();
    g.position.set(px, base, pz);
    g.rotation.y = 0.32;
    for (let i = 0; i < levels; i++) {
      const s = (size * (1 - i * 0.24)) / 2;
      g.add(mesh(new THREE.CylinderGeometry(s * 0.97, s, lvlH, 6), mat(i % 2 ? '#d9d2f2' : '#f1edfb', { flat: true, rough: 0.6 }), 0, i * lvlH + lvlH / 2, 0));
      // leuchtende Kante oben
      g.add(mesh(new THREE.TorusGeometry(s * 0.97, 0.06, 4, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 6), glowMat(i === levels - 1 ? PINK : CYAN, 1.7), 0, (i + 1) * lvlH + 0.01, 0));
    }
    // Treppe an der Vorderseite (+z)
    const steps = levels * 3;
    const stepH = (levels * lvlH) / steps;
    for (let k = 0; k < steps; k++) {
      const depth = size * 0.5 * 0.86 - (k / steps) * size * 0.5 * 0.62;
      g.add(mesh(new THREE.BoxGeometry(1.6, stepH, 0.5), mat(k % 2 ? '#cfc6ee' : '#e6e0f8', { flat: true }), 0, k * stepH + stepH / 2, depth));
    }
    const topY = levels * lvlH;
    root.add(g);
    // Kuppel mit leuchtendem Kristall darin
    const dome = add(B('dome'), { x: px, y: base + topY - 0.05, z: pz, rotY: 0.32, scale: 1 }, 2.8);
    if (dome) glowifyAll(dome, 0.3);
    const core = new THREE.Mesh(crystalCluster(7, 4), (() => {
      const m = new THREE.MeshStandardMaterial({ color: '#7dffe6', roughness: 0.25, flatShading: true });
      m.emissive.set('#3cf0c8');
      m.emissiveIntensity = 1.4;
      return m;
    })());
    core.scale.setScalar(1.7);
    core.position.set(px, base + topY, pz);
    root.add(core);
    perches.push(new THREE.Vector3(px, base + topY + 2.8, pz));
    keepOut.push({ x: px, z: pz, r: size * 0.78 });
    const fx = Math.sin(0.32);
    const fz = Math.cos(0.32);
    lamp(px + fz * 1.4 + fx * (size / 2 + 0.6), pz - fx * 1.4 + fz * (size / 2 + 0.6), 1.7, PINK);
    lamp(px - fz * 1.4 + fx * (size / 2 + 0.6), pz + fx * 1.4 + fz * (size / 2 + 0.6), 1.7, PINK);

    // Leuchtsäulen entlang des Weges (nicht im Bach, nicht in den Sichtachsen der Lianen-Kamera)
    const views = stuntCorridors(layout, field);
    const ruins = layout.path.filter((p) => p.zone === 'ruins');
    const pylonGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 6);
    const capGeo = new THREE.OctahedronGeometry(0.28, 0);
    for (let i = 4; i < ruins.length - 4; i += 9) {
      const a = ruins[i]!;
      const b = ruins[i + 1]!;
      const hd = Math.atan2(b.z - a.z, b.x - a.x);
      for (const side of [-1, 1]) {
        const off = layout.fieldRadius * 1.6 + 0.8;
        const x = a.x + Math.cos(hd + Math.PI / 2) * off * side;
        const z = a.z + Math.sin(hd + Math.PI / 2) * off * side;
        if (Math.hypot(x - px, z - pz) < size * 0.8) continue;
        if (field.creekDistance(x, z) < 0.7 || inCorridor(views, x, z, H(x, z) + 2.6, 0.5)) continue;
        const y = H(x, z) - 0.1;
        const short = R() < 0.35;
        const h = short ? 0.6 : 1;
        const p = mesh(pylonGeo, mat('#e8e2f8', { flat: true, rough: 0.6 }), x, y + 1.1 * h, z);
        p.scale.y = h;
        root.add(p);
        const cap = new THREE.Mesh(capGeo, glowMat(short ? PINK : CYAN, 2));
        cap.position.set(x, y + 2.2 * h + 0.32, z);
        cap.scale.y = 1.5;
        root.add(cap);
        perches.push(new THREE.Vector3(x, y + 2.2 * h + 0.6, z));
      }
    }
    // Kristall-Obelisk, Sternentor, Alien-Kopf, kleiner Kristall
    {
      const p = ground(4.6, 14.6);
      const ob = mesh(new THREE.CylinderGeometry(0.15, 0.45, 3.4, 4), mat('#c7f9ff', { emissive: '#45d8e8', glow: 0.8, flat: true, rough: 0.25 }), p.x, p.y + 1.6, p.z);
      ob.rotation.y = 0.4;
      root.add(ob);
    }
    {
      const p = ground(9.6, 16.2);
      const gate = new THREE.Group();
      gate.add(mesh(new THREE.TorusGeometry(1.15, 0.2, 8, 24), mat(METAL, { rough: 0.4 })));
      const lightsGeo = new THREE.TorusGeometry(1.15, 0.07, 6, 24);
      gate.add(new THREE.Mesh(lightsGeo, glowMat(PINK, 1.8)).translateZ(0.2));
      // wirbelndes Tor-Innere
      const swirl = new THREE.Mesh(
        new THREE.CircleGeometry(1.0, 40),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: { uTime: { value: 0 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: /* glsl */ `
            uniform float uTime; varying vec2 vUv;
            void main(){
              vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x);
              float s = sin(a * 3.0 + r * 9.0 - uTime * 3.0) * 0.5 + 0.5;
              vec3 col = mix(vec3(0.3, 1.0, 0.9), vec3(1.0, 0.4, 0.9), s) * (1.4 - r * 0.6);
              gl_FragColor = vec4(col, smoothstep(1.0, 0.7, r) * (0.55 + s * 0.35));
            }`,
        }),
      );
      swirl.userData.dynamic = true;
      gate.add(swirl);
      updaters.push((t) => ((swirl.material as THREE.ShaderMaterial).uniforms.uTime!.value = t));
      gate.position.set(p.x, p.y + 1.25, p.z);
      gate.rotation.y = -0.5;
      root.add(gate);
      root.add(mesh(new THREE.BoxGeometry(2.6, 0.25, 0.7), mat(HULL, { flat: true }), p.x, p.y + 0.05, p.z).rotateY(-0.5));
    }
    add('nature/statue_head', { ...ground(-8.6, 20.6, -0.15), rotY: 0.9, scale: 1 }, 2.1, { stone: '#b9a8ee', stoneDark: '#8f7bd0' });
    if (field.creekDistance(-0.4, 21.6) > 0.6) {
      const c = new THREE.Mesh(crystalCluster(3, 3), mat('#ffd2f2', { emissive: PINK, glow: 0.9, flat: true, rough: 0.3 }));
      c.position.copy(new THREE.Vector3(-0.4, H(-0.4, 21.6) - 0.05, 21.6));
      c.scale.setScalar(0.8);
      root.add(c);
    }
    keepOut.push({ x: 4.6, z: 14.6, r: 1.2 }, { x: 9.6, z: 16.2, r: 1.8 }, { x: -8.6, z: 20.6, r: 1.6 });
  }

  // =========================================================================
  // Lagune: Wohnkapsel auf Stelzen, Schwebegleiter
  // =========================================================================
  {
    add(B('house_support'), { x: 31.2, y: -0.6, z: 24.6, rotY: 0.4, scale: 1 }, 1.6);
    const pod = add(B('house_single'), { x: 31.2, y: 0.95, z: 24.6, rotY: 0.4, scale: 1 }, 2.4);
    if (pod) glowifyAll(pod, 0.3);
    add(K('craft_speederA'), { x: 28.8, y: 0.25, z: 25.9, rotY: 1.1, scale: 1 }, 0.55);
    perches.push(new THREE.Vector3(31.2, 3.5, 24.6));
  }

  // =========================================================================
  // Antennenmast mit Schüssel auf dem Nordost-Kap (statt Leuchtturm)
  // =========================================================================
  {
    const lx = 41.6;
    const lz = -13.4;
    const by = footY(lx, lz, 1.8);
    const g = new THREE.Group();
    g.position.set(lx, by, lz);
    g.add(mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.6, 6), mat(HULL, { flat: true }), 0, 0.3, 0));
    const towerH = 8.6;
    // Gittermast: vier schräge Beine mit Querstreben
    const legGeo = new THREE.CylinderGeometry(0.07, 0.1, towerH + 0.2, 5);
    const legs: THREE.Vector3[][] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const bottom = new THREE.Vector3(Math.cos(a) * 1.25, 0.6, Math.sin(a) * 1.25);
      const top = new THREE.Vector3(Math.cos(a) * 0.38, 0.6 + towerH, Math.sin(a) * 0.38);
      legs.push([bottom, top]);
      const leg = mesh(legGeo, mat(METAL, { rough: 0.45 }));
      leg.position.copy(bottom).lerp(top, 0.5);
      leg.lookAt(top);
      leg.rotateX(Math.PI / 2);
      g.add(leg);
    }
    const strutGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 4);
    for (let lvl = 0; lvl < 6; lvl++) {
      const u0 = lvl / 6;
      const u1 = (lvl + 1) / 6;
      for (let k = 0; k < 4; k++) {
        const a = legs[k]![0]!.clone().lerp(legs[k]![1]!, u0);
        const b = legs[(k + 1) % 4]![0]!.clone().lerp(legs[(k + 1) % 4]![1]!, u1);
        const s = mesh(strutGeo, mat(lvl % 2 ? PINK : METAL_DARK, { rough: 0.5 }));
        s.position.copy(a).lerp(b, 0.5);
        s.scale.y = a.distanceTo(b);
        s.lookAt(b);
        s.rotateX(Math.PI / 2);
        g.add(s);
      }
    }
    const topY = 0.6 + towerH;
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.22, 8), mat(HULL), 0, topY + 0.1, 0));
    root.add(g);
    add(B('satelliteDish_large'), { x: lx, y: by + topY + 0.2, z: lz, rotY: 2.2, scale: 1 }, 2.4);
    // Leuchtfeuer (blinkt) und drehender Lichtkegel in Türkis
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowMat('#ff4d6d', 2.4));
    beacon.position.set(lx, by + topY + 2.9, lz);
    beacon.userData.dynamic = true;
    root.add(beacon);
    updaters.push((t) => (beacon.visible = Math.sin(t * 3.2) > -0.2));
    const beamGeo = new THREE.ConeGeometry(1.3, 15, 20, 1, true);
    beamGeo.translate(0, -7.5, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `varying float vX; void main(){ vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vX; void main(){ float a = smoothstep(15.0, 0.0, vX) * 0.16; gl_FragColor = vec4(vec3(0.45,1.0,0.9) * a, a); }`,
    });
    const beam = new THREE.Group();
    beam.userData.dynamic = true;
    beam.position.set(lx, by + topY + 0.9, lz);
    for (const r of [0, Math.PI]) {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.rotation.y = r;
      beam.add(b);
    }
    root.add(beam);
    updaters.push((t) => (beam.rotation.y = t * 0.9));
    perches.push(new THREE.Vector3(lx, by + topY + 0.4, lz));
    keepOut.push({ x: lx, z: lz, r: 3.2 });
    add(B('machine_wireless'), { ...ground(40.4, -18.2), rotY: -2.4, scale: 1 }, 0.9);
    add(B('barrels'), { ...ground(39.4, -9.0), rotY: 1, scale: 1 }, 0.5);
  }

  // =========================================================================
  // Metallbrücke über die Schlucht, Kabel-Geländer an den Klippen
  // =========================================================================
  root.add(buildSpaceBridge(layout));
  root.add(buildCableRails(layout, field));

  // =========================================================================
  // Fluss: treibende Kristallbrocken und Kapseln, Gleiter am Ufer
  // =========================================================================
  {
    const floaters: { o: THREE.Object3D; ph: number; y: number }[] = [];
    const shardMat = new THREE.MeshStandardMaterial({ color: '#a8fff0', roughness: 0.25, flatShading: true });
    shardMat.emissive.set('#3ce8c8');
    shardMat.emissiveIntensity = 0.8;
    const capsuleMat = mat('#f1edfb', { rough: 0.4 });
    for (let k = 0; k < 5; k++) {
      const p = RIVER[8 + (k % 4)]!;
      const o = new THREE.Group();
      if (k % 2 === 0) {
        const c = new THREE.Mesh(crystalCluster(20 + k, 3), shardMat);
        c.scale.setScalar(0.7);
        c.position.y = -0.15;
        o.add(c);
      } else {
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 10), capsuleMat);
        cap.rotation.z = Math.PI / 2;
        o.add(cap, new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 5, 14), glowMat(PINK, 1.6)).rotateY(Math.PI / 2));
      }
      o.rotation.y = R() * 3;
      o.position.set(p.x + (R() - 0.5) * p.w, p.y - 0.02, p.z + (R() - 0.5) * p.w);
      o.userData.dynamic = true;
      root.add(o);
      floaters.push({ o, ph: R() * 6, y: o.position.y });
    }
    updaters.push((t) => {
      for (const f of floaters) {
        f.o.position.y = f.y + Math.sin(t * 1.7 + f.ph) * 0.05;
        f.o.rotation.z = Math.sin(t * 1.3 + f.ph) * 0.06;
      }
    });
    add(K('craft_speederA'), { ...ground(19.2, 0.6, 0.15), rotY: 0.4, scale: 1 }, 0.55);
  }

  // =========================================================================
  // Plasmafall: schimmernder Energiebogen über dem Becken (statt Regenbogen)
  // =========================================================================
  {
    const pool = RIVER[RIVER_POOL]!;
    const rb = new THREE.RingGeometry(3.4, 4.3, 48, 1, 0, Math.PI);
    const rbMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vP;
        void main(){ float r = (length(vP) - 3.4) / 0.9; float a = smoothstep(0.0,0.15,r)*smoothstep(1.0,0.85,r) * smoothstep(0.0, 1.2, vP.y) * (0.2 + 0.08 * sin(uTime * 2.0 + vP.x));
          vec3 c = mix(vec3(1.0, 0.35, 0.85), vec3(0.3, 1.0, 0.85), r);
          c = mix(c, vec3(0.55, 0.45, 1.0), smoothstep(0.4, 0.6, r) * (1.0 - smoothstep(0.6, 0.8, r)));
          gl_FragColor = vec4(c * a, a); }`,
    });
    const arc = new THREE.Mesh(rb, rbMat);
    arc.position.set(pool.x + 1.2, pool.y + 0.4, pool.z + 1.0);
    arc.rotation.y = -0.75;
    arc.renderOrder = 8;
    arc.userData.dynamic = true;
    root.add(arc);
    updaters.push((t) => (rbMat.uniforms.uTime!.value = t));
  }

  // =========================================================================
  // Hochebene im Nordwesten: Monolith-Ruine, Kristallspitzen, Forschungslager
  // =========================================================================
  {
    const tx = -29.2;
    const tz = -21.4;
    const ty = footY(tx, tz, 3.2) - 0.05;
    root.add(mesh(new THREE.BoxGeometry(6.4, 0.35, 4.8), mat('#5a4f86', { flat: true }), tx, ty + 0.17, tz));
    const runes = glowMat(CYAN, 1.8);
    for (let i = 0; i < 4; i++)
      for (const side of [-1, 1]) {
        const x = tx - 2.6 + i * 1.75;
        const z = tz + side * 2.0;
        const broken = (i + (side > 0 ? 1 : 0)) % 3 === 0;
        const h = broken ? 1.6 : 2.8;
        root.add(mesh(new THREE.BoxGeometry(0.55, h, 0.4), mat('#4a416f', { flat: true }), x, ty + 0.3 + h / 2, z));
        const rune = mesh(new THREE.BoxGeometry(0.12, h * 0.7, 0.02), runes, x, ty + 0.3 + h / 2, z + side * 0.21);
        root.add(rune);
        if (!broken) perches.push(new THREE.Vector3(x, ty + 3.2, z));
      }
    root.add(mesh(new THREE.BoxGeometry(6.6, 0.4, 0.6), mat('#5a4f86', { flat: true }), tx + 0.4, ty + 3.3, tz - 2.0));
    const altar = new THREE.Mesh(crystalCluster(11, 4), mat('#c8fff4', { emissive: '#3ce8c8', glow: 1.1, flat: true, rough: 0.25 }));
    altar.position.set(tx, ty + 0.32, tz);
    altar.scale.setScalar(1.2);
    root.add(altar);
    keepOut.push({ x: tx, z: tz, r: 4.4 });
    lamp(tx + 3.6, tz + 2.6);
    lamp(tx + 3.6, tz - 2.6);
    // Kristallspitzen blicken aufs Meer (statt Steinköpfe)
    const spireMat = mat('#ffc6ef', { emissive: '#ff5fc8', glow: 0.75, flat: true, rough: 0.3 });
    for (const [x, z] of [
      [-32.2, -27.4],
      [-35.4, -22.6],
      [-37.6, -16.8],
      [-38.6, -10.8],
    ] as const) {
      const c = new THREE.Mesh(crystalCluster(Math.round(x * z), 5), spireMat);
      c.position.set(x, H(x, z) - 0.2, z);
      c.scale.set(1.8, 2.8, 1.8);
      c.castShadow = true;
      root.add(c);
      keepOut.push({ x, z, r: 1.8 });
    }
    // Forschungslager
    const pod = add(B('house_single'), { ...ground(-14.6, -25.2, -0.05), rotY: 2.2, scale: 1 }, 2.0);
    if (pod) glowifyAll(pod, 0.3);
    brazier(-12.6, -23.2);
    add(B('solar_ground'), { ...ground(-12.0, -21.4), rotY: 1.2, scale: 1 }, 0.7);
    keepOut.push({ x: -14.6, z: -25.2, r: 2.6 });
  }

  // =========================================================================
  // Vulkan: Raketenrampe mit Rakete am Ziel, Antenne, Lampe, Metall-Leiter, Dampf
  // =========================================================================
  {
    const goal = layout.fields[layout.fields.length - 1]!;
    const out = Math.atan2(goal.z - VOLCANO.z, goal.x - VOLCANO.x);
    const gr = layout.fieldRadius * 1.55 + 0.75;
    const at = (a: number, r: number) => ({ x: goal.x + Math.cos(out + a) * r, z: goal.z + Math.sin(out + a) * r });
    // Startrampe: Plattform auf Stützen (hangabwärts), Rakete, Startturm, Lichter
    const c = at(0.12, gr + 1.5);
    const padY = goal.y - 0.25;
    const pad = new THREE.Group();
    pad.position.set(c.x, padY, c.z);
    pad.rotation.y = -out;
    pad.add(mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 8), mat(METAL_DARK, { rough: 0.5, flat: true }), 0, -0.15, 0));
    pad.add(mesh(new THREE.TorusGeometry(1.85, 0.06, 5, 8).rotateX(Math.PI / 2), glowMat('#ffd34d', 1.8), 0, 0.02, 0));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const lx = Math.cos(a) * 1.5;
      const lz = Math.sin(a) * 1.5;
      const ground = H(c.x + Math.cos(a - out) * 1.5, c.z + Math.sin(a - out) * 1.5);
      const len = Math.max(0.3, padY - ground + 0.3);
      pad.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, len, 6), mat(HULL), lx, -len / 2, lz));
    }
    root.add(pad);
    // Rakete aus Kenney-Teilen: Sockel, Treibstofftanks, Mittelteil, Spitze, Flossen
    const rocket = new THREE.Group();
    const s = 1.55;
    let y = 0;
    const part = (name: string, h: number) => {
      const m = models.get(K(name));
      if (!m) return;
      const o = placeModel(m, { x: 0, y, z: 0, rotY: 0, scale: s }, undefined, { colors: { ...KIT_COLORS, metalRed: '#ff4fa8' } });
      rocket.add(o);
      y += h * s;
    };
    part('rocket_finsA', 0);
    part('rocket_baseA', 1.6);
    part('rocket_fuelA', 0.5);
    part('rocket_sidesA', 1.0);
    part('rocket_fuelA', 0.5);
    part('rocket_topA', 0.8);
    rocket.position.set(c.x, padY + 0.02, c.z);
    rocket.name = 'rocket';
    rocket.userData.dynamic = true;
    root.add(rocket);
    // Startturm daneben
    const tw = at(0.12 + 0.42, gr + 3.3);
    for (let k = 0; k < 5; k++) add(B('structure_detailed'), { x: tw.x, y: padY - 0.6 + k * 1.1, z: tw.z, rotY: -out, scale: 1.1 }, undefined);
    // Arm vom Turm zur Rakete
    {
      const a = new THREE.Vector3(tw.x, padY + 4.2, tw.z);
      const b = new THREE.Vector3(c.x, padY + 4.2, c.z);
      const arm = mesh(new THREE.BoxGeometry(0.18, 0.18, a.distanceTo(b)), mat(METAL_DARK, { rough: 0.5 }));
      arm.position.copy(a).lerp(b, 0.5);
      arm.lookAt(b);
      root.add(arm);
    }
    const lampTop = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glowMat('#ff4d6d', 2.4));
    lampTop.position.set(tw.x, padY - 0.6 + 5.6, tw.z);
    lampTop.userData.dynamic = true;
    root.add(lampTop);
    updaters.push((t) => (lampTop.visible = Math.sin(t * 2.6 + 1) > -0.3));
    perches.push(new THREE.Vector3(c.x, padY + y + 0.3, c.z));
    keepOut.push({ x: c.x, z: c.z, r: 2.4 }, { x: tw.x, z: tw.z, r: 1.4 });
    extraBlockers.push({ x: c.x, z: c.z, r: 1.3, top: padY + y }, { x: tw.x, z: tw.z, r: 1.0, top: padY + 5.2 });
    // Antenne mit Wimpel und Lampe neben dem Ziel
    const f1 = at(0.95, gr + 0.2);
    add(B('roof_antenna'), { ...f1, y: H(f1.x, f1.z) - 0.1, rotY: 0, scale: 1 }, 2.8);
    const t1 = at(-0.8, gr);
    lamp(t1.x, t1.z, 1.4, '#ffd34d');
    // Metall-Leiter neben dem Kraterfeld hinab (dort klettern die Figuren heraus)
    const cf = layout.fields[layout.craterField]!;
    const la = Math.atan2(cf.z - VOLCANO.z, cf.x - VOLCANO.x) + 0.62;
    const dir = new THREE.Vector3(Math.cos(la), 0, Math.sin(la));
    const inward = Math.atan2(-dir.z, -dir.x);
    const tx0 = VOLCANO.x + dir.x * (CRATER.crest + 0.1);
    const tz0 = VOLCANO.z + dir.z * (CRATER.crest + 0.1);
    const top = new THREE.Vector3(tx0, H(tx0, tz0) + 0.05, tz0);
    const bottom = new THREE.Vector3(VOLCANO.x + dir.x * (CRATER.ledge - 0.3), CRATER.floorY + 0.05, VOLCANO.z + dir.z * (CRATER.ledge - 0.3));
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.28);
    for (const sgn of [-1, 1]) {
      const a = top.clone().addScaledVector(side, sgn);
      const b = bottom.clone().addScaledVector(side, sgn);
      const m = a.clone().lerp(b, 0.5).addScaledVector(dir, 0.2);
      const curve = new THREE.CatmullRomCurve3([a, m, b]);
      root.add(mesh(new THREE.TubeGeometry(curve, 18, 0.045, 5, false), mat(METAL, { rough: 0.4 })));
    }
    root.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6), mat(METAL_DARK), top.x - side.x * 1.2, top.y + 0.45, top.z - side.z * 1.2));
    root.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6), mat(METAL_DARK), top.x + side.x * 1.2, top.y + 0.45, top.z + side.z * 1.2));
    for (let k = 1; k < 9; k++) {
      const u = k / 9;
      const cc = top.clone().lerp(bottom, u);
      cc.addScaledVector(dir, Math.sin(u * Math.PI) * 0.2);
      const rung = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), k % 3 === 0 ? glowMat(CYAN, 1.5) : mat(METAL_DARK, { rough: 0.4 }), cc.x, cc.y, cc.z);
      rung.rotation.z = Math.PI / 2;
      rung.rotation.y = -inward + Math.PI / 2;
      root.add(rung);
    }
    for (const [a, r] of [
      [-0.6, 9.5],
      [2.3, 8.8],
      [3.6, 10.5],
      [-2.1, 12.5],
    ] as const) {
      const x = VOLCANO.x + Math.cos(a) * r;
      const z = VOLCANO.z + Math.sin(a) * r;
      smokes.push({ x, y: H(x, z) + 0.2, z, count: 12, size: 1.6, rise: 4.5, spread: 0.4, life: 5 });
    }
  }

  // =========================================================================
  // Küste und Meer: Kristallbogen, Raumschiff-Wrack, kreisende Raumschiffe, Kristallspitzen
  // =========================================================================
  root.add(buildCrystalArch(49, -6.8, R));
  {
    const wreck = add(K('craft_cargoB'), { x: -40.5, y: -0.7, z: -31.5, rotY: 0.9, tilt: 0.35, scale: 1 }, 3.4);
    if (wreck) wreck.rotation.z = -0.4;
    smokes.push({ x: -40.2, y: 1.4, z: -31.2, count: 10, size: 1.3, rise: 4, spread: 0.4, life: 5 });
  }
  {
    const ships: { o: THREE.Object3D; r: number; speed: number; phase: number; dir: number; cx: number; cz: number; h: number }[] = [];
    for (const [name, h, r, speed, phase, dir, cx, cz, alt] of [
      ['ship_a', 3.2, 72, 0.03, 0.9, 1, 0, -2, 9],
      ['ship_b', 2.6, 86, 0.022, 3.6, -1, 4, 0, 13],
    ] as const) {
      const m = models.get(K(name));
      if (!m) continue;
      const o = placeModel(m, { x: 0, y: 0, z: 0, rotY: 0, scale: 1 }, h);
      const holder = new THREE.Group();
      holder.add(o);
      // Antriebsglühen
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color('#6dffe0').multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(h * 0.5);
      glow.position.set(0, h * 0.2, -h * 0.9);
      holder.add(glow);
      holder.userData.dynamic = true;
      root.add(holder);
      ships.push({ o: holder, r, speed, phase, dir, cx, cz, h: alt });
    }
    const ahead = new THREE.Vector3();
    updaters.push((t) => {
      for (const s of ships) {
        const pos = (tt: number, out: THREE.Vector3) => {
          const a = s.phase + tt * s.speed * s.dir;
          return out.set(s.cx + Math.cos(a) * s.r, s.h + Math.sin(tt * 0.7 + s.phase) * 0.8, s.cz + Math.sin(a) * s.r * 0.9);
        };
        pos(t, s.o.position);
        // Nase in Flugrichtung, leicht in die Kurve gelegt
        s.o.lookAt(pos(t + 0.5, ahead));
        s.o.rotateZ(-0.18 * s.dir);
      }
    });
    for (const s of ships) perches.push(s.o.position);
  }
  // Kristallspitzen im Plasma vor der Nordküste
  const spikeMat = new THREE.MeshStandardMaterial({ color: '#a9fff2', roughness: 0.3, flatShading: true });
  spikeMat.emissive.set('#2fd8c0');
  spikeMat.emissiveIntensity = 0.55;
  for (const [x, z, h] of [
    [9.5, -39.6, 4.2],
    [-6.5, -40.2, 3.2],
    [30.5, -33.5, 3.6],
    [46.5, 4.5, 2.6],
  ] as const) {
    const base = new THREE.Mesh(rockGeometry(1.2, 1.6, R), mat('#5d5190', { flat: true }));
    base.position.set(x, -1.2, z);
    root.add(base);
    const c = new THREE.Mesh(crystalCluster(Math.round(x + z * 7), 4), spikeMat);
    c.position.set(x, 0, z);
    c.scale.set(2, h, 2);
    c.castShadow = true;
    root.add(c);
  }

  // Kamera-Hindernisse: alle Wahrzeichen (Gelände-Höhe + typische Höhe), Mast und Tempel genauer
  const blockers = keepOut.map((k) => ({ x: k.x, z: k.z, r: k.r * 0.8, top: H(k.x, k.z) + 4 }));
  blockers.push({ x: 41.6, z: -13.4, r: 2.6, top: H(41.6, -13.4) + 12 }, { x: -3.4, z: 15.6, r: 4.2, top: H(-3.4, 15.6) + 6.2 }, ...extraBlockers);
  mergeStatic(root);

  return {
    group: root,
    keepOut,
    blockers,
    fires,
    smokes,
    perches,
    update(t, dt) {
      for (const u of updaters) u(t, dt);
    },
  };
}

/** Kristallbogen an der Ostküste (statt Felsbogen) */
function buildCrystalArch(x: number, z: number, R: () => number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(3.4, 1.15, 6, 14, Math.PI);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const n = noise2(p.getX(i) * 0.6 + 3, p.getY(i) * 0.6) * 0.45 + (R() - 0.5) * 0.15;
    p.setXYZ(i, p.getX(i) * (1 + n * 0.12), p.getY(i) + n * 0.35, p.getZ(i) * (1 + n * 0.3));
  }
  geo.computeVertexNormals();
  const arch = new THREE.Mesh(geo, mat('#6a5da6', { flat: true }));
  arch.castShadow = arch.receiveShadow = true;
  arch.position.y = -1.6;
  g.add(arch);
  for (const sx of [-3.4, 3.4]) {
    const foot = new THREE.Mesh(rockGeometry(1.6, 2.2, R), mat('#5a4f8c', { flat: true }));
    foot.position.set(sx, -2.6, 0);
    g.add(foot);
  }
  // Kristalle auf dem Bogen
  const cm = mat('#b6fff4', { emissive: '#36e0c8', glow: 0.8, flat: true, rough: 0.25 });
  for (let k = 0; k < 6; k++) {
    const a = 0.25 + (k / 5) * (Math.PI - 0.5);
    const c = new THREE.Mesh(crystalCluster(40 + k, 3), k % 2 ? cm : mat('#ffd0f2', { emissive: '#ff5fc8', glow: 0.7, flat: true, rough: 0.25 }));
    c.position.set(Math.cos(a) * 3.4, Math.sin(a) * 3.4 - 1.6 + 0.9, 0);
    c.rotation.z = a - Math.PI / 2;
    c.scale.setScalar(0.9 + R() * 0.6);
    g.add(c);
  }
  g.position.set(x, 0, z);
  g.rotation.y = 0.5;
  return g;
}

/** Metallbrücke: Gitterplatten, Pfosten, leuchtende Handläufe (gleiche Lage wie die Hängebrücke). */
function buildSpaceBridge(layout: IslandLayout): THREE.Group {
  const g = new THREE.Group();
  const br = layout.bridge;
  const pts = layout.path.filter((p) => p.s >= br.s0 - 0.2 && p.s <= br.s1 + 0.2);
  if (pts.length < 2) return g;
  const width = layout.fieldRadius * 2.5;
  const plankGeo = new THREE.BoxGeometry(width, 0.1, 0.3);
  const sides: THREE.Vector3[][] = [[], []];
  const lows: THREE.Vector3[][] = [[], []];
  for (let i = 0; i < pts.length - 1; i += 2) {
    const a = pts[i]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const heading = Math.atan2(b.z - a.z, b.x - a.x);
    const plank = mesh(plankGeo, mat(i % 6 === 0 ? '#6c67a0' : '#a9a5d0', { rough: 0.45, flat: true }), a.x, a.y - 0.08, a.z);
    plank.rotation.y = -heading + Math.PI / 2;
    g.add(plank);
    const nx = Math.cos(heading + Math.PI / 2) * width * 0.52;
    const nz = Math.sin(heading + Math.PI / 2) * width * 0.52;
    sides[0]!.push(new THREE.Vector3(a.x + nx, a.y + 0.95, a.z + nz));
    sides[1]!.push(new THREE.Vector3(a.x - nx, a.y + 0.95, a.z - nz));
    lows[0]!.push(new THREE.Vector3(a.x + nx, a.y - 0.05, a.z + nz));
    lows[1]!.push(new THREE.Vector3(a.x - nx, a.y - 0.05, a.z - nz));
  }
  const postGeo = new THREE.CylinderGeometry(0.1, 0.13, 2.0, 6);
  for (let s = 0; s < 2; s++) {
    const side = sides[s]!;
    const low = lows[s]!;
    for (const p of [side[0], side[side.length - 1]]) if (p) g.add(mesh(postGeo, mat(METAL_DARK, { rough: 0.4 }), p.x, p.y - 0.4, p.z));
    const hand = side.map((p, i, arr) => p.clone().setY(p.y + 0.15 - Math.sin((i / (arr.length - 1)) * Math.PI) * 0.35));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hand), hand.length * 6, 0.045, 5, false), glowMat(CYAN, 1.5)));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(low), low.length * 6, 0.04, 5, false), mat(METAL, { rough: 0.4 })));
    for (let i = 1; i < hand.length - 1; i += 2) g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([hand[i]!, low[i]!]), 2, 0.02, 4, false), mat(METAL_DARK)));
  }
  return g;
}

/** Pfosten mit Leuchtkabel an der Abbruchseite des Weges (Klippen, Hochebene, Serpentinen). */
function buildCableRails(layout: IslandLayout, field: Heightfield): THREE.Group {
  const g = new THREE.Group();
  const runs: THREE.Vector3[][] = [];
  let run: THREE.Vector3[] = [];
  const off = layout.fieldRadius * 1.25 + 0.35;
  const br = layout.bridge;
  const ford = layout.ford;
  for (let i = 0; i < layout.path.length - 1; i += 7) {
    const a = layout.path[i]!;
    const b = layout.path[i + 1]!;
    if (!['cliffs', 'gorge', 'plateau', 'volcano'].includes(a.zone) || (a.s > br.s0 - 1 && a.s < br.s1 + 1) || (a.s > ford.s0 - 2 && a.s < ford.s1 + 2)) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    const hd = Math.atan2(b.z - a.z, b.x - a.x);
    let best: THREE.Vector3 | null = null;
    for (const side of [-1, 1]) {
      const x = a.x + Math.cos(hd + Math.PI / 2) * off * side;
      const z = a.z + Math.sin(hd + Math.PI / 2) * off * side;
      const drop = a.y - field.height(x + Math.cos(hd + Math.PI / 2) * 1.6 * side, z + Math.sin(hd + Math.PI / 2) * 1.6 * side);
      if (drop > 1.6) best = new THREE.Vector3(x, field.height(x, z), z);
    }
    if (best && (!run.length || run[run.length - 1]!.distanceTo(best) < 3.5)) run.push(best);
    else {
      if (run.length > 1) runs.push(run);
      run = best ? [best] : [];
    }
  }
  if (run.length > 1) runs.push(run);
  const postGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.0, 5);
  const posts: THREE.Vector3[] = runs.flat();
  const inst = new THREE.InstancedMesh(postGeo, mat(METAL_DARK, { rough: 0.4 }), posts.length);
  const tips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), glowMat(CYAN, 2), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => {
    inst.setMatrixAt(i, m.makeTranslation(p.x, p.y + 0.45, p.z));
    tips.setMatrixAt(i, m.makeTranslation(p.x, p.y + 0.97, p.z));
  });
  inst.castShadow = true;
  g.add(inst, tips);
  const cable = glowMat(CYAN, 1.3);
  for (const r of runs) {
    const pts: THREE.Vector3[] = [];
    r.forEach((p, i) => {
      pts.push(p.clone().setY(p.y + 0.85));
      const n = r[i + 1];
      if (n) pts.push(p.clone().lerp(n, 0.5).setY((p.y + n.y) / 2 + 0.75));
    });
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 6), 0.022, 4, false), cable));
  }
  return g;
}

