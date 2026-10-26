---
name: Tunnel-Programm cloudflared
type: external
layer: extern
tech: [cloudflared]
provides:
  - http Metrics auf Port 2000 im Docker-Netz (nur Schnell-Tunnel) – verrät die aktuelle trycloudflare-Adresse
uses:
  - server: http "reicht jede Anfrage samt WebSocket an die Insel weiter (VPS an http://127.0.0.1:9534, Schnell-Tunnel an http://insel:8080)" [local, port=9534 bzw. 8080, Cf-Connecting-Ip]
zone: intern
exposure: local
security:
  - transport: Der letzte Schritt zur Insel ist einfaches HTTP, verlässt aber den Rechner nicht (Loopback 127.0.0.1 auf dem VPS bzw. internes Docker-Netz beim Schnell-Tunnel) – unterwegs im Netz kann ihn niemand mitlesen
  - network: Baut die Verbindung zu Cloudflare von innen nach außen auf; dafür ist am Rechner kein Port aus dem Internet offen
  - network: Die Metrics auf Port 2000 sind nur im Docker-Netz erreichbar, nicht von außen
---
cloudflared ist das kleine Programm, das auf demselben Rechner wie die Insel läuft und die Verbindung zu [[cloudflare]] hält. Cloudflare schickt jede Anfrage verschlüsselt durch diese Verbindung, cloudflared packt sie aus und reicht sie an den [[server]] weiter.

**Wo es läuft**
- **VPS (benannter Tunnel):** als systemd-Dienst direkt auf dem Server, außerhalb dieses Projekts gepflegt. Ziel ist `http://127.0.0.1:9534` – die Insel ist dort nur an 127.0.0.1 gebunden.
- **Laptop (Schnell-Tunnel):** als Container `tunnel` im Profil `online` von `docker-compose.yml` (feste Version, schreibgeschützt, ohne Sonderrechte). Ziel ist `http://insel:8080` im Docker-Netz. Die zufällige trycloudflare-Adresse fragt die [[http-api]] über die Metrics ab und zeigt sie in der Regie.

**Warum „unverschlüsselt“ hier unbedenklich ist:** Die Strecke Gerät → Cloudflare ist HTTPS, die Strecke Cloudflare → cloudflared ist ein verschlüsselter Tunnel. Nur der allerletzte Schritt cloudflared → Insel ist einfaches HTTP – und der bleibt auf demselben Rechner.
