/**
 * Texte des Kommentators (Stimme: „DiMario – Moderator“, ElevenLabs, Modell eleven_v3; [..] = Regieanweisung). Die Sprachdateien liegen
 * unter /assets/voice/<id>.mp3 und wurden einmalig aus genau diesen Texten erzeugt –
 * wer einen Text ändert, muss die Datei neu erzeugen (siehe docs/entwicklung.md).
 */

export const VOICE_LINES = {
  turn: [
    ['turn_1', '[excited] Und weiter geht’s! Würfel schnappen und los!'],
    ['turn_2', '[mischievously] Wer ist dran? Genau, ihr! [laughs] Nicht einschlafen!'],
    ['turn_3', 'Auf geht’s, die Insel wartet nicht!'],
    ['turn_4', 'Nächster Kandidat, bitte!'],
    ['turn_5', 'So, jetzt ihr. [chuckles] Keine Panik, ist nur ein Würfel.'],
    ['turn_6', 'Tief durchatmen … und würfeln!'],
  ],
  six: [
    ['six_1', '[excited] Eine Sechs! Ab die Post!'],
    ['six_2', 'Sechs Augen! [laughs] Da hat wohl jemand heimlich geübt.'],
    ['six_3', 'Volltreffer, die Sechs!'],
  ],
  one: [
    ['one_1', '[sighs] Eine Eins. Naja … Schritt für Schritt.'],
    ['one_2', '[slowly] Eins! Gemütlich, gemütlich.'],
    ['one_3', 'Ein Feld. Immerhin, es geht voran!'],
  ],
  spring: [
    ['spring_1', '[excited] Boing! Und ab geht die Luzie!'],
    ['spring_2', 'Sprungfeder! Bitte anschnallen!'],
    ['spring_3', '[laughs] Hui! Das nenn ich mal eine Abkürzung!'],
  ],
  plane: [
    ['plane_1', '[sarcastic] Oh oh, das Flugzeug! Einmal Rundflug zurück, bitte.'],
    ['plane_2', 'Bitte einsteigen – der Flug geht leider rückwärts!'],
    ['plane_3', '[chuckles] Fallschirm auf! Das war ein Umweg.'],
  ],
  ufo: [
    ['ufo_1', '[mischievously] Die Aliens haben mal wieder umgeräumt!'],
    ['ufo_2', '[dramatically] Beam me up! Platztausch!'],
    ['ufo_3', 'UFO-Alarm! Und zack, die Plätze getauscht.'],
  ],
  cage: [
    ['cage_1', 'Zack, eingesperrt! Jetzt hilft nur noch die richtige Zahl.'],
    ['cage_2', 'Käfig zu! [chuckles] Da hat wohl jemand den Schlüssel verloren.'],
  ],
  free: [
    ['free_1', '[excited] Freiheit! Raus aus dem Käfig!'],
    ['free_2', 'Die Tür ist offen – nichts wie weg!'],
  ],
  fieldGame: [
    ['mgf_1', 'Minispiel-Feld! Jetzt wird’s sportlich!'],
    ['mgf_2', 'Ein Minispiel! Zeigt mal, was ihr drauf habt!'],
  ],
  pressure: [
    ['lava_1', '[nervous] Es brodelt im Vulkan … das ist kein gutes Zeichen.'],
    ['lava_2', 'Huch, der Vulkan wird langsam nervös!'],
  ],
  eruption: [
    ['erupt_1', '[shouting] Achtung! Der Vulkan spuckt! In Deckung!'],
    ['erupt_2', '[excited] Vulkanausbruch! Alle mal kurz die Köpfe einziehen!'],
  ],
  vine: [
    ['vine_1', '[excited] Ab an die Liane! Tarzan wäre stolz!'],
    ['vine_2', 'Lianen-Zeit! Gut festhalten und nochmal würfeln!'],
  ],
  swing: [
    ['swing_1', '[excited] Juhuuu! Was für ein Schwung!'],
    ['swing_2', 'Und ab durch den Dschungel!'],
  ],
  riverSafe: [
    ['rsafe_1', 'Balance wie ein Seiltänzer! Respekt!'],
    ['rsafe_2', '[nervous] Wackel, wackel … und geschafft!'],
  ],
  riverFall: [
    ['rfall_1', 'Platsch! [laughs] Hoffentlich habt ihr Badesachen dabei.'],
    ['rfall_2', 'Und tschüss – ab in den Fluss!'],
  ],
  cave: [
    ['cave_1', 'Huch, die Lavahöhle! Einmal Rutschbahn abwärts!'],
    ['cave_2', 'Ab in den Berg! [chuckles] Das war wohl die falsche Tür.'],
  ],
  craterFall: [
    ['crater_1', '[gasps] Ups! Falsche Abzweigung – ab in den Krater!'],
    ['crater_2', 'Ganz schön tief, dieses Loch. Jetzt heißt es klettern!'],
  ],
  craterOut: [['cout_1', 'Und wieder raus aus dem Loch! Starke Leistung!']],
  summit: [
    ['summit_1', '[excited] Gipfel erreicht! Jetzt fehlt nur noch der Siegeswurf!'],
    ['summit_2', 'Ganz oben! Aber Achtung: Gewonnen ist erst mit dem Siegeswurf!'],
  ],
  finalFail: [
    ['ffail_1', '[sighs] Knapp daneben ist auch vorbei! Nächste Runde nochmal.'],
    ['ffail_2', 'Oh nein, nicht genug! Der Gipfel muss noch warten.'],
  ],
  victory: [
    ['win_1', '[excited] Wir haben einen Sieger! Herzlichen Glückwunsch – ihr seid die Herrscher der Insel!'],
    ['win_2', '[shouting] Unglaublich! Das Spiel ist entschieden! Applaus, Applaus!'],
  ],
  super: [
    ['super_1', '[excited] Wahnsinn! Was für ein Zug!'],
    ['super_2', 'Das läuft ja wie geschmiert!'],
    ['super_3', '[laughs] Hammer! Da kann sich der Rest warm anziehen!'],
  ],
  happy: [
    ['happy_1', 'Sehr schön, weiter so!'],
    ['happy_2', 'Läuft bei euch!'],
    ['happy_3', 'Gar nicht schlecht!'],
  ],
  meh: [
    ['meh_1', '[sighs] Naja … da geht noch was.'],
    ['meh_2', 'Kleine Schritte sind auch Schritte.'],
  ],
  sad: [
    ['sad_1', '[softly] Autsch. Das tat weh.'],
    ['sad_2', 'Kopf hoch, das wird schon wieder!'],
    ['sad_3', '[sad] Oh je … das war nicht euer Zug.'],
  ],
  angry: [
    ['angry_1', '[laughs] Da ist aber jemand sauer!'],
    ['angry_2', '[angry] Grrr! Das ist doch nicht fair!'],
  ],
  shock: [
    ['shock_1', '[gasps] Ach du Schreck!'],
    ['shock_2', 'Na, das kam jetzt unerwartet!'],
  ],
  question: [
    ['q_1', 'Achtung, Frage! Jetzt wird’s schlau!'],
    ['q_2', 'Quizzeit! Köpfe einschalten!'],
    ['q_3', 'Und jetzt: eine Frage! Wer weiß es?'],
  ],
  estimate: [
    ['est_1', 'Schätzfrage! [mischievously] Schätzen, nicht googeln!'],
    ['est_2', 'Jetzt wird geschätzt – Pi mal Daumen!'],
  ],
  buzzer: [
    ['buzz_1', '[excited] Buzzer-Runde! Finger auf den Knopf!'],
    ['buzz_2', 'Wer zuerst drückt, darf antworten! Schnell sein!'],
  ],
  game: [
    ['game_1', 'Minispiel! Zeigt, was ihr könnt!'],
    ['game_2', '[excited] Es wird sportlich! Auf die Plätze …'],
  ],
  drawn: [
    ['drawn_1', 'Das Los hat entschieden!'],
    ['drawn_2', '[dramatically] Und gezogen wurden … diese Glückspilze!'],
  ],
  timeUp: [
    ['time_1', 'Die Zeit ist um! Finger weg vom Handy!'],
    ['time_2', '[laughs] Ding! Schluss, aus, vorbei!'],
  ],
  results: [
    ['res_1', 'Und das sind die Ergebnisse!'],
    ['res_2', '[curious] Mal sehen, wer am besten war …'],
  ],
  roundEnd: [
    ['round_1', 'Runde vorbei! Kurz durchschnaufen.'],
    ['round_2', 'Das war’s für diese Runde. Mal schauen, wie es steht!'],
  ],
  start: [
    ['start_1', '[excited] Das Spiel beginnt! Viel Glück an alle Teams!'],
    ['start_2', '[shouting] Leinen los! Das Abenteuer beginnt!'],
  ],
  lobby: [
    ['lobby_1', '[warmly] Herzlich willkommen! Scannt den Code und meldet euch an!'],
    ['lobby_2', 'Na los, anmelden! Die Insel wartet schon!'],
  ],
  right: [
    ['right_1', '[excited] Richtig!'],
    ['right_2', 'Jawoll, stimmt!'],
  ],
  wrong: [
    ['wrong_1', 'Leider falsch!'],
    ['wrong_2', '[sarcastic] Nö, das war nix.'],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

export type VoiceCategory = keyof typeof VOICE_LINES;

/** Spielerklärung: Abschnitte mit Text (wird auch als Untertitel gezeigt). */
export const EXPLAINER_LINES = [
  ['explain_01', '[excited] Hallo und herzlich willkommen auf der Insel der Abenteuer! Ich bin euer Kommentator, und in zwei Minuten wisst ihr alles, was ihr wissen müsst. [mischievously] Also: Ohren auf!'],
  ['explain_02', 'Ihr spielt in Teams. Jedes Team hat seine eigene Farbe und seine eigene Figur – die gestaltet ihr selbst auf dem Handy. Name, Frisur, Outfit, alles!'],
  ['explain_03', 'Euer Ziel: der Gipfel des Vulkans, ganz da oben. Wer zuerst oben ankommt und dann noch den Siegeswurf schafft, gewinnt das Spiel.'],
  ['explain_04', 'Jede Runde läuft gleich ab: Zuerst kommt ein Minispiel oder eine Frage. Je besser ihr abschneidet, desto größer euer Bonuswürfel. Und dann wird gewürfelt!'],
  ['explain_05', 'Bei den Fragen antwortet ihr direkt auf dem Handy: Quizfragen, Schätzfragen und Buzzer-Runden – wer zuerst drückt, darf antworten. Für die Minispiele werden Leute aus euren Teams gezogen. Also immer schön bereit sein!'],
  ['explain_06', 'Würfeln ist ganz einfach: Wenn ihr dran seid, vibriert euer Handy. Tippen oder schütteln – und eure Figur läuft los.'],
  ['explain_07', 'Unterwegs warten Sonderfelder. Die Sprungfeder katapultiert euch nach vorne. Das Flugzeug bringt euch leider zurück. [laughs] Das UFO tauscht euren Platz mit einem anderen Team. Und im Käfig sitzt ihr fest, bis ihr die richtige Zahl würfelt.'],
  ['explain_08', 'Auf einem Minispiel-Feld gibt’s ein Extra-Minispiel – wer gewinnt, darf ein paar Felder vorziehen. Und die Vulkanfelder? [mischievously] Die heizen den Vulkan an …'],
  ['explain_09', 'Dazu kommen ganz besondere Orte: Gleich am Anfang hängt die Liane – damit schwingt ihr ein Stück weiter. Im Fluss warten wackelige Fässer, da kann man schon mal baden gehen. [chuckles] Und am Vulkan lauern die Lavahöhle und das Kraterloch. Wer da reinfällt, muss erst wieder rausklettern.'],
  ['explain_10', 'Apropos Vulkan: Mit jeder Runde steigt der Druck. Ist er zu hoch, bricht er aus – [dramatically] und alle in der Nähe des Gipfels fliegen ein ganzes Stück zurück!'],
  ['explain_11', '[warmly] Das war’s auch schon! Seid fair, habt Spaß, und möge das beste Team gewinnen. [excited] Und jetzt: Ab auf die Insel!'],
] as const;

export type ExplainerLineId = (typeof EXPLAINER_LINES)[number][0];

export const voiceUrl = (id: string) => `/assets/voice/${id}.mp3`;

/** Regieanweisungen wie [laughs] für Untertitel entfernen. */
export const stripTags = (text: string) => text.replace(/\[[^\]]*\]\s*/g, '').trim();
