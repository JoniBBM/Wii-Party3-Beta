---
name: Beamer (Anzeige & Einblendungen)
type: page
layer: ui
path: packages/web/src/pages/beamer/
tech: [react, three.js, motion]
provides:
  - http GET /beamer – 3D-Spielwelt mit allen Einblendungen, ohne Menü
  - http GET /beamer#bt=… – Beamer mit fertigem Zugang (z. B. aus dem Kiosk-Start)
uses:
  - echtzeit: ws "Spielstand (Beamer-Sicht), Effekte, Show-Einstellungen, Erklärung und Fernbefehle der Regie; meldet Bildrate, Grafikstufe, Auflösung, Ton, Vollbild, freie Kamera und „Erklärung fertig“ zurück; Kopplung per Code" [auth=token (Beamer) bzw. Kopplungscode, tls, tunnel, im WLAN-Betrieb http]
  - konten: http "Beamer-Zugang vom Regie-Login auf demselben Rechner holen (/api/auth/beamer-link)" [auth=token, tls, tunnel, im WLAN-Betrieb http]
  - http-api: http "Systeminfo mit Beitritts-Adresse für den Lobby-QR-Code (nur freigegebene Beamer)" [auth=token, tls, tunnel, im WLAN-Betrieb http]
  - szene: call "3D-Szene erzeugen, Effekte abspielen (Director), Kamera, Ortswechsel ins Vulkan-Innere"
  - stimmung: call "Ton – Musik, Effekte, Sprache, Umgebung; Kommentator; Sätze der Spielerklärung"
  - figuren: call "Figuren-Vorschau in Rangliste und Einblendungen"
  - show: call "Show-Einstellungen, Musik je Stimmung und Welt, Wetter-Automatik"
  - spielmodell: call "Rangliste, Statistik, Begriffe je Welt"
  - web-grundlage: call "Live-Verbindung, Frage im Rampenlicht, Welt-Look"
files:
  - BeamerApp.tsx: Rahmen der Beamer-Seite – richtet den Zugang ein (Link, Regie-Login auf demselben Rechner oder Kopplungscode), zeigt 3D-Welt, Kopfzeile, Rangliste, Einblendungen, Foto-Blasen, Spielerklärung und bei fehlender Freigabe groß den Kopplungscode; Schrift wächst mit der Bildschirmbreite.
  - BoardCanvas.tsx: Hält die 3D-Szene – erzeugt sie für die gewählte Welt, füttert sie mit Spielstand und Effekten und baut sie bei einem Weltwechsel neu.
  - useShowControl.ts: Setzt die Einstellungen der Regie um – Grafikstufe (Automatik schaltet bei Ruckeln herunter, nie automatisch auf Ultra), Auflösung, Lautstärken, Musik, Kommentator, Kamera, Vollbild, Testton, Neu laden, Frage vorlesen – und meldet Bildrate & Co. zurück. Gibt Ton und Vollbild nach dem ersten Klick frei.
  - Explainer.tsx: Spielerklärung (gut drei Minuten) – Sprecher erklärt Satz für Satz, Kamera fährt zu den Orten, Vorführ-Figuren zeigen Sonderfelder und Mutproben genau zum gesprochenen Satz, mit Untertiteln; eigene Begriffe je Welt; meldet das Ende an den Server.
  - Hud.tsx: Dauerhafte Anzeigen – Kopfzeile mit Welt-Symbol und Spielname, Rangliste in Teamfarben, Untertitel/Einblendungen des Kommentators und Status (Ton freigeben, Vollbild, freie Kamera, Bildrate).
  - Overlays.tsx: Große Einblendungen je Phase – Lobby mit QR-Code und Teams, Frage groß in der Mitte und danach in der Tafel, Auflösung mit den richtigen Teams, Ergebnis mit Bonuswürfeln, Würfelbanner, Feld-Minispiel, Rundenbilanz und Siegerehrung mit Endwertung.
  - PhotoBubbles.tsx: Foto-Blasen – werden Personen ausgelost, fliegen ihre Fotos (oder Emojis) in Teamfarbe über den Beamer.
  - prefs.ts: Erlaubt einem einzelnen Gerät zum Testen eine feste Grafikstufe über die Adresse (Zusatz „?quality=…“).
zone: client
exposure: public
security:
  - auth: Zugang über den Beamer-Link (Schlüssel hinter „#“, wird sofort aus der Adresszeile entfernt), über das Regie-Login auf demselben Rechner oder per sechsstelligem Kopplungscode, den die Regie freigibt; der Zugang gehört dem Konto und zeigt immer dessen gewähltes Spiel
  - privacy: Nicht freigegebene Beamer gelten als Gast und zeigen nur die Welt – ohne Fotos, Beitritts-Adressen und Ticker. Auch freigegebene Beamer bekommen keine Lösungen vor der Auflösung, keine Antworten anderer Teams vor der Auflösung, keine PINs und weder Spieldauer noch Tempo
  - access: Am Beamer gibt es kein Menü; alle Einstellungen kommen aus der Regie. Die freie Kamera ist aus, bis sie mit Umschalt + K eingeschaltet wird
  - other: Zum Testen lassen sich Welt, Wetter, Jahreszeit, Festzeit und Grafikstufe per Adresszusatz nur auf diesem Gerät überschreiben (z. B. „?world=blocks“, „?weather=snow“)
---
Die große Anzeige im Raum unter `/beamer`: die **3D-Spielwelt** (Insel, Blockwelt oder Weltall) mit Figuren, Kamerafahrten, Kommentator und Musik, darüber die **Einblendungen** für Lobby, Fragen, Auflösung, Ergebnis, Würfeln und Siegerehrung. Die 3D-Grafik selbst steckt in den Bausteinen [[szene]], [[insel]], [[blockwelt]], [[weltall]], [[figuren]], [[auftritte]] und [[stimmung]]; diese Seite verbindet sie mit dem Spielstand.

**Ferngesteuert:** Grafikstufe, Auflösung, Ton, Musik, Kommentator, Kamera, Vollbild, Spielerklärung und Neu laden stellt die [[regie]] unter *Beamer* ein (Einstellungen siehe [[show]]). Alles wirkt sofort auf allen Beamern des Kontos – auch ohne Spiel und in der Lobby. Browser geben Ton und Vollbild erst nach einem Klick frei; im Kiosk-Start (`./start.sh beamer`) entfällt das.

**Kopplung:** Ein Beamer ohne Zugang zeigt unten rechts einen Code. Die Regie gibt ihn unter *Beamer* frei; der Server schickt dann einen Zugang, den sich der Beamer merkt – einmal koppeln reicht für alle künftigen Abende ([[beamer-kopplung]]).

**Takt mit dem Server:** Der Server rechnet aus, wie lange die Animationen eines Zugs dauern, und lässt das nächste Team erst danach würfeln. Der Beamer spielt die Effekte der Reihe nach ab und gleicht nach Rückgängig oder Neuverbindung mit dem Spielstand ab ([[spielrunde]]).

**Am Beamer selbst:** Freie Kamera mit Umschalt + K (ziehen, Mausrad, Pfeiltasten, W A S D, + / −; Leertaste, Esc oder Doppelklick zurück zur Automatik). Während der Spielerklärung ist die Kamera gesperrt. Vollbild per Klick ins Bild, wenn in der Regie eingeschaltet.
