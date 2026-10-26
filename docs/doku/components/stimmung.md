---
name: Stimmung – Wetter, Feste, Ton und Kommentator
type: module
layer: grafik
path: [packages/web/src/board/atmosphere.ts, packages/web/src/board/festive.ts, packages/web/src/board/audio.ts, packages/web/src/board/commentator.ts, packages/web/src/board/voice-lines.ts, packages/web/src/board/voice-lines-new.ts, packages/web/src/board/commentator.test.ts, packages/web/src/board/voice-lines.test.ts]
tech: [three.js, glsl, web-audio]
zone: client
provides:
  - call AtmosphereFx – Wetter und Jahreszeit (Himmel, Nebel, Licht, Regen, Schnee, Blitze, Herbstlaub) für alle Welten
  - call buildFestive – Deko für Halloween und Weihnachten
  - call BoardAudio – Effekte, Musik, Sprache und Umgebung mit eigenen Lautstärken
  - call Commentator – passende Sprüche zu Ereignissen und Plaudern zwischendurch
  - call VOICE_LINES, EXPLAINER_LINES – Texte des Kommentators und der Spielerklärung je Welt
uses:
  - show: call "Wetter, Jahreszeit und Fest (Automatik), Musikstücke und Stimmungen, Lautstärken, Kommentator-Stufe"
  - medien: http "GET /assets/audio, /assets/voice (Geräusche, Musik, Umgebungsschleifen, Sprachdateien)" [auth=none, tls, tunnel, im WLAN-Betrieb http]
  - tiere: call "Welche Tierart ist gerade im Bild?"
  - insel: call "Inselplan und Bodenhöhe für die Fest-Deko"
  - blockwelt: call "Pixel-Kacheln für die Fest-Deko der Blockwelt"
  - weltall: call "Fest-Deko des Weltalls"
  - spielmodell: call "Welt des Spiels, Stimmungen"
files:
  - atmosphere.ts: Wetter, Jahreszeit und Festzeit auf dem Beamer – Himmelstönung, Nebel, Licht, Regen und Schnee (auf der Grafikkarte animiert, folgen der Kamera), Blitze mit Donner, wachsende Schneedecke, Herbstlaub; im Weltall Sporenregen, Kristallstaub und Ionensturm. Übergänge laufen weich.
  - festive.ts: Halloween (Kürbislaternen, Grabsteine, Gespenster, Fledermäuse, Mond) und Weihnachten (geschmückte Tannen, Lichterkette am Weg, Geschenke, Schneemann) – rund auf der Insel, aus Blöcken in der Blockwelt; das Weltall hat eigene Deko.
  - audio.ts: Ton des Beamers mit vier Spuren und eigener Lautstärke – Effekte (lautheitsangeglichen), Musik (gestreamt, weiche Überblendung, auf Wunsch rotierend), Sprache (Musik wird dabei leiser), Umgebungsgeräusche (Strand und Dschungel bzw. Höhle; Ersatz per Klangsynthese).
  - commentator.ts: Kommentator – wählt zu einem Ereignis einen Spruch ohne kurze Wiederholung, spricht ihn so oft, wie die Regie es einstellt, plaudert in ruhigen Momenten und lästert als „Quatschkopf“; lässt Sprüche weg, die nicht zur Welt passen.
  - voice-lines.ts: Alle Texte des Kommentators und der Spielerklärung (Insel, Blockwelt, Weltall) mit der ID ihrer Sprachdatei; Regieanweisungen in eckigen Klammern werden in Untertiteln ausgeblendet.
  - voice-lines-new.ts: Sammelstelle für neue Sprüche, für die es noch keine Sprachdatei gibt (zurzeit leer).
  - commentator.test.ts: Test, dass der Kommentator in ruhigen Phasen im Mittel so oft plaudert, wie die Regie es einstellt.
  - voice-lines.test.ts: Test, dass es zu jedem Spruch und jedem Satz der Spielerklärung eine Sprachdatei gibt.
---
Alles, was die Spielwelt lebendig klingen und aussehen lässt, ohne die Regeln zu berühren: Wetter, Jahreszeit, Feste, Musik, Geräusche und der Kommentator.

**Wetter, Jahreszeit, Feste.** Die Regie wählt Wetter (klar, bewölkt, Regen, Gewitter, Schnee, Nebel), Jahreszeit und Festzeit – oder lässt die Automatik entscheiden: Jahreszeit und Fest folgen dem Datum (Halloween Mitte Oktober bis Anfang November, Weihnachten im Dezember), das Wetter wechselt alle paar Runden nach festen Regeln aus der Spiel-ID, sodass alle Beamer eines Spiels dasselbe zeigen. Die Regeln dafür stehen in [[show]]. Hier wird es sichtbar: Himmel und Licht färben sich, Regen und Schnee fallen um die Kamera herum, Blitze zucken, auf allen nach oben zeigenden Flächen wächst eine Schneedecke, im Herbst färbt sich das Laub. Halloween und Weihnachten bringen eigene Deko am Weg – auf der Insel rund, in der [[blockwelt]] aus Blöcken, im [[weltall]] als Alien-Variante.

**Ton.** Vier Spuren mit eigener Lautstärke, live aus der Regie: Effekte, Musik, Sprache und Umgebung. Musikstücke werden gestreamt und weich überblendet; welche Stücke zu welcher Stimmung (Lobby, Spielbrett, Spannung, Vulkan-Inneres, Siegerehrung) und Welt gehören, steht in [[show]]. Spricht der Kommentator, wird die Musik leiser. Alle Dateien kommen aus [[medien]]; das Spiel ruft zur Laufzeit keinen fremden Dienst auf. Browser erlauben Ton erst nach einer Bedienung – der Beamer zeigt deshalb den Hinweis, einmal zu klicken.

**Kommentator.** Die Stimme („DiMario – Moderator“) kommentiert Würfe, Sonderfelder, Mutproben, Fragen, Reaktionen und den Sieg. Die Regie stellt ein, wie oft: nie, ab und zu, viel oder „Quatschkopf“; bei *viel* und *Quatschkopf* plaudert er auch zwischendurch je nach Lage (Team trödelt, Frage läuft, Pause), so oft wie der Regler „Sprüche pro Minute“ es vorgibt. Tier-Sprüche kommen nur, wenn das Tier gerade im Bild ist ([[tiere]]). Jede Welt hat eigene Sprüche und eine eigene Spielerklärung; Sprüche mit Inselbegriffen fallen in den anderen Welten weg. Alle Sätze sind fest vorgegebene Texte mit fertigen Sprachdateien – siehe [[0006-sprache-und-musik-als-dateien-im-projekt]].
