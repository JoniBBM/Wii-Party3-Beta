/**
 * Farben des Alien-Planeten: Boden (gleiche Flächen wie die Insel, andere Farben), Plasma statt
 * Wasser, Himmel, Licht und Glut. Freundlich und hell (Beamer), nicht dunkel-realistisch.
 */
import * as THREE from 'three';
import type { AmbientLook } from '../ambient.ts';
import type { TerrainPalette } from '../terrain.ts';
import type { WaterLook } from '../water.ts';
import type { TerrainLook } from '../worldfx.ts';

const C = (hex: string) => new THREE.Color(hex);

/** Boden: violette Wiesen, türkise Wälder, rosa Strände, dunkles Vulkangestein mit Minz-Schwefel */
export const SPACE_TERRAIN: TerrainPalette = {
  seabed: C('#3f8f9a'),
  seagrass: C('#6a5fc0'),
  seabedDeep: C('#2a6f80'),
  sandWet: C('#d98fc0'),
  sand: C('#f5b8d6'),
  sandLight: C('#ffd6ea'),
  grassLight: C('#c8a2f5'),
  grass: C('#9a78e6'),
  grassDark: C('#7258cf'),
  grassGold: C('#62d6c6'),
  meadow: C('#d6a6f0'),
  earth: C('#8a6ab8'),
  jungle: C('#38b3a6'),
  jungleFloor: C('#2a948f'),
  plateau: C('#6fdcc0'),
  path: C('#f1ecfb'),
  pathEdge: C('#c2b3e6'),
  pathStone: C('#dcd4f0'),
  mud: C('#5f468f'),
  pebbles: C('#9a8fc6'),
  rockLight: C('#c0b6ea'),
  rock: C('#8e84c4'),
  rockDark: C('#5d5594'),
  rockRed: C('#cf86bf'),
  ash: C('#6b5d96'),
  basalt: C('#4a3f72'),
  lavaRock: C('#372d5e'),
  lavaRed: C('#b04a9e'),
  sulfur: C('#86ffc0'),
  crater: C('#2a1e48'),
};

/** Glühen im Krater (Plasma, türkis-grün) und Lichtnetze unter dem Plasma */
export const SPACE_TERRAIN_LOOK: TerrainLook = { key: 'space', glow: [0.15, 1.0, 0.72], caustic: [0.55, 1.0, 0.85], frost: true };

/** Plasma-Meer, -Fluss und -Fall */
export const SPACE_WATER: WaterLook = {
  shallow: '#86ffd6',
  mid: '#3fe6c4',
  deep: '#17b3aa',
  far: '#128a98',
  sky: '#d8fff6',
  foam: '#eafff6',
  glow: 0.4,
  glowColor: '#7dffd8',
  river: { shallow: '#8affd2', deep: '#18b8a8', foam: '#f0fff8', sheen: '#e2d6ff' },
  fall: { body: '#5ef5c8', streak: '#f2fffb', foam: '#d8fff0', mist: '#c8ffe8' },
};

/** Lampen (statt Fackeln) und Dampf */
export const SPACE_AMBIENT: AmbientLook = { fire: ['#d6fff2', '#3cf0c8'], smoke: ['#f4ecff', '#c9bce8'] };

/** Himmel: violetter Zenit, türkiser Horizont, Dunst in Horizontfarbe */
export const SPACE_SKY = {
  zenith: C('#5a3fd0'),
  mid: C('#9a86f0'),
  horizon: C('#b2ecf0'),
  sun: C('#fff3fb'),
};

/** Licht: leicht rosa Sonne, lila Himmelslicht, violetter Gegenschein vom Boden */
export const SPACE_LIGHT = {
  sun: '#fff0f8',
  sunIntensity: 3.0,
  hemiSky: '#e6dcff',
  hemiGround: '#6a58a8',
  hemiIntensity: 1.05,
  fogNear: 150,
  fogFar: 430,
};

/** Kenney-Weltraumteile: Orange → Magenta-Akzent, Metall leicht lila */
export const KIT_COLORS: Record<string, string> = {
  metalRed: '#ff5fb4',
  metal: '#eef0fb',
  metalDark: '#b4b2d8',
  dark: '#3d3a63',
  rock: '#9b7fd0',
  rockTrack: '#a88ad8',
  rockDark: '#6c58a8',
  crystal: '#5cffd8',
};
