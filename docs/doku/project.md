---
id: wii-party3-beta
name: Insel der Abenteuer
summary: Partyspiel für Gruppen im Stil von Wii Party – Teams spielen mit dem Handy, der Beamer zeigt eine 3D-Spielwelt, die Spielleitung steuert alles aus der Regie.
tech: [typescript, node, fastify, socket.io, sqlite, react, vite, tailwind, three.js, docker]
repo: https://github.com/JoniBBM/Wii-Party3-Beta
url: https://party.jonas-leonie.com
layers: [ui: Oberflächen (Handy, Regie, Beamer), grafik: 3D-Spielwelt auf dem Beamer, logik: Spiellogik (gemeinsam), api: Server, daten: Daten, betrieb: Betrieb & Tests, extern: Externe Dienste]
zones: [client: Geräte der Teilnehmer, edge: Tunnel / Internet, intern: Server im Container, data: Datenablage, extern: Fremde Dienste]
zone: intern
security:
  - auth: Spielleitung meldet sich mit Konto an (Haupt-Admin per Passwort aus .env); Teams, Moderator und Beamer bekommen eigene, eingeschränkte Zugänge
  - access: Rollen (admin, spielleiter, moderator, beamer, team, gast) – Lösungen und PINs gehen nie an Handys oder Beamer
  - secrets: Passwörter und Schlüssel nur in .env auf dem Server, nie im Repository
  - transport: Von außen nur über den Cloudflare-Tunnel mit HTTPS; im WLAN direkt über HTTP
  - privacy: Selfies der Spieler bleiben auf dem Server und lassen sich je Spiel löschen
  - ratelimit: Sperren gegen Rateversuche bei Anmeldung und PIN
ignore:
  - legacy/**
  - Stimmproben/**
  - data/**
  - packages/web/public/assets/**
  - packages/server/seed/**
  - "**/*.html"
---
„Insel der Abenteuer“ ist ein Partyspiel für Gruppen (z. B. Jugendfreizeiten): 2–10 Teams laufen auf einem Spielbrett zum Gipfel eines Vulkans. Zwischen den Würfelrunden gibt es Minispiele und Fragen; Sonderfelder, Mutproben und ein Vulkanausbruch sorgen für Wendungen.

**Wer nutzt was:**
- **Teams** spielen mit dem eigenen Handy (oder einem Gruppen-Gerät): anmelden, Figur gestalten, antworten, buzzern, würfeln.
- **Beamer** zeigt die 3D-Spielwelt mit Kamerafahrten, Kommentator, Musik und Einblendungen – wahlweise als Insel, Blockwelt (Minecraft-Stil) oder Weltall.
- **Regie** (Laptop/Tablet) steuert das Spiel, richtet es ein und verwaltet Inhalte, Teams und Konten; ein **Moderator** kann vorlesen und mitsteuern.

**Technik in einem Satz:** Ein Node-Server (Fastify, Socket.IO, SQLite) hält den Spielstand und verteilt ihn in Echtzeit; die Weboberfläche (React, three.js) läuft im Browser aller Geräte; die Spielregeln stecken in einem gemeinsamen Paket, das Server und Browser gleichermaßen nutzen. Betrieben wird alles als Docker-Container – lokal auf einem Laptop oder auf einem VPS hinter einem Cloudflare-Tunnel.
