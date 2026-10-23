/**
 * Festzeiten im Weltall: Halloween mit leuchtenden Kürbis-Kapseln am Weg, Geister-Aliens am
 * Vulkanhang, Fledermaus-Drohnen um den Gipfel, Alien-Grabsteinen am Landeplatz und einem
 * Kürbis-Mond; Weihnachten mit geschmückten Kristallbäumen, Lichterketten an Weg und Basis,
 * Geschenk-Kapseln an Start und Ziel und einem Schnee-Roboter.
 */
import * as THREE from 'three';
import { VOLCANO, type Festive } from '@insel/shared';
import { festiveSpots, type FestiveFx } from '../festive.ts';
import type { IslandLayout } from '../layout.ts';

const BULBS = ['#ff4fa8', '#ffd34d', '#4fe8ff', '#7dff9a', '#b58cff'];

/** Leuchtende Fratze (grünlich – Alien-Kürbis) */
function faceTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 16;
  const tri = (pts: number[]) => {
    g.beginPath();
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.closePath();
    g.fill();
  };
  // drei Augen (Alien!)
  tri([18, 54, 42, 54, 30, 30]);
  tri([52, 46, 76, 46, 64, 22]);
  tri([86, 54, 110, 54, 98, 30]);
  g.beginPath();
  g.moveTo(20, 80);
  for (let i = 0; i <= 8; i++) g.lineTo(20 + i * 11, 80 + (i % 2 ? 10 : 0) + Math.sin((i / 8) * Math.PI) * 14);
  for (let i = 8; i >= 0; i--) g.lineTo(20 + i * 11, 100 + Math.sin((i / 8) * Math.PI) * 10 - (i % 2 ? 8 : 0));
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Kürbis-Mond: orange Scheibe mit Rillen und leuchtendem Gesicht */
function moonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(110, 100, 20, 128, 128, 128);
  grd.addColorStop(0, '#ffc266');
  grd.addColorStop(0.8, '#f08a1f');
  grd.addColorStop(1, 'rgba(240,138,31,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(160,70,10,0.45)';
  g.lineWidth = 6;
  for (const x of [-60, -25, 25, 60]) {
    g.beginPath();
    g.ellipse(128 + x * 0.2, 128, Math.abs(x) * 1.6 + 10, 120, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#fff6a0';
  g.shadowColor = '#ffe066';
  g.shadowBlur = 20;
  const tri = (pts: number[]) => {
    g.beginPath();
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.closePath();
    g.fill();
  };
  tri([70, 110, 108, 110, 89, 72]);
  tri([148, 110, 186, 110, 167, 72]);
  g.beginPath();
  g.moveTo(66, 150);
  for (let i = 0; i <= 8; i++) g.lineTo(66 + i * 15.5, 150 + (i % 2 ? 14 : 0) + Math.sin((i / 8) * Math.PI) * 22);
  for (let i = 8; i >= 0; i--) g.lineTo(66 + i * 15.5, 182 + Math.sin((i / 8) * Math.PI) * 14 - (i % 2 ? 10 : 0));
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textTexture(label: string, bg: string, fg: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 154;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.shadowColor = fg;
  g.shadowBlur = 12;
  g.font = `${Math.round(c.height * 0.36)}px Fredoka, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, c.width / 2, c.height * 0.45);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSpaceFestive(kind: Exclude<Festive, 'off'>, layout: IslandLayout, groundAt: (x: number, z: number) => number): FestiveFx {
  const group = new THREE.Group();
  group.name = `space-festive-${kind}`;
  const updaters: ((t: number, dt: number) => void)[] = [];
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }));
  const glow = (color: string, k = 1.8) => own(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
  const add = (o: THREE.Object3D, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    o.traverse((c) => ((c as THREE.Mesh).castShadow = true));
    group.add(o);
    return o;
  };
  const fr = layout.fieldRadius;

  if (kind === 'halloween') {
    // Kürbis-Kapseln: Kürbis mit drei leuchtenden Augen unter einer Glaskuppel auf Metallsockel
    const face = own(faceTexture('#9dff6a'));
    const orange = std('#ff8a2a', { roughness: 0.5, emissive: new THREE.Color('#ff6a00'), emissiveIntensity: 0.25 });
    const stem = std('#4f7a3a');
    const base = std('#6c67a0', { roughness: 0.4, metalness: 0.3 });
    const glass = own(new THREE.MeshStandardMaterial({ color: '#d8f6ff', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }));
    const ring = glow('#9dff6a', 1.6);
    const bodyGeo = own(new THREE.SphereGeometry(0.4, 16, 10));
    const faceMat = own(new THREE.MeshBasicMaterial({ map: face, transparent: true, depthWrite: false, toneMapped: false }));
    for (const s of festiveSpots(layout, 4, fr * 2.1, groundAt)) {
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(own(new THREE.CylinderGeometry(0.5, 0.58, 0.18, 6)), base);
      plinth.position.y = 0.09;
      const lit = new THREE.Mesh(own(new THREE.TorusGeometry(0.5, 0.03, 4, 6).rotateX(Math.PI / 2)), ring);
      lit.position.y = 0.19;
      const body = new THREE.Mesh(bodyGeo, orange);
      body.scale.set(1.15, 0.85, 1.15);
      body.position.y = 0.52;
      const st = new THREE.Mesh(own(new THREE.CylinderGeometry(0.04, 0.06, 0.16, 6)), stem);
      st.position.y = 0.88;
      st.rotation.z = 0.3;
      const f = new THREE.Mesh(own(new THREE.PlaneGeometry(0.6, 0.6)), faceMat);
      f.position.set(0, 0.52, 0.47);
      const dome = new THREE.Mesh(own(new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), glass);
      dome.position.y = 0.18;
      dome.scale.y = 1.35;
      dome.renderOrder = 5;
      g.add(plinth, lit, body, st, f, dome);
      g.rotation.y = s.face;
      add(g, s.x, s.y, s.z);
      dome.castShadow = false;
    }
    // Alien-Grabsteine neben dem Landeplatz
    const start = layout.fields[1] ?? layout.fields[0]!;
    const sideX = -Math.sin(start.heading);
    const sideZ = Math.cos(start.heading);
    const stoneMat = std('#5a4f86', { flatShading: true });
    const plate = own(new THREE.MeshBasicMaterial({ map: own(textTexture('R.I.P.', '#5a4f86', '#9dff6a')), toneMapped: false }));
    for (let k = 0; k < 4; k++) {
      const x = start.x + sideX * (fr * 3 + (k % 2) * 1.2) + Math.cos(start.heading) * (k - 1.5) * 1.3;
      const z = start.z + sideZ * (fr * 3 + (k % 2) * 1.2) + Math.sin(start.heading) * (k - 1.5) * 1.3;
      const y = groundAt(x, z);
      if (y < 0.3) continue;
      const g = new THREE.Group();
      const slab = new THREE.Mesh(own(new THREE.CylinderGeometry(0.34, 0.4, 0.9, 6)), stoneMat);
      slab.scale.z = 0.4;
      slab.position.y = 0.45;
      const tip = new THREE.Mesh(own(new THREE.ConeGeometry(0.34, 0.3, 6)), stoneMat);
      tip.scale.z = 0.4;
      tip.position.y = 1.05;
      const p = new THREE.Mesh(own(new THREE.PlaneGeometry(0.46, 0.28)), plate);
      p.position.set(0, 0.6, 0.15);
      g.add(slab, tip, p);
      g.rotation.y = start.heading + Math.PI / 2 + (k - 1.5) * 0.08;
      g.rotation.z = (k % 3) * 0.05;
      add(g, x, y, z);
    }
    // Geister-Aliens: Laken mit Antennen und drei Augen, kreisen am Vulkanhang
    const sheet = std('#e6fff0', { transparent: true, opacity: 0.85, emissive: new THREE.Color('#9dffcf'), emissiveIntensity: 0.45 });
    const eye = std('#1a1030');
    const knob = glow('#9dff6a', 2);
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group();
      const head = new THREE.Mesh(own(new THREE.SphereGeometry(0.42, 18, 12)), sheet);
      head.position.y = 0.3;
      const skirt = new THREE.Mesh(own(new THREE.CylinderGeometry(0.42, 0.58, 0.75, 18, 1, true)), sheet);
      skirt.position.y = -0.08;
      g.add(head, skirt);
      for (const ex of [-0.16, 0, 0.16]) {
        const e = new THREE.Mesh(own(new THREE.SphereGeometry(0.055, 8, 6)), eye);
        e.scale.set(1, 1.4, 0.5);
        e.position.set(ex, ex === 0 ? 0.48 : 0.38, 0.38);
        g.add(e);
      }
      for (const sx of [-1, 1]) {
        const ant = new THREE.Mesh(own(new THREE.CylinderGeometry(0.015, 0.02, 0.35, 5)), sheet);
        ant.position.set(sx * 0.16, 0.82, 0);
        ant.rotation.z = -sx * 0.35;
        const tip = new THREE.Mesh(own(new THREE.SphereGeometry(0.06, 8, 6)), knob);
        tip.position.set(sx * 0.23, 0.98, 0);
        g.add(ant, tip);
      }
      group.add(g);
      const ph = (k / 3) * Math.PI * 2;
      updaters.push((t) => {
        const a = t * 0.15 + ph;
        const r = VOLCANO.baseRadius * 0.62;
        const x = VOLCANO.x + Math.cos(a) * r;
        const z = VOLCANO.z + Math.sin(a) * r;
        g.position.set(x, groundAt(x, z) + 2.4 + Math.sin(t * 1.3 + ph) * 0.4, z);
        g.rotation.y = -a;
      });
    }
    // Fledermaus-Drohnen: Scheibe mit Flügeln und rotem Auge, umkreisen den Gipfel
    const droneMat = std('#2a2340', { side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 });
    const redEye = glow('#ff3d5a', 2.4);
    const wingGeo = own(new THREE.BufferGeometry());
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.5, 0.08, -0.14, 0.42, 0, 0.2, 0, 0, 0, 0.42, 0, 0.2, 0.25, -0.02, 0.24], 3));
    wingGeo.computeVertexNormals();
    for (let k = 0; k < 8; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(own(new THREE.CylinderGeometry(0.14, 0.1, 0.08, 8)), droneMat);
      const e = new THREE.Mesh(own(new THREE.SphereGeometry(0.045, 6, 4)), redEye);
      e.position.set(0, 0, 0.12);
      const l = new THREE.Mesh(wingGeo, droneMat);
      const r = new THREE.Mesh(wingGeo, droneMat);
      r.scale.x = -1;
      g.add(body, e, l, r);
      group.add(g);
      const ph = k * 1.7;
      updaters.push((t) => {
        const a = t * (0.5 + (k % 3) * 0.15) + ph;
        const rr = VOLCANO.craterRadius + 3 + (k % 4);
        g.position.set(VOLCANO.x + Math.cos(a) * rr, VOLCANO.height + 3 + Math.sin(t * 2 + ph) * 1.2, VOLCANO.z + Math.sin(a) * rr);
        g.rotation.y = -a;
        const flap = Math.sin(t * 20 + ph) * 0.5;
        l.rotation.z = flap;
        r.rotation.z = -flap;
      });
    }
    // Kürbis-Mond über dem Meer
    const moon = new THREE.Mesh(own(new THREE.CircleGeometry(24, 48)), own(new THREE.MeshBasicMaterial({ map: own(moonTexture()), transparent: true, fog: false, toneMapped: false, depthWrite: false })));
    moon.position.set(-150, 140, -230);
    moon.lookAt(0, 0, 0);
    moon.renderOrder = -6;
    group.add(moon);
  } else {
    // Kristallbäume: gestapelte Kristallkegel mit Kugeln und Stern
    const crystal = std('#9ffff0', { flatShading: true, roughness: 0.2, emissive: new THREE.Color('#2fd8c0'), emissiveIntensity: 0.55 });
    const ornaments = BULBS.map((c) => glow(c, 1.6));
    const footMat = std('#6c67a0', { roughness: 0.4, metalness: 0.3 });
    for (const s of festiveSpots(layout, 6, fr * 2.4, groundAt)) {
      const tree = new THREE.Group();
      const foot = new THREE.Mesh(own(new THREE.CylinderGeometry(0.3, 0.38, 0.3, 6)), footMat);
      foot.position.y = 0.15;
      tree.add(foot);
      [1.0, 0.78, 0.55].forEach((r, i) => {
        const cone = new THREE.Mesh(own(new THREE.ConeGeometry(r, 1.1, 6)), crystal);
        cone.position.y = 0.8 + i * 0.6;
        tree.add(cone);
        for (let k = 0; k < 6 - i; k++) {
          const a = (k / (6 - i)) * Math.PI * 2 + i;
          const ball = new THREE.Mesh(own(new THREE.SphereGeometry(0.07, 8, 6)), ornaments[(k + i) % ornaments.length]!);
          ball.position.set(Math.cos(a) * r * 0.76, cone.position.y - 0.32, Math.sin(a) * r * 0.76);
          tree.add(ball);
        }
      });
      const star = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.2)), glow('#ffd34d', 2));
      star.position.y = 2.4;
      tree.add(star);
      updaters.push((t) => (star.rotation.y = t));
      add(tree, s.x, s.y, s.z);
    }
    // Geschenk-Kapseln an Start und Ziel (leuchtende Bänder)
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
        const box = new THREE.Mesh(own(new THREE.BoxGeometry(size, size, size)), std(color, { roughness: 0.4 }));
        box.position.y = size / 2;
        const band = glow('#ffffff', 1.4);
        const r1 = new THREE.Mesh(own(new THREE.BoxGeometry(size * 1.02, size * 1.02, size * 0.16)), band);
        const r2 = new THREE.Mesh(own(new THREE.BoxGeometry(size * 0.16, size * 1.02, size * 1.02)), band);
        r1.position.y = r2.position.y = size / 2;
        const g = new THREE.Group();
        g.add(box, r1, r2);
        g.rotation.y = k * 0.7;
        add(g, x, y, z);
      }
    }
    // Schnee-Roboter neben dem Start
    {
      const f = layout.fields[1] ?? layout.fields[0]!;
      const x = f.x - Math.sin(f.heading) * fr * 3.2;
      const z = f.z + Math.cos(f.heading) * fr * 3.2;
      const y = groundAt(x, z);
      const bot = new THREE.Group();
      const snow = std('#f4f8ff', { roughness: 0.85 });
      const metal = std('#8f8cb8', { roughness: 0.4, metalness: 0.4 });
      [0.45, 0.33].forEach((r, i) => {
        const s = new THREE.Mesh(own(new THREE.SphereGeometry(r, 18, 14)), snow);
        s.position.y = [0.42, 1.04][i]!;
        bot.add(s);
      });
      const head = new THREE.Mesh(own(new THREE.BoxGeometry(0.42, 0.34, 0.36)), metal);
      head.position.y = 1.52;
      bot.add(head);
      const visor = new THREE.Mesh(own(new THREE.BoxGeometry(0.32, 0.1, 0.02)), glow('#4fe8ff', 2));
      visor.position.set(0, 1.55, 0.19);
      bot.add(visor);
      const ant = new THREE.Mesh(own(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5)), metal);
      ant.position.y = 1.84;
      const blink = new THREE.Mesh(own(new THREE.SphereGeometry(0.05, 8, 6)), glow('#ff4fa8', 2.4));
      blink.position.y = 2.0;
      bot.add(ant, blink);
      updaters.push((t) => (blink.visible = Math.sin(t * 4) > -0.3));
      const scarf = new THREE.Mesh(own(new THREE.TorusGeometry(0.27, 0.07, 6, 16).rotateX(Math.PI / 2)), std('#ff4fa8'));
      scarf.position.y = 1.3;
      bot.add(scarf);
      bot.rotation.y = Math.atan2(f.x - x, f.z - z);
      add(bot, x, y, z);
    }
    // Lichterketten: entlang des Wegs und als Ring um die Mondbasis
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
    // Basis-Ring (Wohnmodule an der Hafenbucht)
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2;
      const x = -19.6 + Math.cos(a) * 6.4;
      const z = 14.2 + Math.sin(a) * 4.2;
      const y = groundAt(x, z);
      if (y < 0.2) continue;
      pts.push(new THREE.Vector3(x, y + 0.6 + Math.abs(Math.sin(a * 6)) * 0.3, z));
    }
    const bulbs = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.07, 8, 6)), own(new THREE.MeshBasicMaterial({ toneMapped: false })), pts.length);
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
      for (let i = 0; i < pts.length; i++) bulbs.setColorAt(i, col.set(BULBS[(i + phase) % BULBS.length]!).multiplyScalar((i + phase) % 4 === 0 ? 0.35 : 1.3));
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    });
  }

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
