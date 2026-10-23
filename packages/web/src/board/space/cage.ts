/**
 * Sperre im Weltall: Energiekäfig um die Figur – Sockelring mit Emittern, leuchtende Stäbe, die
 * oben zu einer Kuppel zusammenlaufen, dazwischen ein flimmerndes Rautengitter (Kraftfeld).
 *
 * Alle Käfige teilen Geometrien und Materialien. Das Pulsieren braucht kein eigenes Update:
 * `onBeforeRender` des Kraftfelds stellt die gemeinsamen Materialien auf die aktuelle Zeit –
 * nur solange ein Käfig sichtbar ist und gezeichnet wird.
 * Maße wie der Insel-Käfig (Radius ≈ 0,55, Höhe ≈ 1,75), Mittelpunkt am Boden – pieces.ts
 * lässt ihn von oben herabfallen bzw. davonfliegen.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const R = 0.56;
/** Bis hier senkrecht, darüber die Kuppel */
const WALL = 1.2;
const FOOT = 0.09;
const BARS = 6;
const CYAN = '#4ff0ff';

interface Shared {
  field: THREE.LatheGeometry;
  cores: THREE.BufferGeometry;
  glows: THREE.BufferGeometry;
  base: THREE.BufferGeometry;
  baseGlow: THREE.BufferGeometry;
  apex: THREE.SphereGeometry;
  fieldMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  metalMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
  pulse: () => void;
}

let shared: Shared | null = null;

/** Profil (Radius, Höhe) von unten über die Kuppel bis zur Spitze */
function profile(steps = 10): THREE.Vector2[] {
  const pts = [new THREE.Vector2(R, FOOT), new THREE.Vector2(R, WALL)];
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * R), WALL + Math.sin(a) * R));
  }
  return pts;
}

/** Rautengitter (kachelbar) für das Kraftfeld – schwarz = durchsichtig (additiv) */
function latticeTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(40,150,190,0.22)';
  ctx.fillRect(0, 0, s, s);
  const lines = (width: number, style: string) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const o of [-s, 0, s]) {
      ctx.moveTo(o, 0);
      ctx.lineTo(o + s, s);
      ctx.moveTo(o + s, 0);
      ctx.lineTo(o, s);
    }
    ctx.stroke();
  };
  lines(7, 'rgba(80,220,255,0.45)');
  lines(2.2, 'rgba(225,255,255,1)');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 4);
  return t;
}

/** Senkrechter Verlauf: unten und an der Kuppel kräftiger, in der Mitte zarter */
function fadeTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.16, '#7a7a7a');
  g.addColorStop(0.5, '#4a4a4a');
  g.addColorStop(0.78, '#8a8a8a');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

/** Stab: senkrecht hoch, über die Kuppel und auf der anderen Seite wieder herunter */
function meridian(angle: number, radius: number): THREE.TubeGeometry {
  const pts: THREE.Vector3[] = [];
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const prof = profile(14);
  const half = prof.map((p) => new THREE.Vector3(dx * p.x, p.y, dz * p.x));
  pts.push(...half);
  for (let i = half.length - 2; i >= 0; i--) pts.push(new THREE.Vector3(-half[i]!.x, half[i]!.y, -half[i]!.z));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 72, radius, 6, false);
}

function build(): Shared {
  const prof = profile();
  const field = new THREE.LatheGeometry(prof, 40);
  const coresList: THREE.BufferGeometry[] = [];
  const glowsList: THREE.BufferGeometry[] = [];
  for (let i = 0; i < BARS / 2; i++) {
    const a = (i / BARS) * Math.PI * 2;
    coresList.push(meridian(a, 0.016));
    glowsList.push(meridian(a, 0.04));
  }
  const cores = mergeGeometries(coresList)!;
  const glows = mergeGeometries(glowsList)!;
  for (const g of [...coresList, ...glowsList]) g.dispose();

  // Sockel: Metallring mit Emitter-Klötzen am Fuß jedes Stabs
  const parts: THREE.BufferGeometry[] = [];
  const ring = new THREE.TorusGeometry(R, 0.06, 8, 40);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.06, 0);
  parts.push(ring);
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2;
    const b = new THREE.BoxGeometry(0.12, 0.13, 0.12);
    b.rotateY(-a);
    b.translate(Math.cos(a) * R, 0.08, Math.sin(a) * R);
    parts.push(b);
  }
  const base = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  const baseGlow = new THREE.TorusGeometry(R, 0.022, 6, 48);
  baseGlow.rotateX(Math.PI / 2);
  baseGlow.translate(0, 0.13, 0);

  const map = latticeTexture();
  const fieldMat = new THREE.MeshBasicMaterial({
    color: CYAN,
    map,
    alphaMap: fadeTexture(),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const coreMat = new THREE.MeshBasicMaterial({ color: '#eafeff' });
  const glowMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#4a5566', roughness: 0.35, metalness: 0.6, emissive: '#0b3a44', emissiveIntensity: 0.6 });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#9ffaff' });

  const pulse = () => {
    const t = performance.now() / 1000;
    const p = 0.5 + 0.5 * Math.sin(t * 3.4);
    fieldMat.opacity = 0.32 + p * 0.25;
    glowMat.opacity = 0.2 + p * 0.2;
    // Energie strömt nach oben
    map.offset.set((t * 0.03) % 1, (-t * 0.35) % 1);
  };

  return { field, cores, glows, base, baseGlow, apex: new THREE.SphereGeometry(0.06, 14, 10), fieldMat, coreMat, glowMat, metalMat, ringMat, pulse };
}

export function buildEnergyCage(): THREE.Group | null {
  shared ??= build();
  const s = shared;
  const g = new THREE.Group();
  g.name = 'energy-cage';
  const field = new THREE.Mesh(s.field, s.fieldMat);
  field.renderOrder = 3;
  field.onBeforeRender = s.pulse;
  g.add(field);
  const cores = new THREE.Mesh(s.cores, s.coreMat);
  g.add(cores);
  const glows = new THREE.Mesh(s.glows, s.glowMat);
  glows.renderOrder = 3;
  g.add(glows);
  const base = new THREE.Mesh(s.base, s.metalMat);
  base.castShadow = true;
  g.add(base);
  g.add(new THREE.Mesh(s.baseGlow, s.ringMat));
  const apex = new THREE.Mesh(s.apex, s.coreMat);
  apex.position.y = WALL + R;
  g.add(apex);
  return g;
}
