/**
 * Boden des Alien-Planeten: das Insel-Gelände (gleiche Form) mit eigener Farbpalette, dazu
 * schwach leuchtende Plasma-Adern an den Vulkanflanken; Alien-Gras in Bodenfarbe mit hellen Spitzen.
 */
import * as THREE from 'three';
import { VOLCANO } from '@insel/shared';
import { buildGrass } from '../grass.ts';
import { CRATER } from '../ground.ts';
import type { IslandLayout } from '../layout.ts';
import { noise2, smoothstep } from '../noise.ts';
import { buildTerrainMesh, type Heightfield } from '../terrain.ts';
import { SPACE_TERRAIN, SPACE_TERRAIN_LOOK } from './palette.ts';

export function buildSpaceTerrain(layout: IslandLayout, field: Heightfield): THREE.Mesh {
  const mesh = buildTerrainMesh(layout, field, SPACE_TERRAIN, SPACE_TERRAIN_LOOK);
  const geo = mesh.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const glow = geo.attributes.glow as THREE.BufferAttribute;
  const pathWidth = layout.fieldRadius * 1.22;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (dv > 24 || dv < CRATER.crest + 1) continue;
    // dieselben radialen Bahnen wie die erstarrten Ströme der Insel – hier als feine Leuchtadern
    const th = Math.atan2(z - VOLCANO.z, x - VOLCANO.x);
    const flow = noise2(th * 4.2 + 1.3, dv * 0.09) * 0.5 + 0.5;
    const line = smoothstep(0.06, 0.0, Math.abs(flow - 0.7));
    const cone = smoothstep(21, 13, dv) * smoothstep(7, 10.5, h);
    if (line * cone <= 0) continue;
    if (field.pathDistance(x, z) < pathWidth + 0.6) continue;
    glow.setX(i, Math.max(glow.getX(i), line * cone * 0.16));
  }
  glow.needsUpdate = true;
  return mesh;
}

/** Alien-Gras: wächst auf violettem und türkisem Boden (nicht auf rosa Sand, Weg oder Fels). */
export function buildSpaceGrass(field: Heightfield, colorAt: (x: number, z: number, out: THREE.Color) => THREE.Color, opts: { count: number; pathClear: number }): THREE.InstancedMesh {
  const tip = new THREE.Color('#b8fff0');
  return buildGrass(field, colorAt, {
    ...opts,
    accept: (c) => {
      const hi = Math.max(c.r, c.g, c.b);
      const lo = Math.min(c.r, c.g, c.b);
      // satte Farbe, nicht zu hell (Weg), blau/grün vor rot (kein Sand)
      return hi - lo > 0.12 && hi < 0.7 && (c.b > c.r * 1.25 || c.g > c.r * 1.6);
    },
    tint: (c) => c.multiplyScalar(1.04).lerp(tip, 0.08),
  });
}
