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
    ['vine_3', '[excited] Stopp! Hier geht’s nur mit der Liane über den Bach!'],
  ],
  swing: [
    ['swing_1', '[excited] Juhuuu! Was für ein Schwung!'],
    ['swing_2', 'Und ab durch den Dschungel!'],
    ['swing_3', 'Und der Rest des Wurfs zählt weiter. Ab dafür!'],
  ],
  riverChoose: [
    ['rch_1', '[curious] Fässer oder Kisten? Das ist hier die Frage!'],
    ['rch_2', '[mischievously] Eins davon hält, eins davon bricht. Viel Glück beim Raten!'],
    ['rch_3', 'Jetzt bloß nicht ins Wasser gucken … einfach wählen!'],
  ],
  riverSafe: [
    ['rsafe_1', 'Balance wie ein Seiltänzer! Respekt!'],
    ['rsafe_2', '[nervous] Wackel, wackel … und geschafft!'],
    ['rsafe_3', '[excited] Richtig gewählt! Trockene Füße und weiter geht’s!'],
  ],
  riverFall: [
    ['rfall_1', 'Platsch! [laughs] Hoffentlich habt ihr Badesachen dabei.'],
    ['rfall_2', 'Und tschüss – ab in den Fluss!'],
    ['rfall_3', '[laughs] Falsch gewählt! Der Rest des Wurfs geht baden.'],
    ['rfall_4', 'Platsch! Schwimmen statt laufen – das kostet den restlichen Wurf.'],
  ],
  cave: [
    ['cave_1', 'Huch, die Lavahöhle! Einmal Rutschbahn abwärts!'],
    ['cave_2', 'Ab in den Berg! [chuckles] Das war wohl die falsche Tür.'],
    ['cave_3', '[laughs] Zu klein gewürfelt! Einmal Vulkan von innen, bitte!'],
  ],
  caveStop: [
    ['cstop_1', '[nervous] Die Lavahöhle! Jetzt bloß nicht zu klein würfeln …'],
    ['cstop_2', 'Mutprobe an der Höhle! Hoch würfeln, sonst geht’s abwärts!'],
    ['cstop_3', '[dramatically] Es wird heiß! Würfel raus, Daumen drücken!'],
  ],
  cavePass: [
    ['cpass_1', '[relieved] Puh! Geschafft! Die Höhle muss warten.'],
    ['cpass_2', '[excited] Mutig vorbei! Weiter geht’s!'],
  ],
  skull: [
    ['skull_1', '[gasps] Ein Totenkopf! Oh oh … der Boden gibt nach!'],
    ['skull_2', '[dramatically] Totenkopf-Feld! Das war’s mit dem Sonnenbad – ab in den Vulkan!'],
  ],
  insideEnter: [
    ['inenter_1', '[dramatically] Willkommen im Inneren des Vulkans! Hier ist es … etwas wärmer.'],
    ['inenter_2', '[laughs] Strafrunde über der Lava! Bitte nicht runterschauen.'],
    ['inenter_3', 'Sauna-Modus aktiviert! Lauft, so schnell ihr könnt!'],
  ],
  insideShout: [
    ['shout_1', '[shouting] Volltreffer! Genau aufs Ausgangsfeld – raus hier!'],
    ['shout_2', '[excited] Abkürzung gefunden! Und ab durchs Portal!'],
  ],
  insideExit: [
    ['inexit_1', '[relieved] Endlich wieder frische Luft!'],
    ['inexit_2', 'Raus aus dem Vulkan! Leicht angekokelt, aber gut gelaunt.'],
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
  // ab hier: nur „viel“ und „Quatschkopf“ – Geplauder zwischendurch
  chat: [
    ['chat_1', 'Ich sag’s euch, so ein Inselleben ist schon was Feines. Außer der Vulkan. Der ist schlecht gelaunt.'],
    ['chat_2', '[curious] Wer liegt eigentlich vorne? [chuckles] Ach ja, ich seh’s ja.'],
    ['chat_3', 'Ich mach hier übrigens alles ehrenamtlich. Für Kokosnüsse.'],
    ['chat_4', '[whispers] Psst. Ich glaube, der Affe da hinten schummelt.'],
    ['chat_5', 'Wisst ihr, was das Beste an dieser Insel ist? Kein WLAN-Passwort. Ach nee, Moment …'],
    ['chat_6', 'Bleibt dran, Leute. Hier passiert gleich wieder was. Wahrscheinlich.'],
    ['chat_7', '[sighs] Ein Kommentator hat’s schon schwer. Immer reden, nie würfeln.'],
    ['chat_8', 'Die Stimmung ist großartig! Also, bei mir jedenfalls.'],
  ],
  waiting: [
    ['wait_1', 'Hallo? Würfeln, bitte! Der Würfel beißt nicht.'],
    ['wait_2', '[sighs] Ich werd hier noch braun vor lauter Warten.'],
    ['wait_3', '[mischievously] Tick, tack … der Vulkan wartet auch nicht ewig!'],
    ['wait_4', 'Ist da jemand eingeschlafen? Tippen, Leute, tippen!'],
  ],
  thinking: [
    ['think_1', 'Denkt nach! Ich höre hier förmlich die Köpfe rauchen.'],
    ['think_2', '[whispers] Ich weiß die Antwort. Aber ich sag nix.'],
    ['think_3', 'Nicht beim Nachbarn abschreiben! [chuckles] Okay, ein bisschen vielleicht.'],
  ],
  // nur „Quatschkopf“: Lästern und dumme Sprüche
  leader: [
    ['lead_1', '[mischievously] Na, da vorne? Hochmut kommt vor dem Fall. Oder vor dem Vulkan.'],
    ['lead_2', 'Die Führenden tun so cool. Dabei zittern denen schon die Knie.'],
    ['lead_3', '[laughs] Genießt es, solange es dauert! Das UFO hat eure Adresse.'],
    ['lead_4', 'Führung ist wie Eis am Strand. Schmilzt schneller, als man denkt.'],
  ],
  last: [
    ['last_1', '[laughs] Und das Schlusslicht? Irgendwer muss ja das Licht ausmachen.'],
    ['last_2', 'Ganz hinten ist auch eine Position. Eine sehr entspannte sogar.'],
    ['last_3', '[sarcastic] Ihr seid nicht Letzte. Ihr seid nur … sehr weit von den Ersten entfernt.'],
    ['last_4', 'Keine Sorge, ihr seid nicht langsam. Die anderen sind nur schneller.'],
  ],
  dumb: [
    ['dumb_1', 'Ich hab mal versucht, eine Kokosnuss zu würfeln. Ging nicht. Die rollt nur.'],
    ['dumb_2', '[curious] Warum heißt es eigentlich Würfel? Ist doch eher ein … Würfel. Okay, passt.'],
    ['dumb_3', 'Fun Fact: Vulkane sind eigentlich nur sehr wütende Berge.'],
    ['dumb_4', 'Ich bin übrigens auch eine Insel. Eine Insel der Ruhe. [laughs] Nein, Quatsch.'],
    ['dumb_5', '[whispers] Wenn ihr ganz leise seid, hört ihr die Fische lachen.'],
    ['dumb_6', 'Mein Arzt sagt, ich soll weniger reden. [laughs] Der hat keine Ahnung.'],
    ['dumb_7', 'Wisst ihr, was ein Pirat am liebsten würfelt? Sechs-Arrr! [laughs] Sorry.'],
    ['dumb_8', 'Was ist gelb und kann nicht schwimmen? Ein Bagger. [laughs] Hat mit dem Spiel nichts zu tun.'],
    ['dumb_9', '[sighs] Ich hab heute Morgen einen Papagei nach dem Weg gefragt. Der hat nur nachgeplappert.'],
    ['dumb_10', 'Taktik-Tipp: Einfach immer eine Sechs würfeln. Bitte, gern geschehen.'],
  ],
  mockBad: [
    ['mbad_1', '[laughs] Hahaha! Entschuldigung. [laughs] Nein, eigentlich nicht.'],
    ['mbad_2', 'Autsch! Das zeigen wir gleich nochmal in Zeitlupe. [chuckles] Spaß.'],
    ['mbad_3', '[sarcastic] Super Strategie! Wirklich. Ganz toll.'],
    ['mbad_4', 'Ich hätte das genauso gemacht. [laughs] Nee, hätte ich nicht.'],
  ],
  mockGood: [
    ['mgood_1', '[sarcastic] Pures Glück. Können ist was anderes.'],
    ['mgood_2', 'Okay, okay, nicht schlecht. Aber bildet euch bloß nix drauf ein!'],
    ['mgood_3', '[mischievously] Schöner Zug! Bestimmt geschummelt.'],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

export type VoiceCategory = keyof typeof VOICE_LINES;

/**
 * Spielerklärung: kurze Sätze, damit jede Vorführung genau zum gesprochenen Wort startet
 * (wird auch als Untertitel gezeigt). Abschnitte und Vorführungen: pages/beamer/Explainer.tsx.
 */
export const EXPLAINER_LINES = [
  ['ex_welcome', '[excited] Hallo und herzlich willkommen auf der Insel der Abenteuer! Ich bin euer Kommentator, und in drei Minuten wisst ihr alles, was ihr wissen müsst. [mischievously] Also: Ohren auf!'],
  ['ex_devices', 'Gespielt wird mit dem Handy, dem Tablet oder dem Laptop – Hauptsache, ein Browser ist drauf. Einfach den Code scannen oder die Adresse eintippen.'],
  ['ex_teams', 'Ihr spielt in Teams. Jedes Team hat eine eigene Farbe und eine eigene Figur – die gestaltet ihr selbst. Name, Frisur, Outfit, alles!'],
  ['explain_03', 'Euer Ziel: der Gipfel des Vulkans, ganz da oben. Wer zuerst oben ankommt und dann noch den Siegeswurf schafft, gewinnt das Spiel.'],
  ['explain_04', 'Jede Runde läuft gleich ab: Zuerst kommt ein Minispiel oder eine Frage. Je besser ihr abschneidet, desto größer euer Bonuswürfel. Und dann wird gewürfelt!'],
  ['ex_questions', 'Bei den Fragen antwortet ihr direkt auf eurem Gerät: Quizfragen, Schätzfragen und Buzzer-Runden.'],
  ['ex_doubletap', '[mischievously] Profi-Tipp: Bei Antworten wie A, B, C oder D einfach doppelt tippen – dann ist eure Antwort sofort eingeloggt. Ohne extra Bestätigen!'],
  ['ex_minigames', 'Für die Minispiele werden Leute aus euren Teams gezogen. Also immer schön bereit sein!'],
  ['ex_dice', 'Würfeln ist ganz einfach: Wenn ihr dran seid, tippt ihr auf den Würfel – am Handy dürft ihr auch schütteln. Und schon läuft eure Figur los.'],
  ['ex_spring', 'Unterwegs warten Sonderfelder. Die Sprungfeder katapultiert euch nach vorne!'],
  ['ex_plane', 'Das Flugzeug bringt euch leider wieder zurück. [laughs]'],
  ['ex_ufo', 'Das UFO tauscht euren Platz mit einem anderen Team – mal Glück, mal Pech.'],
  ['ex_cage', 'Und im Käfig sitzt ihr fest, bis ihr die richtige Zahl würfelt.'],
  ['ex_gamefield', 'Auf dem Minispiel-Feld gibt’s ein Extra-Minispiel. Wer gewinnt, darf ein paar Felder vorziehen.'],
  ['ex_volcanofield', 'Und die Vulkanfelder? [mischievously] Die heizen den Vulkan an …'],
  ['ex_vine', 'Dann die Mutproben! An der Liane kommt keiner vorbei: Ihr schwingt über den Bach, der Würfel sagt, wie weit – und der Rest eures Wurfs zählt weiter.'],
  ['ex_river', 'Am Wasserfall heißt es: Fässer oder Kisten? Eins davon hält, das andere bricht. [laughs] Wer reinfällt, schwimmt rüber – und der restliche Wurf ist futsch.'],
  ['ex_cave', 'Vor der Lavahöhle braucht ihr eine Drei oder mehr. Sonst geht’s ab ins Innere des Vulkans!'],
  ['ex_skull', '[dramatically] Genau wie auf den Totenkopf-Feldern. Da drin lauft ihr ein paar Straffelder über die Lava. Wer genau das leuchtende Feld trifft, kommt früher raus.'],
  ['ex_crater', 'Und wer am Kraterloch zu kurz würfelt, rutscht hinein und muss erst wieder rausklettern.'],
  ['ex_pressure', 'Apropos Vulkan: Mit jeder Runde steigt der Druck.'],
  ['ex_eruption', '[dramatically] Ist er zu hoch, bricht er aus – und alle in der Nähe des Gipfels fliegen ein ganzes Stück zurück!'],
  ['explain_11', '[warmly] Das war’s auch schon! Seid fair, habt Spaß, und möge das beste Team gewinnen. [excited] Und jetzt: Ab auf die Insel!'],
] as const;

export type ExplainerLineId = (typeof EXPLAINER_LINES)[number][0];

export const voiceUrl = (id: string) => `/assets/voice/${id}.mp3`;

/** Regieanweisungen wie [laughs] für Untertitel entfernen. */
export const stripTags = (text: string) => text.replace(/\[[^\]]*\]\s*/g, '').trim();
