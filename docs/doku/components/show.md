---
name: Beamer-Show (Einstellungen, Musik, Wetter)
type: lib
layer: logik
path:
  - packages/shared/src/show.ts
  - packages/shared/src/show.test.ts
  - packages/shared/src/atmosphere.test.ts
tech: [typescript, zod]
provides:
  - call Show-Einstellungen mit Standardwerten und Prüfung (Grafik, Auflösung, Lautstärken, Musik, Kommentator, Kamera, Anzeigen, Wetter)
  - call Show-Befehle der Regie (setzen, zurücksetzen, Erklärung, Testton, neu laden, vorlesen, Kamera)
  - call Musikliste je Stimmung und Welt
  - call Wetter-Automatik, Jahreszeit und Festzeit nach Datum
  - call Rückmeldung der Beamer (Bildrate, Grafikstufe, Ton frei, Vollbild …)
uses:
  - spielmodell: call "Welten"
files:
  - show.ts: Alles rund um die Beamer-Show – Grafikstufen (Automatisch, Ultra, Schön, Ausgewogen, Sparsam), Auflösungen, Lautstärken für Musik, Effekte, Sprache und Umgebung, Kommentator-Stufen (nie, ab und zu, viel, Quatschkopf) mit „Sprüche pro Minute“, Kamera-Stil, Musikstücke je Stimmung und Welt, Wetter/Jahreszeit/Festzeit samt Automatik, die Befehle der Regie an die Beamer und das Format der Beamer-Rückmeldungen. Liest gespeicherte (auch alte oder kaputte) Einstellungen sicher ein.
  - show.test.ts: Tests für Kommentator-Stufen, Musikliste je Welt und das Einlesen gespeicherter Einstellungen.
  - atmosphere.test.ts: Tests für Jahreszeit und Festzeit nach Datum und die Wetter-Automatik (gleich auf allen Beamern, passend zum Spielverlauf).
exposure: none
security:
  - input: Show-Befehle und Teil-Einstellungen werden streng geprüft (nur bekannte Felder, feste Auswahllisten, Lautstärken 0–1, Kamera-Werte begrenzt)
  - other: Gespeicherte Einstellungen werden Feld für Feld eingelesen; Ungültiges fällt auf den Standardwert zurück
---
Gemeinsame Beschreibung der **Beamer-Show**: aller Einstellungen, die die Regie live für die Beamer setzt, und der Befehle, mit denen sie das tut. Die Einstellungen gehören zum **Konto** der Spielleitung und gelten für alle seine Beamer – auch in anderen Spielen. Gesendet werden sie von der [[regie]] (und dem [[moderator]]) über [[echtzeit]], umgesetzt vom [[beamer]].

**Musik:** Fünf Stimmungen – Lobby & Pausen, Würfeln, Fragen & Minispiele, Vulkan-Inneres, Siegerehrung. Für jede Welt gibt es eigene Stücke (Insel 13, Blockwelt 7, Weltall 8); fehlt einer Welt eine Stimmung, spielt die Automatik das Stück der Insel. Die Regie kann auch ein festes Stück wählen und das Abwechseln ein- oder ausschalten.

**Wetter, Jahreszeit, Festzeit:** Jeweils „Automatisch“ oder fest. Jahreszeit und Festzeit richten sich nach dem Datum (Halloween 17.10.–2.11., Weihnachten 1.–26.12.). Das automatische Wetter wird aus Spiel-Kennung und Rundenblock berechnet – dadurch zeigen alle Beamer dasselbe, und es wechselt etwa alle drei Runden. Hoher Vulkandruck bringt dunkle Wolken, das Finale Gewitter bzw. Schneetreiben, der Sieg klaren Himmel.

**Kommentator:** „nie“, „ab und zu“, „viel“ oder „Quatschkopf“. Nur beim Quatschkopf gilt der Regler „Zwischendurch plaudern“ (0 bis 4 Sprüche pro Minute, Start bei 1).
