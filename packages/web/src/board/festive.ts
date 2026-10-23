/**
 * Festzeiten für alle Welten: Halloween (Kürbislaternen am Weg, Grabsteine, Gespenster,
 * Fledermäuse, Mond) und Weihnachten (geschmückte Tannen, Lichterkette entlang des Wegs,
 * Geschenke an Start und Ziel, Schneemann). Insel: runde Formen, Blockwelt: aus Blöcken,
 * Weltall: eigene Deko in space/festive.ts.
 */
import * as THREE from 'three';
import { VOLCANO, type Festive, type Theme } from '@insel/shared';
import type { IslandLayout } from './layout.ts';
import { blockAtlas } from './blocks/atlas.ts';
import { atlasMat, boxGeo, cube } from './blocks/cube.ts';
import { buildMob } from './blocks/mobs.ts';
import { BLOCK } from './blocks/world.ts';
import { buildSpaceFestive } from './space/festive.ts';

export interface FestiveFx {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

/** Plätze neben dem Weg: jedes n-te Feld, abwechselnd links/rechts, nicht an Mutproben/Furt/Brücke */
export function festiveSpots(layout: IslandLayout, every: number, off: number, groundAt: (x: number, z: number) => number) {
  const busy = new Set<number>([layout.plan.vineField, layout.plan.caveField, layout.plan.caveExit, layout.craterField, ...layout.fordFields]);
  const out: { x: number; y: number; z: number; face: number }[] = [];
  layout.fields.forEach((f, i) => {
    if (i < 2 || i > layout.fields.length - 3 || i % every !== 0 || f.ford || f.bridge) return;
    for (const b of busy) if (Math.abs(b - i) <= 1) return;
    const side = (i / every) % 2 ? 1 : -1;
    const nx = -Math.sin(f.heading) * side;
    const nz = Math.cos(f.heading) * side;
    const x = f.x + nx * off;
    const z = f.z + nz * off;
    const y = groundAt(x, z);
    if (y < 0.3) return;
    // Gesicht zum Weg
    out.push({ x, y, z, face: Math.atan2(f.x - x, f.z - z) });
  });
  return out;
}

/** Fratze einer Kürbislaterne (Insel) als leuchtendes Bild */
function faceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffb02e';
  g.shadowColor = '#ff7a00';
  g.shadowBlur = 18;
  const tri = (pts: number[]) => {
    g.beginPath();
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.closePath();
    g.fill();
  };
  tri([22, 56, 50, 56, 36, 30]);
  tri([78, 56, 106, 56, 92, 30]);
  tri([56, 66, 72, 66, 64, 78]);
  g.beginPath();
  g.moveTo(18, 84);
  for (let i = 0; i <= 8; i++) g.lineTo(18 + i * 11.5, 84 + (i % 2 ? 10 : 0) + Math.sin((i / 8) * Math.PI) * 14);
  for (let i = 8; i >= 0; i--) g.lineTo(18 + i * 11.5, 104 + Math.sin((i / 8) * Math.PI) * 10 - (i % 2 ? 8 : 0));
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function text(label: string, w: number, h: number, bg: string, fg: string, font: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = `${Math.round(c.height * 0.36)}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, c.width / 2, c.height * 0.42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BULBS = ['#ff4040', '#ffd34d', '#4fd0ff', '#7dff6a', '#ff7ae0'];

export function buildFestive(kind: Exclude<Festive, 'off'>, theme: Theme, layout: IslandLayout, groundAt: (x: number, z: number) => number): FestiveFx {
  if (theme === 'space') return buildSpaceFestive(kind, layout, groundAt);
  const group = new THREE.Group();
  group.name = `festive-${kind}`;
  const blocks = theme === 'blocks';
  const updaters: ((t: number, dt: number) => void)[] = [];
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }));
  const add = (o: THREE.Object3D, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    o.traverse((c) => ((c as THREE.Mesh).castShadow = true));
    group.add(o);
    return o;
  };
  const fr = layout.fieldRadius;

  if (kind === 'halloween') {
    const face = blocks ? null : own(faceTexture());
    const orange = std('#e8761c', { roughness: 0.55 });
    const stem = std('#5a6a2a');
    for (const s of festiveSpots(layout, 4, fr * 2.1, groundAt)) {
      let p: THREE.Object3D;
      if (blocks) {
        p = new THREE.Mesh(boxGeo(BLOCK, BLOCK, BLOCK, { top: 'pumpkin_top', side: 'pumpkin_side' }), atlasMat());
        // Fratze vorne leuchtet
        const front = new THREE.Mesh(own(new THREE.PlaneGeometry(BLOCK, BLOCK)), atlasMat('glow'));
        const uv = front.geometry.getAttribute('uv') as THREE.BufferAttribute;
        const [u0, v0, u1, v1] = blockAtlas().uv('pumpkin_face');
        for (let i = 0; i < 4; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
        front.position.z = BLOCK / 2 + 0.005;
        p.add(front);
        p.position.y = BLOCK / 2;
        const holder = new THREE.Group();
        holder.add(p);
        p = holder;
      } else {
        const g = new THREE.Group();
        const body = new THREE.Mesh(own(new THREE.SphereGeometry(0.42, 18, 12)), orange);
        body.scale.set(1.15, 0.85, 1.15);
        body.position.y = 0.36;
        g.add(body);
        const st = new THREE.Mesh(own(new THREE.CylinderGeometry(0.04, 0.06, 0.18, 6)), stem);
        st.position.y = 0.74;
        st.rotation.z = 0.3;
        g.add(st);
        const f = new THREE.Mesh(own(new THREE.PlaneGeometry(0.62, 0.62)), own(new THREE.MeshBasicMaterial({ map: face, transparent: true, toneMapped: false, depthWrite: false })));
        f.position.set(0, 0.36, 0.47);
        g.add(f);
        p = g;
      }
      p.rotation.y = s.face;
      add(p, s.x, s.y, s.z);
    }
    // kleiner Friedhof neben dem Start
    const start = layout.fields[1] ?? layout.fields[0]!;
    const sideX = -Math.sin(start.heading);
    const sideZ = Math.cos(start.heading);
    for (let k = 0; k < 4; k++) {
      const x = start.x + sideX * (fr * 3 + (k % 2) * 1.2) + Math.cos(start.heading) * (k - 1.5) * 1.3;
      const z = start.z + sideZ * (fr * 3 + (k % 2) * 1.2) + Math.sin(start.heading) * (k - 1.5) * 1.3;
      const y = groundAt(x, z);
      if (y < 0.3) continue;
      let stone: THREE.Object3D;
      if (blocks) {
        const m = new THREE.Mesh(boxGeo(BLOCK, BLOCK * 1.5, BLOCK * 0.3, 'cobblestone'), atlasMat());
        m.position.y = BLOCK * 0.75;
        const plate = new THREE.Mesh(own(new THREE.PlaneGeometry(BLOCK * 0.8, BLOCK * 0.5)), own(new THREE.MeshLambertMaterial({ map: own(text('R.I.P.', 0.8, 0.5, '#7a7a7a', '#222', '"Pixelify Sans", monospace')) })));
        plate.position.set(0, BLOCK * 0.9, BLOCK * 0.16);
        const g = new THREE.Group();
        g.add(m, plate);
        stone = g;
      } else {
        const g = new THREE.Group();
        const mat = std('#8d8a86');
        const slab = new THREE.Mesh(own(new THREE.BoxGeometry(0.6, 0.7, 0.16)), mat);
        slab.position.y = 0.35;
        const cap = new THREE.Mesh(own(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 16, 1, false, 0, Math.PI)), mat);
        cap.rotation.set(Math.PI / 2, Math.PI / 2, 0);
        cap.position.y = 0.7;
        const plate = new THREE.Mesh(own(new THREE.PlaneGeometry(0.5, 0.3)), own(new THREE.MeshStandardMaterial({ map: own(text('R.I.P.', 0.5, 0.3, '#8d8a86', '#2a2826', 'Fredoka, sans-serif')) })));
        plate.position.set(0, 0.5, 0.081);
        g.add(slab, cap, plate);
        stone = g;
      }
      stone.rotation.y = start.heading + Math.PI / 2 + (k - 1.5) * 0.08;
      stone.rotation.z = (k % 3) * 0.05;
      add(stone, x, y, z);
    }
    // Gespenster kreisen am Vulkanhang
    for (let k = 0; k < 3; k++) {
      let ghost: THREE.Object3D;
      if (blocks) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(boxGeo(0.9, 1.1, 0.9, 'snow'), atlasMat());
        g.add(body);
        for (const ex of [-0.2, 0.2]) {
          const eye = new THREE.Mesh(own(new THREE.BoxGeometry(0.14, 0.2, 0.02)), own(new THREE.MeshBasicMaterial({ color: '#111' })));
          eye.position.set(ex, 0.15, 0.46);
          g.add(eye);
        }
        ghost = g;
      } else {
        const g = new THREE.Group();
        const sheet = std('#f4f6ff', { transparent: true, opacity: 0.88, emissive: new THREE.Color('#cfd8ff'), emissiveIntensity: 0.35 });
        const head = new THREE.Mesh(own(new THREE.SphereGeometry(0.42, 18, 12)), sheet);
        head.position.y = 0.3;
        const skirt = new THREE.Mesh(own(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 18, 1, true)), sheet);
        skirt.position.y = -0.05;
        g.add(head, skirt);
        for (const ex of [-0.14, 0.14]) {
          const eye = new THREE.Mesh(own(new THREE.SphereGeometry(0.06, 8, 6)), std('#151515'));
          eye.scale.set(1, 1.5, 0.5);
          eye.position.set(ex, 0.38, 0.38);
          g.add(eye);
        }
        ghost = g;
      }
      group.add(ghost);
      const ph = (k / 3) * Math.PI * 2;
      updaters.push((t) => {
        const a = t * 0.15 + ph;
        const r = VOLCANO.baseRadius * 0.62;
        const x = VOLCANO.x + Math.cos(a) * r;
        const z = VOLCANO.z + Math.sin(a) * r;
        ghost.position.set(x, groundAt(x, z) + 2.4 + Math.sin(t * 1.3 + ph) * 0.4, z);
        ghost.rotation.y = -a;
      });
    }
    // Fledermäuse um den Gipfel
    for (let k = 0; k < 8; k++) {
      let bat: THREE.Object3D;
      let wings: [THREE.Object3D | undefined, THREE.Object3D | undefined] = [undefined, undefined];
      if (blocks) {
        bat = buildMob('bat').root;
        bat.scale.setScalar(0.6);
        wings = [bat.getObjectByName('wingL'), bat.getObjectByName('wingR')];
      } else {
        const g = new THREE.Group();
        const mat = std('#1d1420', { side: THREE.DoubleSide });
        const wingGeo = own(new THREE.BufferGeometry());
        wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.45, 0.06, -0.12, 0.38, 0, 0.18], 3));
        wingGeo.computeVertexNormals();
        const l = new THREE.Mesh(wingGeo, mat);
        const r = new THREE.Mesh(wingGeo, mat);
        r.scale.x = -1;
        g.add(l, r, new THREE.Mesh(own(new THREE.SphereGeometry(0.09, 8, 6)), mat));
        bat = g;
        wings = [l, r];
      }
      group.add(bat);
      const ph = k * 1.7;
      updaters.push((t) => {
        const a = t * (0.5 + (k % 3) * 0.15) + ph;
        const r = VOLCANO.craterRadius + 3 + (k % 4);
        bat.position.set(VOLCANO.x + Math.cos(a) * r, VOLCANO.height + 3 + Math.sin(t * 2 + ph) * 1.2, VOLCANO.z + Math.sin(a) * r);
        bat.rotation.y = -a;
        const flap = Math.sin(t * 20 + ph) * 0.8;
        if (wings[0]) wings[0].rotation.z = blocks ? flap : flap * 0.6;
        if (wings[1]) wings[1].rotation.z = blocks ? -flap : flap * 0.6;
      });
    }
    // Mond
    const moon = new THREE.Mesh(own(blocks ? new THREE.PlaneGeometry(40, 40) : new THREE.CircleGeometry(20, 48)), own(new THREE.MeshBasicMaterial({ color: '#f3efd6', fog: false, toneMapped: false })));
    moon.position.set(120, 150, -170);
    moon.lookAt(0, 0, 0);
    group.add(moon);
  } else {
    // Weihnachten: Tannen am Weg
    const ornaments = BULBS.map((c) => own(new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
    for (const s of festiveSpots(layout, 6, fr * 2.4, groundAt)) {
      const tree = new THREE.Group();
      if (blocks) {
        const log = { top: 'log_top', side: 'log_side' } as const;
        for (let y = 0; y < 2; y++) {
          const m = cube(log);
          m.position.y = BLOCK / 2 + y * BLOCK;
          tree.add(m);
        }
        const layers = [2, 2, 1, 1, 0];
        layers.forEach((r, i) => {
          for (let a = -r; a <= r; a++)
            for (let b = -r; b <= r; b++) {
              if (r === 2 && Math.abs(a) === 2 && Math.abs(b) === 2) continue;
              const m = cube('spruce_leaves', BLOCK, 'cutout');
              m.position.set(a * BLOCK, BLOCK * (2.5 + i), b * BLOCK);
              tree.add(m);
              if ((a + b + i) % 3 === 0 && r > 0) {
                const light = new THREE.Mesh(own(new THREE.BoxGeometry(0.16, 0.16, 0.16)), ornaments[(a * 3 + b + i) % ornaments.length]!);
                light.position.set(a * BLOCK + Math.sign(a || 1) * BLOCK * 0.52, BLOCK * (2.5 + i), b * BLOCK + Math.sign(b || 1) * BLOCK * 0.52);
                tree.add(light);
              }
            }
        });
        const star = new THREE.Mesh(boxGeo(BLOCK * 0.6, BLOCK * 0.6, BLOCK * 0.6, 'glowstone'), atlasMat('glow'));
        star.position.y = BLOCK * (2.5 + layers.length);
        star.rotation.y = Math.PI / 4;
        tree.add(star);
      } else {
        const green = std('#1f5a32', { flatShading: true });
        const trunk = new THREE.Mesh(own(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 8)), std('#6b4630'));
        trunk.position.y = 0.25;
        tree.add(trunk);
        [1.1, 0.85, 0.6].forEach((r, i) => {
          const cone = new THREE.Mesh(own(new THREE.ConeGeometry(r, 1.1, 10)), green);
          cone.position.y = 0.85 + i * 0.6;
          tree.add(cone);
          for (let k = 0; k < 6 - i; k++) {
            const a = (k / (6 - i)) * Math.PI * 2 + i;
            const ball = new THREE.Mesh(own(new THREE.SphereGeometry(0.07, 8, 6)), ornaments[(k + i) % ornaments.length]!);
            ball.position.set(Math.cos(a) * r * 0.78, cone.position.y - 0.3, Math.sin(a) * r * 0.78);
            tree.add(ball);
          }
        });
        const star = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.2)), own(new THREE.MeshBasicMaterial({ color: '#ffd34d', toneMapped: false })));
        star.position.y = 2.45;
        tree.add(star);
        updaters.push((t) => (star.rotation.y = t));
      }
      add(tree, s.x, s.y, s.z);
    }
    // Geschenke an Start und Ziel
    for (const fi of [0, layout.fields.length - 1]) {
      const f = layout.fields[fi]!;
      for (let k = 0; k < 4; k++) {
        const a = f.heading + Math.PI / 2 + (k - 1.5) * 0.45 + (fi ? Math.PI : 0);
        const r = fr * (fi === 0 ? 2.6 : 2) + (k % 2) * 0.3;
        const x = f.x + Math.cos(a) * r;
        const z = f.z + Math.sin(a) * r;
        const y = groundAt(x, z);
        const size = 0.42 + (k % 3) * 0.12;
        const color = BULBS[(k + fi) % BULBS.length]!;
        const box = new THREE.Mesh(own(new THREE.BoxGeometry(size, size, size)), blocks ? own(new THREE.MeshLambertMaterial({ color })) : std(color, { roughness: 0.5 }));
        box.position.y = size / 2;
        const ribbonMat = blocks ? own(new THREE.MeshLambertMaterial({ color: '#ffffff' })) : std('#ffffff', { roughness: 0.4 });
        const r1 = new THREE.Mesh(own(new THREE.BoxGeometry(size * 1.02, size * 1.02, size * 0.18)), ribbonMat);
        const r2 = new THREE.Mesh(own(new THREE.BoxGeometry(size * 0.18, size * 1.02, size * 1.02)), ribbonMat);
        r1.position.y = r2.position.y = size / 2;
        const g = new THREE.Group();
        g.add(box, r1, r2);
        g.rotation.y = k * 0.7;
        add(g, x, y, z);
      }
    }
    // Schneemann neben dem Start
    {
      const f = layout.fields[1] ?? layout.fields[0]!;
      const x = f.x - Math.sin(f.heading) * fr * 3.2;
      const z = f.z + Math.cos(f.heading) * fr * 3.2;
      const y = groundAt(x, z);
      const man = new THREE.Group();
      const coal = own(new THREE.MeshBasicMaterial({ color: '#1b1b1b' }));
      if (blocks) {
        for (let i = 0; i < 2; i++) {
          const m = cube('snow');
          m.position.y = BLOCK / 2 + i * BLOCK;
          man.add(m);
        }
        const head = cube('snow', BLOCK * 0.8);
        head.position.y = BLOCK * 2.4;
        man.add(head);
        for (const ex of [-0.12, 0.12]) {
          const e = new THREE.Mesh(own(new THREE.BoxGeometry(0.08, 0.08, 0.02)), coal);
          e.position.set(ex, BLOCK * 2.5, BLOCK * 0.41);
          man.add(e);
        }
        const nose = new THREE.Mesh(own(new THREE.BoxGeometry(0.07, 0.07, 0.25)), own(new THREE.MeshLambertMaterial({ color: '#f07a1a' })));
        nose.position.set(0, BLOCK * 2.4, BLOCK * 0.5);
        man.add(nose);
      } else {
        const snow = std('#f6f9ff', { roughness: 0.9 });
        [0.45, 0.33, 0.24].forEach((r, i) => {
          const s = new THREE.Mesh(own(new THREE.SphereGeometry(r, 18, 14)), snow);
          s.position.y = [0.42, 1.05, 1.5][i]!;
          man.add(s);
        });
        for (const ex of [-0.08, 0.08]) {
          const e = new THREE.Mesh(own(new THREE.SphereGeometry(0.03, 6, 4)), coal);
          e.position.set(ex, 1.56, 0.21);
          man.add(e);
        }
        const nose = new THREE.Mesh(own(new THREE.ConeGeometry(0.04, 0.22, 8)), std('#f07a1a'));
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 1.5, 0.3);
        const hat = new THREE.Mesh(own(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 14)), std('#1e1e24'));
        hat.position.y = 1.82;
        man.add(nose, hat);
      }
      man.rotation.y = Math.atan2(f.x - x, f.z - z);
      add(man, x, y, z);
    }
    // Lichterkette entlang des Wegs: kleine Lämpchen, die bunt blinken
    const pts: THREE.Vector3[] = [];
    const path = layout.path;
    for (let i = 0; i < path.length; i += 3) {
      const p = path[i]!;
      const q = path[Math.min(path.length - 1, i + 1)]!;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const side = (i / 3) % 2 ? 1 : -1;
      const x = p.x + (-dz / l) * fr * 1.25 * side;
      const z = p.z + (dx / l) * fr * 1.25 * side;
      const y = groundAt(x, z);
      if (y < 0.2) continue;
      pts.push(new THREE.Vector3(x, y + 0.12, z));
    }
    const bulbGeo = own(blocks ? new THREE.BoxGeometry(0.14, 0.14, 0.14) : new THREE.SphereGeometry(0.07, 8, 6));
    const bulbMat = own(new THREE.MeshBasicMaterial({ toneMapped: false }));
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, pts.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    pts.forEach((p, i) => {
      bulbs.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
      bulbs.setColorAt(i, col.set(BULBS[i % BULBS.length]!));
    });
    group.add(bulbs);
    let acc = 0;
    let phase = 0;
    updaters.push((_t, dt) => {
      acc += dt;
      if (acc < 0.45) return;
      acc = 0;
      phase++;
      for (let i = 0; i < pts.length; i++) bulbs.setColorAt(i, col.set(BULBS[(i + phase) % BULBS.length]!).multiplyScalar((i + phase) % 4 === 0 ? 0.35 : 1));
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    });
  }

  // eigene Uhr: Gespenster und Fledermäuse machen nach einem Ruckler keinen Satz
  let clock = 0;
  return {
    group,
    update(_t, dt) {
      clock += dt;
      for (const u of updaters) u(clock, dt);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
