---
name: Beamer koppeln
trigger: Ein Beamer-Fenster (/beamer) wird ohne gültigen Zugang geöffnet
actors: [spielleitung]
steps:
  - == Weg 1 – Kopplungscode (anderer Rechner) ==
  - beamer -> echtzeit: Verbindung ohne Zugang (Ansicht „beamer“)
  - echtzeit -->> beamer: beamer:pair mit 6-stelligem Code
  - note beamer: zeigt nur die Insel und unten rechts den Code – keine Fotos, keine Beitritts-Adressen, kein Verlauf
  - spielleitung -> regie: Beamer → „Beamer zeigt einen Code?“ → Code eingeben
  - regie -> echtzeit: beamer:pair (Code)
  - note echtzeit: nur mit Konto erlaubt; Beamer gehört dem Besitzer des gerade gesteuerten Spiels
  - echtzeit -> konten: Beamer-Schlüssel des Besitzers, Token ausstellen (30 Tage)
  - echtzeit -->> beamer: beamer:token (Beamer speichert den Zugang)
  - echtzeit -->> beamer: show + state in der Beamer-Sicht
  - == Weg 2 – Link oder gleicher Rechner ==
  - spielleitung -> betrieb: ./start.sh beamer
  - betrieb -> konten: im Container – POST /api/auth/admin, dann POST /api/auth/beamer-link
  - konten --> betrieb: Beamer-Token
  - betrieb -> beamer: öffnet Kiosk-Fenster /beamer#bt=… (Vollbild, Ton ohne Klick)
  - note beamer: übernimmt den Zugang und löscht ihn sofort aus der Adresszeile
  - beamer -> echtzeit: Verbindung mit Beamer-Token
  - note beamer: Ist im selben Browser die Regie angemeldet, holt sich der Beamer den Zugang selbst über POST /api/auth/beamer-link
  - == Zugang erlischt ==
  - note echtzeit: Neues Passwort, Sperren oder „Überall abmelden“ des Besitzers → session:ended, der Beamer zeigt wieder einen Code
---
Ein Beamer zeigt die Spielwelt, bekommt aber erst nach einer Freigabe durch die Spielleitung mehr als die nackte Insel. So kann niemand, der nur die Adresse `/beamer` kennt, Fotos, Beitritts-Adressen oder den Spielverlauf mitlesen.

Ein freigegebener Beamer **gehört einem Konto** (bzw. dem Haupt-Admin) und zeigt immer dessen gewähltes Spiel – wechselt die Regie das Spiel, folgt der Beamer automatisch. Die Freigabe gilt 30 Tage.

Kopplungscodes haben sechs Ziffern aus einem kryptografischen Zufallsgenerator; höchstens 300 Beamer können gleichzeitig auf eine Freigabe warten. Ein Tippfehler in der Regie trifft damit praktisch nie den Beamer eines Fremden. Beteiligte Bausteine: [[echtzeit]], [[konten]] und das Startskript `start.sh` (Baustein Betrieb).
