# 🏝️ Insel der Abenteuer

Ein Partyspiel für Gruppen im Stil von **Wii Party**: Die Teams wandern auf einer 3D-Insel vom Hafen bis zum Vulkangipfel. Wer welche Strecke würfeln darf, entscheiden Minispiele und Quizfragen, die live vor Ort gespielt werden. Gedacht für Jugendgruppen, Freizeiten, Klassenfahrten und Familienfeste mit **2–10 Teams**.

![Beamer: 3D-Insel in der Würfelrunde](docs/bilder/beamer-wuerfelrunde.webp)

## Die vier Bildschirme

| Wer | Was | Adresse |
|---|---|---|
| **Beamer** | 3D-Insel mit Figuren, Fragen, Ergebnissen, Würfeln und Effekten | `/beamer` |
| **Regie** (Technik) | Steuert den Abend: Inhalte wählen, Antworten sehen, Platzierung eintragen, würfeln, Rückgängig | `/regie` |
| **Moderator** (Vorleser) | Große Vorleseansicht mit Lösungen – kann alles mitsteuern | `/moderator` |
| **Handys / Tablets** | Teams treten per QR-Code bei, antworten, buzzern, würfeln, gestalten ihre Figur | `/` → „Mitspielen“ |

Alle Geräte sind live verbunden – jede Aktion erscheint sofort überall.

| Beamer | Regie | Handy |
|---|---|---|
| ![Frage auf dem Beamer](docs/bilder/beamer-frage.webp) | ![Regie während einer Frage](docs/bilder/regie-frage-live.webp) | ![Antworten am Handy](docs/bilder/handy-frage.webp) |

## Schnellstart

Voraussetzung: [Docker Desktop](https://www.docker.com/products/docker-desktop/) läuft.

```bash
cp .env.example .env        # dann ADMIN_PASSWORD in .env setzen
./start.sh                  # baut und startet alles, öffnet die Regie
```

Danach:

1. **Regie** öffnen (`http://localhost:8080/regie`) und ein Spiel anlegen.
2. **Beamer** öffnen (`http://localhost:8080/beamer`) – dort erscheint der QR-Code zum Mitspielen.
3. Handys scannen den QR-Code (gleiches WLAN), Teams bilden, **Spiel starten**.

Für Zugriff übers Internet (z. B. Handys mit mobilen Daten): `./start.sh online` – siehe [Betrieb](docs/betrieb.md).

## Dokumentation

| Kapitel | Für wen |
|---|---|
| [Spieleabend durchführen](docs/spielleitung.md) | Regie & Moderator: Ablauf, Checkliste, Tipps |
| [Spielregeln](docs/spielregeln.md) | Alle: Runden, Bonuswürfel, Sonderfelder, Vulkan, Sieg |
| [Inhalte erstellen](docs/inhalte.md) | Vorbereitung: Spiele, Fragen, Feld-Minispiele, Import/Export |
| [Betrieb & Installation](docs/betrieb.md) | Technik: Docker, WLAN, Internet, Server, Backups, Fehlerbehebung |
| [Architektur](docs/architektur.md) | Entwickler: Aufbau, Datenfluss, Erweiterungen |
| [Entwicklung](docs/entwicklung.md) | Entwickler: lokal starten, Tests, Werkzeuge |
| [Umstieg von Version 1](docs/umstieg.md) | Was aus der alten Flask-Version wurde |

## Technik in Kürze

TypeScript-Monorepo: **Spiel-Engine** (reine Logik, getestet) · **Server** (Fastify, Socket.IO, SQLite) · **Weboberfläche** (React, Tailwind, Three.js). Alle Bibliotheken und Assets liegen lokal – das Spiel funktioniert auch ohne Internet. 3D-Modelle, Himmel und Sounds sind CC0 (Kenney, Poly Haven), siehe [Lizenzen](packages/web/public/assets/LICENSES.md).
