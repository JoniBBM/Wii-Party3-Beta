/**
 * Spielfelder im Weltall: sechseckige Plattformen aus Metall mit leuchtender Platte in Feldfarbe,
 * hellem Leuchtrand und Symbol. Start = großer Landeplatz (Markierung mit „H“), Ziel = goldene
 * Plattform an der Raketenrampe. Gleiche Lage, Größe und Standhöhe wie die Inselfelder.
 */
import * as THREE from 'three';
import { FIELD_INFO, type FieldType } from '@insel/shared';
import { iconTexture, type FieldMeshes } from '../fields.ts';
import type { IslandLayout } from '../layout.ts';
import { glowTime } from './kit.ts';

/** Landeplatz-Markierung (Kreis mit H) */
let padTex: THREE.CanvasTexture | null = null;
function landingTexture(): THREE.CanvasTexture {
  if (padTex) return padTex;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 8;
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = s * 0.05;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
  g.stroke();
  // gestrichelter Außenring
  g.lineWidth = s * 0.025;
  for (let k = 0; k < 16; k++) {
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.46, (k / 16) * Math.PI * 2, (k / 16 + 0.035) * Math.PI * 2);
    g.stroke();
  }
  const w = s * 0.07;
  g.fillRect(s * 0.36, s * 0.3, w, s * 0.4);
  g.fillRect(s * 0.64 - w, s * 0.3, w, s * 0.4);
  g.fillRect(s * 0.36, s * 0.47, s * 0.28, w);
  padTex = new THREE.CanvasTexture(c);
  padTex.colorSpace = THREE.SRGBColorSpace;
  padTex.anisotropy = 4;
  return padTex;
}

/** Leuchten der Instanzfarbe (Platte und Rand), pulsiert sanft */
function glowPatch(material: THREE.MeshStandardMaterial, glow: number, key: string) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowTime = glowTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(2)} * (0.85 + 0.15 * sin(uGlowTime * 2.2));`);
  };
  material.customProgramCacheKey = () => key;
}

export function buildSpaceFields(layout: IslandLayout): FieldMeshes {
  const group = new THREE.Group();
  group.name = 'space-fields';
  const n = layout.fields.length;
  const r = layout.fieldRadius;
  const H = 0.22;

  // Sechseck mit flacher Seite in Laufrichtung (Drehung je Feld)
  const bodyGeo = new THREE.CylinderGeometry(r * 1.02, r * 1.12, H, 6, 1);
  const plateGeo = new THREE.CylinderGeometry(r * 0.88, r * 0.9, 0.06, 6, 1);
  const rimGeo = new THREE.TorusGeometry(r * 0.96, 0.055, 4, 6);
  rimGeo.rotateX(Math.PI / 2);
  // Sechseck-Torus liegt um 30° gegen das Zylinder-Sechseck verdreht → angleichen
  rimGeo.rotateY(Math.PI / 6);
  const footGeo = new THREE.CylinderGeometry(r * 1.14, r * 1.24, 0.12, 6, 1);

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#5d5888', roughness: 0.45, metalness: 0.25, flatShading: true });
  const plateMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 });
  glowPatch(plateMat, 0.32, 'space-field-plate');
  const rimMat = new THREE.MeshStandardMaterial({ roughness: 0.3 });
  glowPatch(rimMat, 1.25, 'space-field-rim');
  const footMat = new THREE.MeshStandardMaterial({ color: '#3e3a66', roughness: 0.8, flatShading: true });

  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
  const plates = new THREE.InstancedMesh(plateGeo, plateMat, n);
  const rims = new THREE.InstancedMesh(rimGeo, rimMat, n);
  const feet = new THREE.InstancedMesh(footGeo, footMat, n);
  for (const im of [bodies, plates, rims, feet]) {
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  }
  rims.castShadow = false;

  const topY: number[] = [];
  const radii: number[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  layout.fields.forEach((f, i) => {
    // Furt: keine Plattform – dort liegen die Fässer bzw. Kapseln (Mutprobe)
    const scale = i === 0 ? 2.1 : i === n - 1 ? 1.55 : f.ford ? 0.0001 : 1;
    radii.push(r * scale);
    const y = f.y + (f.ford ? -0.1 : 0.02);
    q.setFromAxisAngle(up, -f.heading);
    const put = (im: THREE.InstancedMesh, py: number, sy = 1, hide = false) => {
      sc.set(hide ? 0.0001 : scale, hide ? 0.0001 : sy, hide ? 0.0001 : scale);
      im.setMatrixAt(i, m.compose(pos.set(f.x, py, f.z), q, sc));
    };
    put(feet, y - 0.05, 1, f.ford || f.bridge);
    put(bodies, y + H / 2);
    put(plates, y + H + 0.01);
    put(rims, y + H + 0.03);
    topY.push(y + H + 0.04);
  });

  const icons = new THREE.Group();
  group.add(icons);
  const iconGeo = new THREE.PlaneGeometry(1, 1);
  iconGeo.rotateX(-Math.PI / 2);
  const iconMaterials = new Map<string, THREE.MeshBasicMaterial>();
  const iconMaterial = (key: string, tex: THREE.Texture) => {
    let mm = iconMaterials.get(key);
    if (!mm) {
      mm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
      iconMaterials.set(key, mm);
    }
    return mm;
  };
  let lastKey = '';

  const setFields = (fields: FieldType[]) => {
    const key = fields.join(',');
    if (key === lastKey) return;
    lastKey = key;
    const c = new THREE.Color();
    icons.clear();
    layout.fields.forEach((f, i) => {
      const type = fields[i] ?? 'normal';
      c.set(type === 'start' ? '#dfe4f5' : type === 'goal' ? '#ffcf3d' : FIELD_INFO[type].color);
      plates.setColorAt(i, c);
      rims.setColorAt(i, c.clone().lerp(new THREE.Color('#ffffff'), 0.45));
      bodies.setColorAt(i, new THREE.Color('#ffffff'));
      const tex = f.ford ? null : type === 'start' ? landingTexture() : iconTexture(type);
      if (tex) {
        const icon = new THREE.Mesh(iconGeo, iconMaterial(type === 'start' ? 'landing' : type, tex));
        const size = radii[i]! * (type === 'start' ? 1.45 : 1.4);
        icon.scale.set(size, 1, size);
        icon.position.set(f.x, topY[i]! + 0.015, f.z);
        icon.rotation.y = -f.heading - Math.PI / 2;
        icon.renderOrder = 3;
        icons.add(icon);
      }
    });
    for (const im of [plates, rims, bodies]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };

  // Markierung des aktiven Feldes: pulsierender Sechseck-Ring
  const hlGeo = new THREE.RingGeometry(r * 1.18, r * 1.42, 6, 1);
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
      highlightMesh.rotation.y = -f.heading + Math.PI / 6;
      if (color) hlMat.color.set(color);
    },
    update(t) {
      glowTime.value = t;
      if (!highlightMesh.visible) return;
      const k = (1 + Math.sin(t * 4) * 0.06) * ((highlightMesh.userData.base as number) ?? 1);
      highlightMesh.scale.x = highlightMesh.scale.z = k;
      hlMat.opacity = 0.55 + Math.sin(t * 4) * 0.25;
    },
  };
}
