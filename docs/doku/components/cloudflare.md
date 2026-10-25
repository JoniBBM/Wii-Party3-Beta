---
name: Cloudflare-Tunnel
type: external
layer: extern
tech: [cloudflared, cloudflare-zero-trust]
provides:
  - http https://party.jonas-leonie.com – feste Adresse des VPS (benannter Tunnel)
  - http https://<zufall>.trycloudflare.com – wechselnde Adresse des Schnell-Tunnels (./start.sh online)
uses:
  - server: http "leitet alle Anfragen samt WebSocket weiter (VPS an http://127.0.0.1:9534, Schnell-Tunnel an http://insel:8080)" [plain, intern, Cf-Connecting-Ip]
zone: edge
exposure: public
security:
  - transport: Von außen nur HTTPS mit gültigem Zertifikat von Cloudflare; der Tunnel wird von innen nach außen aufgebaut – am Server ist kein Port aus dem Internet offen
  - network: Auf dem VPS ist der Port der Insel nur an 127.0.0.1 gebunden; nur der lokale cloudflared erreicht ihn
  - network: Die echte Absenderadresse kommt im Kopf Cf-Connecting-Ip und wird nur vom eigenen Tunnel geglaubt (VPS – TRUST_PROXY=172.16.0.0/12; Schnell-Tunnel – Container im Docker-Netz)
  - auth: Über den Tunnel sind Regie- und Moderator-Anmeldungen mit schwachem Passwort immer gesperrt
  - privacy: Zugänge in QR-Codes und Links stehen hinter dem Zeichen „#“ in der Adresse und erscheinen nicht in Tunnel-Protokollen
  - access: Empfohlen (optional) – Cloudflare Access vor /regie, /api/auth/admin und /api/auth/moderator, damit ohne Cloudflare-Login niemand bis zur Passwortabfrage kommt
---
Cloudflare macht die Insel aus dem Internet erreichbar, ohne dass am Server oder Laptop ein Port geöffnet werden muss: Das Programm **cloudflared** baut von innen eine Verbindung zu Cloudflare auf, und Cloudflare reicht Anfragen an die Domain durch diese Verbindung weiter (inklusive WebSocket und HTTPS-Zertifikat).

**Zwei Arten im Einsatz**

| | Benannter Tunnel (VPS) | Schnell-Tunnel (Laptop) |
|---|---|---|
| Wofür | Dauerbetrieb unter `https://party.jonas-leonie.com` | spontaner Internetzugang am Spielabend |
| Wo läuft cloudflared | als **systemd-Dienst `cloudflared`** direkt auf dem VPS (nicht im Repository) | als Container `tunnel` (Profil `online` in `docker-compose.yml`) |
| Ziel | `http://127.0.0.1:9534` | `http://insel:8080` im Docker-Netz |
| Adresse | fest, eingetragen in Cloudflare (*Zero Trust → Networks → Tunnels → Public Hostname*) | zufällig, ändert sich bei jedem Start, ohne Cloudflare-Konto |
| Absender erkennen | `TRUST_PROXY=172.16.0.0/12` in `.env` | automatisch (Container im selben Docker-Netz) |

Für den VPS gäbe es noch Variante A (cloudflared als Docker-Container im internen Netz `insel-tunnel`, Datei `docker-compose.server.yml`); sie ist dort nicht im Einsatz. Einrichtung und Prüfung: Anleitung „Betrieb“; Störungen (z. B. Fehler 502): [[notfall]].

Warum die echte Absenderadresse wichtig ist: Nur damit kann der [[server]] Rateversuche je Gerät sperren. Erkennt er den Tunnel nicht als eigenen Vorschaltserver, sehen alle Gäste gleich aus und es greifen nur die globalen Bremsen – die Regie zeigt dann einen gelben Sicherheitshinweis.
