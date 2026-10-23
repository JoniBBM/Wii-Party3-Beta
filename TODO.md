# ToDo

## Erledigt (2026-10-22)

- [x] **Kommentator-Regler „Sprüche pro Minute“**
  - Regler in der Regie (unter *Beamer*), mit dem sich genau einstellen lässt, wie viel der Kommentator quatscht.
  - Gilt nur für die Sprüche zwischendurch (Geplauder, Lästern, Witze), nicht für die Ansagen zum Spielablauf.
  - Wert als „Sprüche pro Minute“ anzeigen (z. B. 0 = aus … 4/min), live auf dem Beamer wirksam.

- [x] **Regie (Admin-Oberfläche) fürs Smartphone anpassen**
  - In Safari auf dem iPhone passt die Darstellung nicht: Man muss nach links und rechts scrollen, Zoom/Größen stimmen nicht.
  - Ziel: keine waagerechte Scrollleiste, Inhalte in Handybreite, kein ungewolltes Hineinzoomen (z. B. bei Eingabefeldern unter 16 px Schrift).
  - Alle Regie-Seiten durchgehen (Spiel, Teams, Bibliothek, Beamer, Einstellungen) und bei 375 px Breite prüfen.

## Erledigt (2026-10-23)

- [x] **Spiel-Tempo**: Spieldauer vorab einstellen, Moderator/Regie „Spiel verlangsamen“ / „Spiel beschleunigen“ – fair für alle Teams, für Teams unbemerkt.
- [x] **Spieleinrichtung als geführter Ablauf**: Folien statt versteckter Menüs – Anzahl Felder, Sonderfelder an/aus mit Häufigkeit, welche Fragen- und Spielarten drankommen, Sammlungen, Handys & Sieg, Übersicht.
  - Einstieg mit grober Spieldauer: schlägt Felderzahl und Sonderfelder vor (anpassbar).
  - Oder „Manuell“: ohne spielbeeinflussende Algorithmen (kein Tempo, reine Zufallswürfe, keine Tempo-Knöpfe).

- [x] **Zweite Welt „Blockwelt“** (Minecraft-Stil, pro Spiel wählbar): Block-Insel, Block-Figuren, Tiere und Mobs, Sonderfelder als Mobs, Nether im Vulkan, Pixel-Oberfläche auf Handys/Beamer.

- [x] **Wetter, Jahreszeiten, Halloween und Weihnachten** für beide Welten (Beamer → Wetter & Stimmung, jeweils mit Automatik).

- [x] **Blockwelt vertont**: 28 Kommentator-Sprüche und 12 eigene Sätze der Spielerklärung, dazu die verbesserte Vulkan-Erklärung der Insel (zusammen 3.328 Credits).
- [x] **Blockwelt-Musik**: 7 freie Stücke (CC0) für Lobby, Oberwelt, Fragen und Nether.
- [x] **Spielerklärung**: Vulkanfelder mit Druckbalken erklärt, Ausbruch mit zurückfliegender Figur, Blockwelt-Fassung.
- [x] **Liane**: Bach in beiden Welten deutlich breiter (~2,9 m), Kamera bei Liane und Fluss ohne Bäume davor.
- [x] **Vulkan-Knopf**: Regie → Beamer → Kamera „In den Vulkan/Nether“ und zurück, wenn gerade nichts passiert.
- [x] **Einstellungsmenü neu**: „Spiel einrichten → Alle Einstellungen“ in Bereiche gegliedert (Welt & Stimmung eigener Bereich mit Wetter), Speichern-Leiste, Namen je Welt; Beamer- und Einstellungsseite aufgeräumt.
- [x] **Suche über alle Einstellungen** (Kopfzeile, Strg/⌘+K) mit Sprung und Hervorhebung.
- [x] **Neues Spiel = ein Knopf**, danach direkt der Assistent.
- [x] **Vulkan-Besuch**: Kamerafahrt in den Krater und zurück, im Inneren kreist die Kamera; Blockwelt-Krater mit Lavasee.
- [x] **Rundenende**: Kamera zieht sich sanft zurück statt wild zu schwenken.
- [x] **Fragen in der Blockwelt lesbar** (Chakra Petch für Fragen/Antworten/Zahlen, Pixelschrift nur für Überschriften).
- [x] **Tiere**: kein Auftauchen/Verschwinden/Springen im Bild; Schleime und alle anderen Tiere laufen bzw. hüpfen sauber (beide Welten).

## Offen


- [ ] Auf einem echten iPhone (Safari) gegenprüfen – getestet wurde in der Browser-Emulation bei 375 und 390 px.
- [ ] **SSH-Zugang für Claude auf den VPS einrichten** (Schlüssel auf dem Mac, Adresse + Benutzer nennen) – dann kann Claude den Container selbst aktualisieren und prüfen. Bis dahin gibt Claude nach jedem Update die fertigen Befehle für den VPS aus.
