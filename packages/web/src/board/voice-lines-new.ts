/**
 * Neue Sprüche des Kommentators – noch OHNE Sprachdatei. Erst wenn die Dateien unter
 * /assets/voice/<id>.mp3 erzeugt sind, wandern die Zeilen nach voice-lines.ts (sonst würde der
 * Beamer Dateien abspielen wollen, die es nicht gibt). Gleiche Stimme und Regieanweisungen
 * ([laughs] …) wie dort. Zurzeit leer – alle Sprüche sind vertont.
 */
import type { VoiceCategory } from './voice-lines.ts';

export const NEW_VOICE_LINES: Partial<Record<VoiceCategory, [string, string][]>> = {};

/**
 * Entwurf: Sprüche für die Blockwelt (ersetzen dort die inselbezogenen Kategorien). Noch nicht
 * vertont – erst nach OK des Nutzers erzeugen (Kosten vorher nennen), dann als Welt-Ersatz in den
 * Kommentator übernehmen.
 */
export const BLOCK_VOICE_DRAFT: Partial<Record<VoiceCategory, [string, string][]>> = {
  spring: [
    ['bw_spring_1', 'Schleimblock! [laughs] Boing – und ab nach vorne!'],
    ['bw_spring_2', 'Wackelpudding-Katapult! Das klebt … aber es fliegt!'],
    ['bw_spring_3', 'Einmal einsinken, einmal abheben. Physik aus Blöcken!'],
  ],
  plane: [
    ['bw_plane_1', '[whispers] Psst … hört ihr das Zischen? [shouts] Lauft!'],
    ['bw_plane_2', 'Der Knaller ist da! [laughs] Und weg seid ihr – rückwärts!'],
    ['bw_plane_3', 'Sssss … BUMM! Das war knapp. Also … für euch eher nicht.'],
    ['bw_plane_4', '[sarcastic] Der Knaller wollte nur kuscheln. Hat nicht geklappt.'],
  ],
  ufo: [
    ['bw_ufo_1', 'Teleport-Perle! Und schwupps – ihr seid jetzt da drüben.'],
    ['bw_ufo_2', '[chuckles] Plätze tauschen per Portal. Bitte nicht schwindelig werden!'],
    ['bw_ufo_3', 'Einmal blinzeln – und schon steht ihr woanders.'],
  ],
  cage: [
    ['bw_cage_1', 'Spinnennetz! [laughs] Ihr klebt fest – jetzt hilft nur die richtige Zahl.'],
    ['bw_cage_2', 'Die Spinne sagt: Hier geblieben! Würfelt euch frei!'],
    ['bw_cage_3', 'Verheddert im Netz. Nicht zappeln, würfeln!'],
  ],
  vine: [
    ['bw_vine_1', 'Halt! Über den Bach geht es nur an der Ranke.'],
    ['bw_vine_2', 'Ranke schnappen – und jetzt würfeln, wie weit ihr schwingt!'],
    ['bw_vine_3', '[chuckles] Pixel-Tarzan, bitte zur Ranke!'],
  ],
  skull: [
    ['bw_skull_1', 'Oh nein – der Boden bricht weg! Ab in den Nether!'],
    ['bw_skull_2', '[dramatically] Ein Block zu wenig … und tschüss nach unten!'],
    ['bw_skull_3', 'Wer hat denn hier den Boden abgebaut?! [laughs]'],
  ],
  insideEnter: [
    ['bw_inenter_1', '[dramatically] Willkommen im Nether! Lava links, Lava rechts, Lava unten.'],
    ['bw_inenter_2', 'Netherziegel-Parcours! Bitte nicht in die Lava schauen.'],
    ['bw_inenter_3', '[laughs] Die Glutgeister schauen schon zu. Lauft!'],
  ],
  insideShout: [
    ['bw_inshout_1', 'Glowstone! Genau getroffen – raus aus dem Nether!'],
    ['bw_inshout_2', 'Volltreffer aufs Leuchtfeld! Der Ausgang ruft!'],
  ],
  insideExit: [
    ['bw_inexit_1', 'Durchs Portal und zurück ans Tageslicht!'],
    ['bw_inexit_2', '[relieved] Geschafft! Der Nether lässt euch gehen.'],
  ],
  eruption: [
    ['bw_eruption_1', '[shouts] Ausbruch! Lava-Blöcke fliegen durch die Gegend!'],
    ['bw_eruption_2', 'Der Vulkan spuckt Magma! Alles in Deckung!'],
  ],
};
