---
title: Aktualisieren
order: 30
audience: Betrieb
summary: Neue Version auf den VPS bzw. den Laptop holen, prüfen und im Notfall zurückgehen.
---
# Aktualisieren

Neue Versionen kommen über GitHub (`github.com/JoniBBM/Wii-Party3-Beta`, Zweig `main`). Das Docker-Abbild wird bei jedem Update auf dem Server aus dem Quellcode neu gebaut; der Datenordner bleibt dabei unangetastet.

## VPS (party.jonas-leonie.com)

Per SSH auf dem VPS anmelden, dann:

```bash
cd ~/party/Wii-Party3-Beta && git pull && docker compose up -d --build
```

Prüfen:

```bash
curl -s https://party.jonas-leonie.com/api/health
```

Erwartet wird `{"ok":true,"version":"2.0.0"}`. Weitere Prüfungen bei Bedarf:

```bash
docker compose ps                         # Status „healthy“ beim Dienst insel
docker compose logs --tail 100 insel      # letzte Meldungen des Servers
```

Hinweise:
- Immer nur `docker-compose.yml` verwenden (also **ohne** `-f docker-compose.server.yml`) – sonst hat der Container keinen Port und Cloudflare meldet Fehler 502.
- Der Bau dauert einige Minuten (die Weboberfläche wird mitgebaut). Der alte Container läuft so lange weiter; ersetzt wird er erst am Ende – die Unterbrechung ist kurz. Geöffnete Spiele laufen nach dem Neustart mit ihrem gespeicherten Stand weiter; nur die Rückgängig-Schritte gehen verloren. Deshalb möglichst nicht mitten in einem Spieleabend aktualisieren.
- Bringt ein Update **neue Einstellungen** mit, stehen sie in `.env.example`. Vergleich der Namen (zeigt keine Werte an):

  ```bash
  diff <(grep -oE '^[A-Z_]+=' .env.example | sort) <(grep -oE '^[A-Z_]+=' .env | sort)
  ```

  Fehlende Einträge in `.env` ergänzen und erneut `docker compose up -d` ausführen.
- **Datenbank-Änderungen** spielt der Server beim Start automatisch ein. Vor größeren Updates vorher den Datenordner sichern (Anleitung **Notfall**, Abschnitt Backup) – ein Zurückgehen auf eine ältere Version ist nach einer Datenbank-Änderung nicht vorgesehen.
- **Neue mitgelieferte Inhalte** (Zusatzpakete) bekommt eine bestehende Installation beim nächsten Start genau einmal; gelöschte Pakete kommen nicht wieder.
- Alte, nicht mehr benutzte Docker-Abbilder belegen mit der Zeit Platz. Aufräumen bei Bedarf mit `docker image prune` (entfernt nur Abbilder ohne Namen, die kein Container mehr nutzt).
- Der **systemd-Dienst cloudflared** ist nicht Teil des Repositorys und wird mit diesem Update nicht erneuert. Wie er installiert wurde (z. B. über die Paketquelle von Cloudflare), ist hier nicht festgehalten; Zustand prüfen mit `systemctl status cloudflared`.

## Laptop

```bash
cd Wii-Party3-Beta        # Projektordner
git pull
./start.sh               # bzw. ./start.sh online
```

`./start.sh` baut neu und startet den Container. Die Datei `.env` und der Ordner `data/` bleiben erhalten.

**Schnell-Tunnel:** Die Version des Tunnel-Abbilds ist in `docker-compose.yml` fest eingetragen (`cloudflare/cloudflared:2026.10.0`) und wird bei Bedarf dort angehoben.

## Zurück zur vorherigen Version

Falls nach einem Update etwas nicht funktioniert:

```bash
cd ~/party/Wii-Party3-Beta
git log --oneline -5              # letzte Versionen ansehen
git checkout <commit-vorher>      # gewünschte Version auswählen
docker compose up -d --build
```

Hat das Update die Datenbank verändert, vorher das Backup des Datenordners zurückspielen (Anleitung **Notfall**). Zurück zur aktuellen Version: `git checkout main && git pull && docker compose up -d --build`.

## Für Entwickler: nach einem Push

Nach jeder fertigen Änderung, die auf GitHub landet, die obigen VPS-Befehle ausführen (bzw. dem Betreiber geben) und mit `/api/health` prüfen. Ändern sich Einstellungen in `.env`, die neuen Einträge ausdrücklich nennen.
