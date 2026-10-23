/**
 * Namen der Mutproben, Sonderfelder und Orte je Welt – Regeln sind überall gleich, nur die Begriffe
 * wechseln (Insel: Liane, Fässer, Lavahöhle, Vulkan-Inneres · Blockwelt: Ranke, Nether · Weltall:
 * Greifhaken, Kapseln, Kristallhöhle, Alien-Höhle). Genutzt von Verlauf, Handys, Regie und Beamer.
 */
import type { FieldType, Theme } from './constants.ts';

export interface WorldWords {
  /** Liane / Ranke / Greifhaken */
  vine: string;
  /** mit Artikel im Dativ: „an der Liane“ */
  atVine: string;
  /** Richtung: „an die Liane“ */
  toVine: string;
  vineIcon: string;
  /** Wasserlauf, über den man schwingt */
  creek: string;
  /** Ort der Wahl zwischen Fässern und Kisten */
  falls: string;
  /** Wahl am Wasserfall: barrels/crates */
  barrels: string;
  crates: string;
  barrelsIcon: string;
  cratesIcon: string;
  /** „Fässer oder Kisten“ */
  riverChoice: string;
  /** Lavahöhle / Kristallhöhle */
  cave: string;
  caveIcon: string;
  /** Vulkan-Inneres / Nether / Alien-Höhle */
  inside: string;
  insideIcon: string;
  /** „ins Vulkan-Innere“ */
  toInside: string;
  /** „verlässt den Vulkan“ */
  leaveInside: string;
  /** „im Vulkan“ */
  inInside: string;
  /** Strafweg-Platten: „die Lava-Inseln“ */
  insidePath: string;
  /** Ziel des Strafwegs: „zum Ausgang“ */
  insideGoal: string;
  /** wer einbricht: „schwimmt rüber“ */
  swims: string;
  /** Einbruch: „Krach – Platsch!“ */
  splash: string;
  /** Sieger: „Herrscher der Insel!“ */
  ruler: string;
  /** Name der Welt für Sätze: „die Insel“ */
  home: string;
  /** „über die Insel“ (wohin man läuft) */
  overHome: string;
  /** Begrüßung in der Lobby */
  welcome: string;
  /** Untertitel beim Sieg: „Sieger der Insel“ */
  winnerOf: string;
  /** eigene Namen für Sonderfelder (sonst FIELD_INFO) */
  fields: Partial<Record<FieldType, { label: string; icon: string }>>;
}

export const WORLD_WORDS: Record<Theme, WorldWords> = {
  island: {
    vine: 'Liane',
    atVine: 'an der Liane',
    toVine: 'an die Liane',
    vineIcon: '🌿',
    creek: 'Bach',
    falls: 'Wasserfall',
    barrels: 'Fässer',
    crates: 'Kisten',
    barrelsIcon: '🛢️',
    cratesIcon: '📦',
    riverChoice: 'Fässer oder Kisten',
    cave: 'Lavahöhle',
    caveIcon: '🦇',
    inside: 'Vulkan-Inneres',
    insideIcon: '🌋',
    toInside: 'ins Vulkan-Innere',
    leaveInside: 'verlässt den Vulkan',
    inInside: 'im Vulkan',
    insidePath: 'die Lava-Inseln',
    insideGoal: 'zum Ausgang',
    swims: 'schwimmt rüber',
    splash: 'Krach – Platsch!',
    ruler: 'Herrscher der Insel!',
    home: 'die Insel',
    overHome: 'über die Insel',
    welcome: 'Willkommen auf der Insel! 🌴',
    winnerOf: 'Sieger der Insel',
    fields: {},
  },
  blocks: {
    vine: 'Ranke',
    atVine: 'an der Ranke',
    toVine: 'an die Ranke',
    vineIcon: '🌿',
    creek: 'Bach',
    falls: 'Wasserfall',
    barrels: 'Fässer',
    crates: 'Kisten',
    barrelsIcon: '🛢️',
    cratesIcon: '📦',
    riverChoice: 'Fässer oder Kisten',
    cave: 'Lavahöhle',
    caveIcon: '🦇',
    inside: 'Nether',
    insideIcon: '🔥',
    toInside: 'in den Nether',
    leaveInside: 'verlässt den Nether',
    inInside: 'im Nether',
    insidePath: 'die Netherziegel',
    insideGoal: 'zum Portal',
    swims: 'schwimmt rüber',
    splash: 'Krach – Platsch!',
    ruler: 'Herrscher der Blockwelt!',
    home: 'die Blockwelt',
    overHome: 'durch die Blockwelt',
    welcome: 'Willkommen in der Blockwelt! ⛏️',
    winnerOf: 'Sieger der Blockwelt',
    fields: {
      catapult_forward: { label: 'Schleimblock', icon: '🟩' },
      catapult_backward: { label: 'Knaller', icon: '💥' },
      swap: { label: 'Teleport-Perle', icon: '🔮' },
      barrier: { label: 'Spinnennetz', icon: '🕸️' },
      skull: { label: 'Boden bricht weg', icon: '💀' },
    },
  },
  space: {
    vine: 'Greifhaken',
    atVine: 'am Greifhaken',
    toVine: 'an den Greifhaken',
    vineIcon: '🪝',
    creek: 'Plasma-Bach',
    falls: 'Plasmafall',
    barrels: 'Kapseln',
    crates: 'Kisten',
    barrelsIcon: '💊',
    cratesIcon: '📦',
    riverChoice: 'Kapseln oder Kisten',
    cave: 'Kristallhöhle',
    caveIcon: '💎',
    inside: 'Alien-Höhle',
    insideIcon: '👽',
    toInside: 'in die Alien-Höhle',
    leaveInside: 'verlässt die Alien-Höhle',
    inInside: 'in der Alien-Höhle',
    insidePath: 'die Kristallinseln',
    insideGoal: 'zum Teleporter',
    swims: 'schwebt rüber',
    splash: 'Blubb – versunken!',
    ruler: 'Herrscher des Planeten!',
    home: 'der Planet',
    overHome: 'über den Planeten',
    welcome: 'Willkommen auf dem Planeten! 🚀',
    winnerOf: 'Sieger des Planeten',
    fields: {
      catapult_forward: { label: 'Jetpack', icon: '🚀' },
      catapult_backward: { label: 'Schwarzes Loch', icon: '🕳️' },
      swap: { label: 'Teleporter', icon: '🌀' },
      barrier: { label: 'Energiekäfig', icon: '⚡' },
      skull: { label: 'Wurmloch', icon: '🌀' },
    },
  },
};

export const worldWords = (theme: Theme | undefined | null): WorldWords => WORLD_WORDS[theme ?? 'island'] ?? WORLD_WORDS.island;
