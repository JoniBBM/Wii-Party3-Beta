/**
 * Spielfelder: glänzende runde Scheiben in Feldfarbe mit weißem Rand und gezeichneten
 * Symbolen. Start als Plattform am Hafen, Ziel als goldenes Podest am Kraterrand.
 */
import * as THREE from 'three';
import { FIELD_INFO, type FieldType } from '@insel/shared';
import type { IslandLayout } from './layout.ts';

type IconDrawer = (c: CanvasRenderingContext2D, s: number) => void;

const stroke = (c: CanvasRenderingContext2D, w: number) => {
  c.strokeStyle = '#ffffff';
  c.fillStyle = '#ffffff';
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
};

const chevrons = (c: CanvasRenderingContext2D, s: number, dir: 1 | -1) => {
  stroke(c, s * 0.09);
  for (const off of [-0.13, 0.13]) {
    c.beginPath();
    c.moveTo(s * 0.3, s * (0.5 + off) + dir * s * 0.12);
    c.lineTo(s * 0.5, s * (0.5 + off) - dir * s * 0.1);
    c.lineTo(s * 0.7, s * (0.5 + off) + dir * s * 0.12);
    c.stroke();
  }
};

const ICONS: Partial<Record<FieldType, IconDrawer>> = {
  catapult_forward: (c, s) => chevrons(c, s, 1),
  catapult_backward: (c, s) => chevrons(c, s, -1),
  swap: (c, s) => {
    stroke(c, s * 0.075);
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.24, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.24, Math.PI * 0.1, Math.PI * 0.9);
    c.stroke();
    const head = (x: number, y: number, a: number) => {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a + 2.5) * s * 0.11, y + Math.sin(a + 2.5) * s * 0.11);
      c.lineTo(x + Math.cos(a - 2.5) * s * 0.11, y + Math.sin(a - 2.5) * s * 0.11);
      c.closePath();
      c.fill();
    };
    head(s / 2 + Math.cos(Math.PI * 1.9) * s * 0.24, s / 2 + Math.sin(Math.PI * 1.9) * s * 0.24, Math.PI * 0.4);
    head(s / 2 + Math.cos(Math.PI * 0.9) * s * 0.24, s / 2 + Math.sin(Math.PI * 0.9) * s * 0.24, Math.PI * 1.4);
  },
  barrier: (c, s) => {
    stroke(c, s * 0.07);
    c.beginPath();
    c.arc(s / 2, s * 0.42, s * 0.13, Math.PI, 0);
    c.stroke();
    c.beginPath();
    c.roundRect(s * 0.3, s * 0.42, s * 0.4, s * 0.3, s * 0.05);
    c.fill();
  },
  minigame: (c, s) => {
    stroke(c, s * 0.05);
    c.beginPath();
    c.roundRect(s * 0.2, s * 0.34, s * 0.6, s * 0.32, s * 0.14);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(s * 0.3, s * 0.47, s * 0.13, s * 0.05);
    c.fillRect(s * 0.34, s * 0.43, s * 0.05, s * 0.13);
    c.beginPath();
    c.arc(s * 0.62, s * 0.46, s * 0.035, 0, Math.PI * 2);
    c.arc(s * 0.69, s * 0.54, s * 0.035, 0, Math.PI * 2);
    c.fill();
  },
  volcano: (c, s) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(s * 0.5, s * 0.2);
    c.bezierCurveTo(s * 0.72, s * 0.42, s * 0.74, s * 0.6, s * 0.66, s * 0.72);
    c.bezierCurveTo(s * 0.58, s * 0.82, s * 0.42, s * 0.82, s * 0.34, s * 0.72);
    c.bezierCurveTo(s * 0.26, s * 0.6, s * 0.3, s * 0.48, s * 0.42, s * 0.36);
    c.bezierCurveTo(s * 0.42, s * 0.46, s * 0.46, s * 0.52, s * 0.5, s * 0.54);
    c.bezierCurveTo(s * 0.48, s * 0.42, s * 0.5, s * 0.3, s * 0.5, s * 0.2);
    c.fill();
  },
  goal: (c, s) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(s * 0.24, s * 0.66);
    c.lineTo(s * 0.2, s * 0.32);
    c.lineTo(s * 0.36, s * 0.46);
    c.lineTo(s * 0.5, s * 0.26);
    c.lineTo(s * 0.64, s * 0.46);
    c.lineTo(s * 0.8, s * 0.32);
    c.lineTo(s * 0.76, s * 0.66);
    c.closePath();
    c.fill();
    c.fillRect(s * 0.24, s * 0.7, s * 0.52, s * 0.07);
  },
  start: (c, s) => {
    const n = 8;
    const cell = (s * 0.6) / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 3; j++) {
        c.fillStyle = (i + j) % 2 ? '#1b2a36' : '#ffffff';
        c.fillRect(s * 0.2 + i * cell, s * 0.4 + j * cell, cell, cell);
      }
  },
};

const textureCache = new Map<string, THREE.CanvasTexture>();
function iconTexture(type: FieldType): THREE.CanvasTexture | null {
  const draw = ICONS[type];
  if (!draw) return null;
  let tex = textureCache.get(type);
  if (!tex) {
    const s = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext('2d')!;
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    draw(ctx, s);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    textureCache.set(type, tex);
  }
  return tex;
}

export interface FieldMeshes {
  group: THREE.Group;
  /** Oberkante je Feld (dort stehen die Figuren). */
  topY: number[];
  setFields: (fields: FieldType[]) => void;
  highlight: (index: number | null, color?: string) => void;
  update: (t: number) => void;
  radiusOf: (index: number) => number;
}

export function buildFields(layout: IslandLayout): FieldMeshes {
  const group = new THREE.Group();
  group.name = 'fields';
  const n = layout.fields.length;
  const r = layout.fieldRadius;
  const H = 0.22;

  const bodyGeo = new THREE.CylinderGeometry(r, r * 1.08, H, 40, 1);
  const capGeo = new THREE.SphereGeometry(r * 0.94, 40, 8, 0, Math.PI * 2, 0, Math.PI * 0.16);
  const rimGeo = new THREE.TorusGeometry(r * 0.97, 0.07, 10, 48);
  rimGeo.rotateX(Math.PI / 2);
  const shadowGeo = new THREE.CylinderGeometry(r * 1.12, r * 1.2, 0.1, 40, 1);

  const bodyMat = new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const capMat = new THREE.MeshPhysicalMaterial({ roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  const baseMat = new THREE.MeshStandardMaterial({ color: '#c8b08a', roughness: 0.95 });

  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
  const caps = new THREE.InstancedMesh(capGeo, capMat, n);
  const rims = new THREE.InstancedMesh(rimGeo, rimMat, n);
  const bases = new THREE.InstancedMesh(shadowGeo, baseMat, n);
  for (const im of [bodies, caps, rims, bases]) {
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  }

  const topY: number[] = [];
  const m = new THREE.Matrix4();
  const radii: number[] = [];
  layout.fields.forEach((f, i) => {
    const special = i === 0 || i === n - 1;
    const scale = i === 0 ? 2.1 : i === n - 1 ? 1.55 : 1;
    radii.push(r * scale);
    const y = f.y + 0.02;
    m.makeScale(scale, 1, scale).setPosition(f.x, y - 0.05, f.z);
    bases.setMatrixAt(i, m);
    m.makeScale(scale, 1, scale).setPosition(f.x, y + H / 2, f.z);
    bodies.setMatrixAt(i, m);
    m.makeScale(scale, special ? 0.35 : 0.5, scale).setPosition(f.x, y + H - r * 0.94 * Math.cos(Math.PI * 0.16) * (special ? 0.35 : 0.5), f.z);
    caps.setMatrixAt(i, m);
    m.makeScale(scale, 1, scale).setPosition(f.x, y + H, f.z);
    rims.setMatrixAt(i, m);
    topY.push(y + H + 0.04);
  });

  const icons = new THREE.Group();
  group.add(icons);
  const iconGeo = new THREE.PlaneGeometry(1, 1);
  iconGeo.rotateX(-Math.PI / 2);

  const iconMaterials = new Map<FieldType, THREE.MeshBasicMaterial>();
  const iconMaterial = (type: FieldType, tex: THREE.Texture) => {
    let m = iconMaterials.get(type);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
      iconMaterials.set(type, m);
    }
    return m;
  };
  let lastKey = '';

  const setFields = (fields: FieldType[]) => {
    // Nur neu aufbauen, wenn sich die Belegung wirklich geändert hat
    const key = fields.join(',');
    if (key === lastKey) return;
    lastKey = key;
    const c = new THREE.Color();
    icons.clear();
    layout.fields.forEach((f, i) => {
      const type = fields[i] ?? 'normal';
      c.set(type === 'start' ? '#ffffff' : FIELD_INFO[type].color);
      bodies.setColorAt(i, c.clone().multiplyScalar(0.82));
      caps.setColorAt(i, c);
      const tex = iconTexture(type);
      if (tex) {
        const icon = new THREE.Mesh(iconGeo, iconMaterial(type, tex));
        const size = radii[i]! * (type === 'start' ? 1.2 : 1.45);
        icon.scale.set(size, 1, size);
        icon.position.set(f.x, topY[i]! + 0.03, f.z);
        // Pfeile zeigen in Laufrichtung
        icon.rotation.y = -f.heading - Math.PI / 2;
        icon.renderOrder = 3;
        icons.add(icon);
      }
    });
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  };

  // Markierung für das aktive Feld (pulsierender Ring)
  const hlGeo = new THREE.RingGeometry(r * 1.15, r * 1.42, 48);
  hlGeo.rotateX(-Math.PI / 2);
  const hlMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
  const highlightMesh = new THREE.Mesh(hlGeo, hlMat);
  highlightMesh.visible = false;
  highlightMesh.renderOrder = 4;
  group.add(highlightMesh);

  return {
    group,
    topY,
    setFields,
    radiusOf: (i) => radii[i] ?? r,
    highlight(index, color) {
      if (index === null || !layout.fields[index]) {
        highlightMesh.visible = false;
        return;
      }
      const f = layout.fields[index]!;
      highlightMesh.visible = true;
      const s = (radii[index] ?? r) / r;
      highlightMesh.userData.base = s;
      highlightMesh.scale.set(s, 1, s);
      highlightMesh.position.set(f.x, topY[index]! + 0.02, f.z);
      if (color) hlMat.color.set(color);
    },
    update(t) {
      if (!highlightMesh.visible) return;
      const k = (1 + Math.sin(t * 4) * 0.06) * ((highlightMesh.userData.base as number) ?? 1);
      highlightMesh.scale.x = highlightMesh.scale.z = k;
      hlMat.opacity = 0.55 + Math.sin(t * 4) * 0.25;
    },
  };
}
