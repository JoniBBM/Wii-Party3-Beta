---
name: Cloudflare-Tunnel
type: external
layer: extern
tech: [cloudflared, cloudflare-zero-trust]
provides:
  - http https://party.jonas-leonie.com – feste Adresse des VPS (benannter Tunnel)
  - http https://<zufall>.trycloudflare.com – wechselnde Adresse des Schnell-Tunnels (./start.sh online)
uses:
  - cloudflared: http "schickt jede Anfrage samt WebSocket durch den Tunnel zum cloudflared auf dem Rechner der Insel" [tls, Tunnel von innen aufgebaut (QUIC bzw. HTTP/2), port=7844]
zone: edge
exposure: public
security:
  - transport: Von außen nur HTTPS mit gültigem Zertifikat von Cloudflare; der Tunnel wird von innen nach außen aufgebaut – am Server ist kein Port aus dem Internet offen
  - transport: Strecke Cloudflare → Rechner der Insel ist ein verschlüsselter Tunnel; erst cloudflared auf demselben Rechner reicht die Anfrage per HTTP weiter
  - network: Auf dem VPS ist der Port der Insel nur an 127.0.0.1 gebunden; nur der lokale cloudflared erreicht ihn
  - network: Die echte Absenderadresse kommt im Kopf Cf-Connecting-Ip und wird nur vom eigenen Tunnel geglaubt (VPS – TRUST_PROXY=172.16.0.0/12; Schnell-Tunnel – Container im Docker-Netz)
  - auth: Über den Tunnel sind Regie- und Moderator-Anmeldungen mit schwachem Passwort immer gesperrt
  - privacy: Zugänge in QR-Codes und Links stehen hinter dem Zeichen „#“ in der Adresse und erscheinen nicht in Tunnel-Protokollen
---
Cloudflare macht die Insel aus dem Internet erreichbar, ohne dass am Server oder Laptop ein Port geöffnet werden muss: Das Programm [[cloudflared]] baut von innen eine verschlüsselte Verbindung zu Cloudflare auf, und Cloudflare reicht Anfragen an die Domain durch diese Verbindung weiter (inklusive WebSocket und HTTPS-Zertifikat).

**Verschlüsselung auf dem Weg:** Gerät → Cloudflare per HTTPS · Cloudflare → cloudflared durch den verschlüsselten Tunnel · cloudflared → Insel per HTTP, aber nur innerhalb desselben Rechners.

**Zwei Arten im Einsatz**

| | Benannter Tunnel (VPS) | Schnell-Tunnel (Laptop) |
|---|---|---|
| Wofür | Dauerbetrieb unter `https://party.jonas-leonie.com` | spontaner Internetzugang am Spielabend |
| Wo läuft cloudflared | als **systemd-Dienst `cloudflared`** direkt auf dem VPS (nicht im Repository) | als Container `tunnel` (Profil `online` in `docker-compose.yml`) |
| Ziel | `http://127.0.0.1:9534` | `http://insel:8080` im Docker-Netz |
| Adresse | fest, eingetragen in Cloudflare (*Zero Trust → Networks → Tunnels → Public Hostname*) | zufällig, ändert sich bei jedem Start, ohne Cloudflare-Konto |
| Absender erkennen | `TRUST_PROXY=172.16.0.0/12` in `.env` | automatisch (Container im selben Docker-Netz) |

Der Tunnel auf dem VPS ist eingerichtet und wird außerhalb dieses Projekts gepflegt. Prüfen: Anleitung „Betrieb“; Störungen (z. B. Fehler 502): [[notfall]].

Warum die echte Absenderadresse wichtig ist: Nur damit kann der [[server]] Rateversuche je Gerät sperren. Erkennt er den Tunnel nicht als eigenen Vorschaltserver, sehen alle Gäste gleich aus und es greifen nur die globalen Bremsen – die Regie zeigt dann einen gelben Sicherheitshinweis.
