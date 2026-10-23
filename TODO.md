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

## Offen

- [ ] **Blockwelt-Kommentator vertonen** (Nutzer will später daran erinnert werden): Entwurf mit 28 Sprüchen in `voice-lines-new.ts` (≈ 1.700–1.800 Credits), Blockwelt-Spielerklärung ≈ 2.800 Credits – Kosten vorher nennen, OK abwarten.

- [ ] Auf einem echten iPhone (Safari) gegenprüfen – getestet wurde in der Browser-Emulation bei 375 und 390 px.
- [ ] **SSH-Zugang für Claude auf den VPS einrichten** (Schlüssel auf dem Mac, Adresse + Benutzer nennen) – dann kann Claude den Container selbst aktualisieren und prüfen. Bis dahin gibt Claude nach jedem Update die fertigen Befehle für den VPS aus.
