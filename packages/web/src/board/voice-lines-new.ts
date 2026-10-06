/**
 * Neue Sprüche des Kommentators – noch OHNE Sprachdatei. Erst wenn die Dateien unter
 * /assets/voice/<id>.mp3 erzeugt sind, wandern die Zeilen nach voice-lines.ts (sonst würde der
 * Beamer Dateien abspielen wollen, die es nicht gibt). Gleiche Stimme und Regieanweisungen
 * ([laughs] …) wie dort.
 */
import type { VoiceCategory } from './voice-lines.ts';

export const NEW_VOICE_LINES: Partial<Record<VoiceCategory, [string, string][]>> = {
  // --- Tiere: nur, wenn sie gerade im Bild sind ------------------------------------------
  seeMonkey: [
    ['see_monkey_2', '[laughs] Schaut mal, der Affe! Der hat mehr Spaß als ihr alle zusammen.'],
    ['see_monkey_3', 'Der Affe da guckt, als wüsste er schon, wer gewinnt. [whispers] Und er lacht.'],
  ],
  seeDolphin: [
    ['see_dolphin_1', '[excited] Da hinten, Delfine! Die springen höher als eure Würfelergebnisse.'],
    ['see_dolphin_2', 'Oh, Delfine! Die sind übrigens schlauer als die meisten hier. [chuckles] War nur Spaß. Ein bisschen.'],
  ],
  seeWhale: [
    ['see_whale_1', '[amazed] Wow, ein Wal! Der ist größer als euer Vorsprung.'],
    ['see_whale_2', 'Da draußen pustet ein Wal. Der hat bestimmt auch keine Lust mehr auf eure Züge.'],
  ],
  seeTurtle: [
    ['see_turtle_1', 'Eine Schildkröte! Fast so schnell wie das Team auf dem letzten Platz.'],
    ['see_turtle_2', 'Die Schildkröte da hat einen Plan. Langsam – aber immerhin einen Plan.'],
  ],
  seeFlamingo: [
    ['see_flamingo_1', 'Flamingos! Stehen auf einem Bein und sehen trotzdem cooler aus als ich.'],
    ['see_flamingo_2', '[whispers] Die Flamingos schauen zu. Bitte benehmt euch.'],
  ],
  seeParrot: [
    ['see_parrot_1', 'Ein Papagei! Der plappert gleich alles nach. Also bitte nichts Peinliches sagen.'],
    ['see_parrot_2', 'Der bunte Vogel da hätte die letzte Frage bestimmt gewusst.'],
  ],
  seeCrab: [
    ['see_crab_1', 'Die Krabbe läuft seitwärts. Genau wie eure Taktik.'],
    ['see_crab_2', '[whispers] Vorsicht, eine Krabbe. Die zwickt Schummler.'],
  ],
  seeGull: [
    ['see_gull_1', 'Die Möwen kreisen. Die warten auf Pommes. Oder auf euren Absturz.'],
    ['see_gull_2', '[sighs] Möwen. Klauen Pommes und lachen dabei. Wie mein Bruder.'],
  ],
  seeFrog: [['see_frog_1', 'Ein Frosch! Der springt sogar ohne Sprungfeder weiter als manche hier.']],

  // --- bodenlose Witze --------------------------------------------------------------------
  joke: [
    ['joke_1', 'Warum hat der Vulkan keine Freunde? [laughs] Weil er immer gleich in die Luft geht.'],
    ['joke_2', 'Was sagt ein Vulkan zum anderen? [romantic] Ich lava dich.'],
    ['joke_3', 'Wie nennt man einen Bumerang, der nicht zurückkommt? [deadpan] Stock.'],
    ['joke_4', 'Was ist grün und klopft an die Tür? Ein Klopfsalat. [laughs] Ich weiß. Ich weiß.'],
    ['joke_5', 'Was macht ein Pirat am Computer? Er drückt die Enter-Taste. [laughs] Arrr.'],
    ['joke_6', 'Was ist orange und läuft durch den Wald? Eine Wanderine.'],
    ['joke_7', 'Was sitzt im Dschungel und schummelt? Mogli. [chuckles]'],
    ['joke_8', 'Was ist ein Keks unter einem Baum? Ein schattiges Plätzchen.'],
    ['joke_9', 'Warum können Seeräuber keinen Kreis berechnen? Weil sie Pi raten. [laughs] Den hab ich von einem Papagei.'],
    ['joke_10', 'Wie nennt man einen Spanier, der sein Auto verloren hat? Carlos. [sighs] Tut mir leid.'],
    ['joke_11', 'Was ist klein, grün und dreieckig? [deadpan] Ein kleines grünes Dreieck.'],
    ['joke_12', 'Warum summen Bienen? Weil sie den Text vergessen haben.'],
    ['joke_13', 'Was macht ein Clown im Büro? Faxen. [laughs] Den kennt ihr noch nicht, der ist nur dreißig Jahre alt.'],
    ['joke_14', 'Was ist braun und schwimmt im Meer? Ein U-Brot.'],
    ['joke_15', 'Was macht ein Mathematiker im Garten? Wurzeln ziehen.'],
    ['joke_16', 'Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht.'],
    ['joke_17', 'Was sagt der große Stift zum kleinen Stift? Wachs-mal-Stift! [laughs] Ich geh dann mal.'],
    ['joke_18', 'Wie heißt der Bruder von Elvis? Zwölfis.'],
    ['joke_19', 'Was ist weiß und stört beim Essen? Eine Lawine. [chuckles] Gut, nicht auf dieser Insel.'],
    ['joke_20', 'Treffen sich zwei Magnete. Sagt der eine: Was soll ich heute bloß anziehen?'],
    ['joke_21', 'Was ist ein Cowboy ohne Pferd? Ein Sattelschlepper.'],
    ['joke_22', 'Wohin geht ein Fisch, wenn er Hunger hat? Zum Hai-Mbiss.'],
    ['joke_23', 'Warum ist das Meer salzig? Weil die Fische nicht schwitzen wollen. [whispers] Stimmt nicht.'],
    ['joke_24', 'Was ist rot und schlecht für die Zähne? Ein Ziegelstein.'],
    ['joke_25', 'Was trinkt die Kuh zum Frühstück? Kuhkao. [laughs] Ja, ich schäme mich.'],
  ],

  // --- Lästern (Quatschkopf) --------------------------------------------------------------
  mockBad: [
    ['mbad_5', '[laughs] Okay, das war so schlecht, das ist schon wieder Kunst.'],
    ['mbad_6', 'Ich hätte ja Mitleid … [chuckles] aber dafür werde ich nicht bezahlt.'],
    ['mbad_7', 'Herzlichen Glückwunsch zum schlechtesten Zug des Abends! Bisher.'],
    ['mbad_8', '[sarcastic] Applaus für die Schwerkraft. Sie gewinnt einfach immer.'],
    ['mbad_9', 'Wenn Pech eine Sportart wäre, hättet ihr gerade Gold geholt.'],
    ['mbad_10', '[laughs] Ich hab das aufgenommen. Das läuft nachher in Dauerschleife.'],
    ['mbad_11', 'Selbst der Vulkan schüttelt gerade den Kopf. Und der hat keinen.'],
    ['mbad_12', 'Das war kein Fehler. Das war eine Lebenseinstellung.'],
    ['mbad_13', '[whispers] Ich sag’s keinem. [shouting] Habt ihr DAS gesehen?!'],
    ['mbad_14', 'Mutig! Dumm, aber mutig.'],
    ['mbad_15', '[sighs] Ich würde euch ja trösten, aber ich lache noch.'],
    ['mbad_16', 'Plan B war wohl auch schon ausverkauft.'],
  ],
  mockGood: [
    ['mgood_4', 'Glück gehabt. Wie immer. Sehr verdächtig.'],
    ['mgood_5', '[sarcastic] Oh wow, ein guter Zug. Soll ich jetzt klatschen?'],
    ['mgood_6', 'Auch ein blindes Huhn findet mal ein Korn. Oder eine Sechs.'],
    ['mgood_7', 'Gönn ich euch. [chuckles] Nein, eigentlich nicht.'],
    ['mgood_8', 'Das schreib ich mir auf. Unter „Zufälle“.'],
    ['mgood_9', 'Nicht so laut jubeln! Das Glück ist schreckhaft.'],
  ],
  leader: [
    ['lead_5', 'Ganz vorne ist die Luft dünn. Und das UFO hat Hunger.'],
    ['lead_6', 'Ihr führt? Ach, deswegen grinst ihr so komisch.'],
    ['lead_7', 'Die Führenden sehen aus, als hätten sie den Würfel bestochen.'],
    ['lead_8', '[mischievously] Wer oben steht, kann tief fallen. Ich sag nur: Vulkan.'],
  ],
  last: [
    ['last_5', 'Hinten ist es auch schön. Weniger Gedränge.'],
    ['last_6', '[laughs] Ihr spielt quasi auf leicht. Sehr leicht. Ganz, ganz leicht.'],
    ['last_7', 'Letzter Platz! Aber hey – ihr habt die beste Aussicht auf alle anderen.'],
    ['last_8', 'Ihr seid nicht hinten. Ihr seid nur schon mal fürs nächste Spiel aufgestellt.'],
  ],
  dumb: [
    ['dumb_11', 'Ich wollte mal Leuchtturmwärter werden. Aber der Job war mir zu … hell.'],
    ['dumb_12', 'Ich zähl die Augen auf dem Würfel jedes Mal nach. Sind immer noch sechs Seiten. Puh.'],
    ['dumb_13', 'Meine Theorie: Der Vulkan ist eigentlich nur ein Berg mit Sodbrennen.'],
    ['dumb_14', 'Wenn ich groß bin, werde ich ein Würfel. Dann hab ich endlich gute Augen.'],
    ['dumb_15', '[curious] Wenn eine Kokosnuss auf eine Insel fällt und keiner sieht’s … ist sie dann trotzdem lecker?'],
    ['dumb_16', 'Ich hab heute schon drei Mal geblinzelt. Rekord!'],
  ],

  // --- Geplauder & Warten -----------------------------------------------------------------
  chat: [
    ['chat_9', 'Ich überlege, Vulkanforscher zu werden. Da gibt’s wenigstens immer heißen Kaffee.'],
    ['chat_10', 'Kurze Durchsage: Bitte die Kokosnüsse nicht füttern.'],
    ['chat_11', 'Mir ist aufgefallen: Hier läuft keiner. Alle hüpfen. Komische Insel.'],
    ['chat_12', 'Wetterbericht für die Insel: sonnig, mit Aussicht auf Lava.'],
    ['chat_13', 'Ich kommentier das hier schon seit Stunden. Gefühlt. Eigentlich seit zehn Minuten.'],
    ['chat_14', 'Ich liebe dieses Spiel. Und das sag ich nicht nur, weil ich hier festsitze.'],
  ],
  waiting: [
    ['wait_5', '[sighs] In der Zeit hätte ich einen eigenen Vulkan bauen können.'],
    ['wait_6', 'Der Würfel ist nicht heiß. Man darf ihn anfassen!'],
    ['wait_7', 'Würfeln, nicht meditieren!'],
    ['wait_8', 'Mir wächst schon ein Bart. Und ich hab gar kein Gesicht.'],
    ['wait_9', 'Hallo? Ist das Handy eingeschlafen? Oder ihr?'],
  ],
  thinking: [
    ['think_4', 'Ich höre Gehirnzellen knistern. Oder ist das der Vulkan?'],
    ['think_5', 'Kleiner Tipp: Die richtige Antwort ist eine der Antworten.'],
    ['think_6', 'Ratet einfach! Hat bei mir in der Schule auch … nie geklappt.'],
  ],

  // --- mehr Abwechslung bei Ereignissen ---------------------------------------------------
  turn: [
    ['turn_7', 'Ihr seid dran! Und ja, alle schauen zu. Kein Druck.'],
    ['turn_8', 'Bühne frei für das nächste Team!'],
    ['turn_9', '[whispers] Jetzt bloß nicht vermasseln …'],
    ['turn_10', 'Ab zum Würfel! Er hat schon Sehnsucht nach euch.'],
  ],
  six: [
    ['six_4', 'Sechs! Der Würfel mag euch. Warum auch immer.'],
    ['six_5', '[shouting] Sechs! Wer hat da gezaubert?'],
  ],
  one: [
    ['one_4', '[laughs] Eine Eins! Die Schnecke am Strand ist schneller.'],
    ['one_5', 'Eins. Immerhin habt ihr nicht rückwärts gewürfelt.'],
  ],
  right: [
    ['right_3', 'Richtig! Da staunt sogar der Vulkan.'],
    ['right_4', '[excited] Treffer! Klug seid ihr also auch noch.'],
  ],
  wrong: [
    ['wrong_3', 'Falsch! Aber mit sehr viel Selbstbewusstsein.'],
    ['wrong_4', '[laughs] Knapp daneben ist auch vorbei.'],
    ['wrong_5', 'Nee. Netter Versuch, aber nee.'],
  ],
  riverFall: [
    ['rfall_6', '[laughs] Platsch! Badezeit!'],
    ['rfall_7', 'Kostenlose Dusche inklusive. Gern geschehen!'],
  ],
  plane: [['plane_4', 'Das Flugzeug hat leider nur Rückflüge im Angebot.']],
  ufo: [['ufo_4', '[mischievously] Die Aliens wollten nur mal umdekorieren.']],
  spring: [['spring_4', 'Abflug! Bitte Arme und Beine im Fahrzeug lassen!']],
  cage: [['cage_3', 'Ab ins Kittchen! [laughs] Da hilft nur noch Würfelglück.']],
  skull: [['skull_3', '[dramatically] Ein Totenkopf! Das sieht gar nicht gut aus für euch.']],
  cave: [['cave_5', 'Ab ins Loch! Bitte Kopf einziehen!']],
  eruption: [['erupt_3', '[shouting] Achtung, heiß und fettig! Alle in Deckung!']],
  timeUp: [['time_3', 'Zeit ist um! Stifte weg. Also … Handys weg. Ihr wisst schon.']],
  results: [['res_3', 'Die Ergebnisse sind da! Bitte nicht weinen. Oder doch, das ist lustig.']],
  roundEnd: [['rend_3', 'Runde vorbei! Kurz durchatmen, gleich geht’s weiter.']],
  drawn: [['drawn_3', 'Die Glücksfee hat entschieden! Na ja, eher die Pechfee.']],
  super: [['super_4', '[shouting] Was für ein Zug! Ich hab Gänsehaut. Glaub ich.']],
  sad: [['sad_4', '[sighs] Oh nein. Wer braucht ein Taschentuch?']],
  angry: [['angry_3', 'Uiuiui, da kocht aber jemand. Fast wie der Vulkan.']],
};
