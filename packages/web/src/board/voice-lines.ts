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
    ['turn_7', 'Ihr seid dran! Und ja, alle schauen zu. Kein Druck.'],
    ['turn_8', 'Bühne frei für das nächste Team!'],
    ['turn_9', '[whispers] Jetzt bloß nicht vermasseln …'],
    ['turn_10', 'Ab zum Würfel! Er hat schon Sehnsucht nach euch.'],
  ],
  six: [
    ['six_1', '[excited] Eine Sechs! Ab die Post!'],
    ['six_2', 'Sechs Augen! [laughs] Da hat wohl jemand heimlich geübt.'],
    ['six_3', 'Volltreffer, die Sechs!'],
    ['six_4', 'Sechs! Der Würfel mag euch. Warum auch immer.'],
    ['six_5', '[shouting] Sechs! Wer hat da gezaubert?'],
  ],
  one: [
    ['one_1', '[sighs] Eine Eins. Naja … Schritt für Schritt.'],
    ['one_2', '[slowly] Eins! Gemütlich, gemütlich.'],
    ['one_3', 'Ein Feld. Immerhin, es geht voran!'],
    ['one_4', '[laughs] Eine Eins! Die Schnecke am Strand ist schneller.'],
    ['one_5', 'Eins. Immerhin habt ihr nicht rückwärts gewürfelt.'],
  ],
  spring: [
    ['spring_1', '[excited] Boing! Und ab geht die Luzie!'],
    ['spring_2', 'Sprungfeder! Bitte anschnallen!'],
    ['spring_3', '[laughs] Hui! Das nenn ich mal eine Abkürzung!'],
    ['spring_4', 'Abflug! Bitte Arme und Beine im Fahrzeug lassen!'],
  ],
  plane: [
    ['plane_1', '[sarcastic] Oh oh, das Flugzeug! Einmal Rundflug zurück, bitte.'],
    ['plane_2', 'Bitte einsteigen – der Flug geht leider rückwärts!'],
    ['plane_3', '[chuckles] Fallschirm auf! Das war ein Umweg.'],
    ['plane_4', 'Das Flugzeug hat leider nur Rückflüge im Angebot.'],
  ],
  ufo: [
    ['ufo_1', '[mischievously] Die Aliens haben mal wieder umgeräumt!'],
    ['ufo_2', '[dramatically] Beam me up! Platztausch!'],
    ['ufo_3', 'UFO-Alarm! Und zack, die Plätze getauscht.'],
    ['ufo_4', '[mischievously] Die Aliens wollten nur mal umdekorieren.'],
  ],
  cage: [
    ['cage_1', 'Zack, eingesperrt! Jetzt hilft nur noch die richtige Zahl.'],
    ['cage_2', 'Käfig zu! [chuckles] Da hat wohl jemand den Schlüssel verloren.'],
    ['cage_3', 'Ab ins Kittchen! [laughs] Da hilft nur noch Würfelglück.'],
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
    ['erupt_3', '[shouting] Achtung, heiß und fettig! Alle in Deckung!'],
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
    ['rfall_6', '[laughs] Platsch! Badezeit!'],
    ['rfall_7', 'Kostenlose Dusche inklusive. Gern geschehen!'],
  ],
  cave: [
    ['cave_1', 'Huch, die Lavahöhle! Einmal Rutschbahn abwärts!'],
    ['cave_2', 'Ab in den Berg! [chuckles] Das war wohl die falsche Tür.'],
    ['cave_3', '[laughs] Zu klein gewürfelt! Einmal Vulkan von innen, bitte!'],
    ['cave_5', 'Ab ins Loch! Bitte Kopf einziehen!'],
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
    ['skull_3', '[dramatically] Ein Totenkopf! Das sieht gar nicht gut aus für euch.'],
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
    ['super_4', '[shouting] Was für ein Zug! Ich hab Gänsehaut. Glaub ich.'],
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
    ['sad_4', '[sighs] Oh nein. Wer braucht ein Taschentuch?'],
  ],
  angry: [
    ['angry_1', '[laughs] Da ist aber jemand sauer!'],
    ['angry_2', '[angry] Grrr! Das ist doch nicht fair!'],
    ['angry_3', 'Uiuiui, da kocht aber jemand. Fast wie der Vulkan.'],
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
    ['drawn_3', 'Die Glücksfee hat entschieden! Na ja, eher die Pechfee.'],
  ],
  timeUp: [
    ['time_1', 'Die Zeit ist um! Finger weg vom Handy!'],
    ['time_2', '[laughs] Ding! Schluss, aus, vorbei!'],
    ['time_3', 'Zeit ist um! Stifte weg. Also … Handys weg. Ihr wisst schon.'],
  ],
  results: [
    ['res_1', 'Und das sind die Ergebnisse!'],
    ['res_2', '[curious] Mal sehen, wer am besten war …'],
    ['res_3', 'Die Ergebnisse sind da! Bitte nicht weinen. Oder doch, das ist lustig.'],
  ],
  roundEnd: [
    ['round_1', 'Runde vorbei! Kurz durchschnaufen.'],
    ['round_2', 'Das war’s für diese Runde. Mal schauen, wie es steht!'],
    ['rend_3', 'Runde vorbei! Kurz durchatmen, gleich geht’s weiter.'],
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
    ['right_3', 'Richtig! Da staunt sogar der Vulkan.'],
    ['right_4', '[excited] Treffer! Klug seid ihr also auch noch.'],
  ],
  wrong: [
    ['wrong_1', 'Leider falsch!'],
    ['wrong_2', '[sarcastic] Nö, das war nix.'],
    ['wrong_3', 'Falsch! Aber mit sehr viel Selbstbewusstsein.'],
    ['wrong_4', '[laughs] Knapp daneben ist auch vorbei.'],
    ['wrong_5', 'Nee. Netter Versuch, aber nee.'],
  ],
  // ab hier: nur „viel“ und „Quatschkopf“ – Geplauder zwischendurch
  chat: [
    ['chat_1', 'Ich sag’s euch, so ein Inselleben ist schon was Feines. Außer der Vulkan. Der ist schlecht gelaunt.'],
    ['chat_2', '[curious] Wer liegt eigentlich vorne? [chuckles] Ach ja, ich seh’s ja.'],
    ['chat_3', 'Ich mach hier übrigens alles ehrenamtlich. Für Kokosnüsse.'],
    ['chat_5', 'Wisst ihr, was das Beste an dieser Insel ist? Kein WLAN-Passwort. Ach nee, Moment …'],
    ['chat_6', 'Bleibt dran, Leute. Hier passiert gleich wieder was. Wahrscheinlich.'],
    ['chat_7', '[sighs] Ein Kommentator hat’s schon schwer. Immer reden, nie würfeln.'],
    ['chat_8', 'Die Stimmung ist großartig! Also, bei mir jedenfalls.'],
    ['chat_9', 'Ich überlege, Vulkanforscher zu werden. Da gibt’s wenigstens immer heißen Kaffee.'],
    ['chat_10', 'Kurze Durchsage: Bitte die Kokosnüsse nicht füttern.'],
    ['chat_11', 'Mir ist aufgefallen: Hier läuft keiner. Alle hüpfen. Komische Insel.'],
    ['chat_12', 'Wetterbericht für die Insel: sonnig, mit Aussicht auf Lava.'],
    ['chat_13', 'Ich kommentier das hier schon seit Stunden. Gefühlt. Eigentlich seit zehn Minuten.'],
    ['chat_14', 'Ich liebe dieses Spiel. Und das sag ich nicht nur, weil ich hier festsitze.'],
  ],
  waiting: [
    ['wait_1', 'Hallo? Würfeln, bitte! Der Würfel beißt nicht.'],
    ['wait_2', '[sighs] Ich werd hier noch braun vor lauter Warten.'],
    ['wait_3', '[mischievously] Tick, tack … der Vulkan wartet auch nicht ewig!'],
    ['wait_4', 'Ist da jemand eingeschlafen? Tippen, Leute, tippen!'],
    ['wait_5', '[sighs] In der Zeit hätte ich einen eigenen Vulkan bauen können.'],
    ['wait_6', 'Der Würfel ist nicht heiß. Man darf ihn anfassen!'],
    ['wait_7', 'Würfeln, nicht meditieren!'],
    ['wait_8', 'Mir wächst schon ein Bart. Und ich hab gar kein Gesicht.'],
    ['wait_9', 'Hallo? Ist das Handy eingeschlafen? Oder ihr?'],
  ],
  thinking: [
    ['think_1', 'Denkt nach! Ich höre hier förmlich die Köpfe rauchen.'],
    ['think_2', '[whispers] Ich weiß die Antwort. Aber ich sag nix.'],
    ['think_3', 'Nicht beim Nachbarn abschreiben! [chuckles] Okay, ein bisschen vielleicht.'],
    ['think_4', 'Ich höre Gehirnzellen knistern. Oder ist das der Vulkan?'],
    ['think_5', 'Kleiner Tipp: Die richtige Antwort ist eine der Antworten.'],
    ['think_6', 'Ratet einfach! Hat bei mir in der Schule auch … nie geklappt.'],
  ],
  // Tiere: nur, wenn sie gerade wirklich im Bild sind (siehe Commentator.sight)
  seeMonkey: [
    ['chat_4', '[whispers] Psst. Ich glaube, der Affe da hinten schummelt.'],
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
  seeFrog: [
    ['see_frog_1', 'Ein Frosch! Der springt sogar ohne Sprungfeder weiter als manche hier.'],
  ],
  // bodenlose Witze (ab „viel“, beim Quatschkopf öfter)
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
  // nur „Quatschkopf“: Lästern und dumme Sprüche
  leader: [
    ['lead_1', '[mischievously] Na, da vorne? Hochmut kommt vor dem Fall. Oder vor dem Vulkan.'],
    ['lead_2', 'Die Führenden tun so cool. Dabei zittern denen schon die Knie.'],
    ['lead_3', '[laughs] Genießt es, solange es dauert! Das UFO hat eure Adresse.'],
    ['lead_4', 'Führung ist wie Eis am Strand. Schmilzt schneller, als man denkt.'],
    ['lead_5', 'Ganz vorne ist die Luft dünn. Und das UFO hat Hunger.'],
    ['lead_6', 'Ihr führt? Ach, deswegen grinst ihr so komisch.'],
    ['lead_7', 'Die Führenden sehen aus, als hätten sie den Würfel bestochen.'],
    ['lead_8', '[mischievously] Wer oben steht, kann tief fallen. Ich sag nur: Vulkan.'],
  ],
  last: [
    ['last_1', '[laughs] Und das Schlusslicht? Irgendwer muss ja das Licht ausmachen.'],
    ['last_2', 'Ganz hinten ist auch eine Position. Eine sehr entspannte sogar.'],
    ['last_3', '[sarcastic] Ihr seid nicht Letzte. Ihr seid nur … sehr weit von den Ersten entfernt.'],
    ['last_4', 'Keine Sorge, ihr seid nicht langsam. Die anderen sind nur schneller.'],
    ['last_5', 'Hinten ist es auch schön. Weniger Gedränge.'],
    ['last_6', '[laughs] Ihr spielt quasi auf leicht. Sehr leicht. Ganz, ganz leicht.'],
    ['last_7', 'Letzter Platz! Aber hey – ihr habt die beste Aussicht auf alle anderen.'],
    ['last_8', 'Ihr seid nicht hinten. Ihr seid nur schon mal fürs nächste Spiel aufgestellt.'],
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
    ['dumb_11', 'Ich wollte mal Leuchtturmwärter werden. Aber der Job war mir zu … hell.'],
    ['dumb_12', 'Ich zähl die Augen auf dem Würfel jedes Mal nach. Sind immer noch sechs Seiten. Puh.'],
    ['dumb_13', 'Meine Theorie: Der Vulkan ist eigentlich nur ein Berg mit Sodbrennen.'],
    ['dumb_14', 'Wenn ich groß bin, werde ich ein Würfel. Dann hab ich endlich gute Augen.'],
    ['dumb_15', '[curious] Wenn eine Kokosnuss auf eine Insel fällt und keiner sieht’s … ist sie dann trotzdem lecker?'],
    ['dumb_16', 'Ich hab heute schon drei Mal geblinzelt. Rekord!'],
  ],
  mockBad: [
    ['mbad_1', '[laughs] Hahaha! Entschuldigung. [laughs] Nein, eigentlich nicht.'],
    ['mbad_2', 'Autsch! Das zeigen wir gleich nochmal in Zeitlupe. [chuckles] Spaß.'],
    ['mbad_3', '[sarcastic] Super Strategie! Wirklich. Ganz toll.'],
    ['mbad_4', 'Ich hätte das genauso gemacht. [laughs] Nee, hätte ich nicht.'],
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
    ['mgood_1', '[sarcastic] Pures Glück. Können ist was anderes.'],
    ['mgood_2', 'Okay, okay, nicht schlecht. Aber bildet euch bloß nix drauf ein!'],
    ['mgood_3', '[mischievously] Schöner Zug! Bestimmt geschummelt.'],
    ['mgood_4', 'Glück gehabt. Wie immer. Sehr verdächtig.'],
    ['mgood_5', '[sarcastic] Oh wow, ein guter Zug. Soll ich jetzt klatschen?'],
    ['mgood_6', 'Auch ein blindes Huhn findet mal ein Korn. Oder eine Sechs.'],
    ['mgood_7', 'Gönn ich euch. [chuckles] Nein, eigentlich nicht.'],
    ['mgood_8', 'Das schreib ich mir auf. Unter „Zufälle“.'],
    ['mgood_9', 'Nicht so laut jubeln! Das Glück ist schreckhaft.'],
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
