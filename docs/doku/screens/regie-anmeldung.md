---
title: Anmeldung der Spielleitung
url: /regie
order: 20
components: [regie, konten]
image: assets/screens/regie-anmeldung.webp
hotspots:
  - 38.4,45.6,23.2,5.3: konten, flow:anmeldung-spielleitung "Benutzername oder E-Mail des Kontos"
  - 38.4,52.7,23.2,5.3: konten "Passwort – nach mehreren Fehlversuchen wird kurz gesperrt"
  - 38.4,59.8,23.2,6.2: konten, flow:anmeldung-spielleitung, screen:regie-live "Anmelden und zur Regie"
  - 38.4,67.8,9.5,2.2: konten, smtp "Link zum Zurücksetzen per E-Mail anfordern"
---
Hier meldet sich die Spielleitung an – mit dem eigenen Konto oder als Haupt-Admin mit dem Passwort aus der Server-Einstellung. Nach mehreren Fehlversuchen wird kurz gesperrt. Über das Internet sind schwache Passwörter immer gesperrt. Ablauf: [[anmeldung-spielleitung]].
