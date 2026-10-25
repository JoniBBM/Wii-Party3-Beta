---
name: Anmeldung & Konten
type: service
layer: api
path: [packages/server/src/auth.ts, packages/server/src/users.ts, packages/server/src/mail.ts, packages/server/src/http/auth-routes.ts, packages/server/src/http/users-routes.ts, packages/server/src/http/account-links.ts]
tech: [node, fastify, zod, nodemailer, scrypt, hmac-sha256]
provides:
  - http POST /api/auth/admin – Haupt-Admin mit ADMIN_PASSWORD
  - http POST /api/auth/login – Spielleiter/weitere Admins mit E-Mail und Passwort
  - http POST /api/auth/forgot – Passwort vergessen (Link per E-Mail)
  - http POST /api/auth/link-info – Einladungs-/Zurücksetzen-Link prüfen
  - http POST /api/auth/set-password – Passwort über Link festlegen
  - http PUT /api/account – eigenen Namen ändern
  - http POST /api/account/password – eigenes Passwort ändern
  - http POST /api/auth/moderator – Moderator mit Passwort und Spielcode
  - http POST /api/auth/moderator-link – Moderator-Link (QR, 24 Stunden) für das gewählte Spiel
  - http POST /api/auth/beamer-link – Beamer-Zugang (30 Tage)
  - http POST /api/join/check – Spielcode prüfen
  - http POST /api/auth/pin – Team-Beitritt mit PIN und Spielcode
  - http POST /api/auth/team-link – Team-Beitritt per Team-QR-Code
  - http POST /api/auth/register – Spieler meldet sich in der Lobby an
  - http POST /api/auth/become-player – Team-Gerät wird zu einem Spieler des Teams
  - http GET /api/auth/me – wer bin ich (Rolle, Konto, Spiel, Team)
  - http GET, POST /api/users – Konten auflisten, Spielleiter einladen (nur Admins)
  - http PUT, DELETE /api/users/:id – Konto ändern, sperren, löschen (nur Admins)
  - http POST /api/users/:id/link – Einladung erneut bzw. Link zum Zurücksetzen
  - http POST /api/users/:id/logout – Konto überall abmelden
uses:
  - datenbank: call "Konten, Link-Hashes, Einstellungen (SMTP, feste Adresse)"
  - smtp: smtp "Einladung, Passwort zurücksetzen" [tls, auth=smtp-passwort, port=587/465]
  - server: call "Rolle im Spiel (access.ts), echte Absenderadresse (net.ts), Spieler anlegen über die Spiel-Laufzeit"
  - echtzeit: call "Spiel zum Spielcode finden; abgemeldete Geräte sofort informieren (refreshAccounts)"
  - spielmodell: call "Teamfarben, Fehlerarten der Engine"
files:
  - auth.ts: Signierte Zugangs-Tokens (HMAC-SHA256 mit dem Sitzungsschlüssel) ausstellen und prüfen, Laufzeiten je Rolle, zeitkonstanter Passwortvergleich, kurze zufällige IDs. Enthält außerdem die Bremsen gegen Rateversuche (Sperre je Adresse, globale Fehlversuch-Eimer, „bewährte Adressen“, einfache Mengenbremse).
  - users.ts: Konten der Spielleiter und weiteren Admins. Passwörter mit scrypt (mit Salz) speichern und prüfen, Passwortregeln, Schlüssel je Konto, je Spiel (Moderator) und je Besitzer (Beamer), einmalige Links für Einladung (7 Tage) und Zurücksetzen (1 Stunde).
  - mail.ts: E-Mail-Versand über den in der Regie eingetragenen Mailserver (nodemailer). Baut schlichte Mails mit einem Knopf und übersetzt Fehler des Mailservers in verständliche Hinweise ohne Zugangsdaten.
  - http/auth-routes.ts: Alle Anmelde-Schnittstellen – Haupt-Admin, Konto, Passwort vergessen/festlegen, eigenes Konto, Moderator, Beamer-Link, Spielcode, Team-PIN, Team-QR-Code, Spieler-Anmeldung, „wer bin ich“. Setzt die Grenzen für Fehlversuche je Anlass und die zentrale Fehlerbehandlung aller Schnittstellen.
  - http/users-routes.ts: Kontenverwaltung für Admins – einladen, umbenennen, Rolle ändern, sperren/entsperren, Link schicken, überall abmelden, löschen (Spiele und Inhalte gehen dann an den Haupt-Admin über). Zeigt, wer gerade online ist.
  - http/account-links.ts: Erzeugt Einladungs- und Zurücksetzen-Links und verschickt sie per E-Mail. Links zeigen nur auf die feste Adresse (PUBLIC_URL oder eingestellte Beitritts-Adresse), damit niemand sie auf eine fremde Seite umbiegen kann.
zone: intern
exposure: public
security:
  - auth: Haupt-Admin meldet sich mit Benutzername „admin“ und ADMIN_PASSWORD aus .env an (kein Konto in der Datenbank); Vergleich in konstanter Zeit
  - auth: Spielleiter und weitere Admins melden sich mit E-Mail und Passwort an; gespeichert nur als scrypt-Hash mit Salz; mindestens 10 Zeichen, keine bekannten Passwörter
  - auth: Moderator mit MODERATOR_PASSWORD (oder Regie-Passwort) plus Spielcode – oder per Moderator-Link aus der Regie (24 Stunden)
  - auth: Teams mit 6-stelliger PIN plus Spielcode (ältere Spiele 4-stellig) oder per Team-QR-Code mit unerratbarem Schlüssel; Spieler melden sich in der offenen Lobby mit Spielcode an
  - auth: Zugänge sind signierte Tokens (HMAC-SHA256) ohne Sitzungsspeicher – gültig Regie 3 Tage, Spielleiter 7 Tage, Moderator 2 Tage (Link 24 Stunden), Beamer 30 Tage, Team und Spieler 3 Tage
  - access: In jedem Token steckt ein Schlüssel – ADMIN_PASSWORD oder MODERATOR_PASSWORD ändern macht alle Regie-, Moderator- und Beamer-Zugänge des Haupt-Admins ungültig; neues Konto-Passwort, Sperren oder „Überall abmelden“ macht alle Geräte des Kontos samt seiner Beamer und Moderator-Links ungültig; „Neue PIN“ macht alle Geräte des Teams ungültig
  - access: Konten verwalten, SMTP und Systemeinstellungen nur für Admins; man kann sich nicht selbst sperren, herabstufen oder löschen
  - ratelimit: Fehlversuche doppelt gebremst – globaler Eimer je Anlass (Admin 15, Konto 20, Moderator 15 Fehlversuche je Minute; PIN 20 je Minute und 100 je Stunde; Passwort vergessen 10 je Minute und 60 je Stunde; Spielcode 30 je Minute und 300 je Stunde) plus Sperre je echter Adresse (nach 5–20 Fehlern, Dauer verdoppelt sich bis 1 Stunde)
  - ratelimit: Sperre je Adresse nur bei echten Adressen über den eigenen Tunnel und nur, solange von dort noch niemand richtig angemeldet wurde – Tippfehler sperren weder den Saal im WLAN noch alle Gäste hinter einem Anschluss aus; Team-QR-Codes und Konto-Links ohne globalen Eimer (sonst könnte jemand alle blockieren)
  - secrets: Einladungs- und Zurücksetzen-Links sind 32 Byte Zufall, nur einmal gültig, laufen ab und werden nur als Hash gespeichert
  - privacy: „Passwort vergessen“ antwortet immer gleich; die Anmeldung rechnet auch ohne Konto gleich lange; „Konto gesperrt“ wird nur bei richtigem Passwort verraten
  - network: Über den Cloudflare-Tunnel oder im Internet-Betrieb keine Regie-/Moderator-Anmeldung bei schwachem Passwort oder abgeschalteter Anmeldung (Antwort 403)
  - input: Alle Eingaben mit Schemas geprüft (Längen, E-Mail-Format, PIN-Format, Spielcode 4–8 Zeichen)
---
Dieser Baustein entscheidet, wer hereinkommt: Er stellt die Zugänge für alle Rollen aus und verwaltet die Konten der Spielleitung.

**Rollen und wie man hereinkommt**

| Rolle | Wer | Anmeldung | Sieht/darf |
|---|---|---|---|
| Haupt-Admin | Betreiber des Servers | Benutzername `admin` + `ADMIN_PASSWORD` aus `.env` | alles, alle Spiele und Konten |
| Admin (Konto) | weitere Verwalter | E-Mail + Passwort (eingeladen) | wie Haupt-Admin |
| Spielleiter (Konto) | Leitung eines Abends | E-Mail + Passwort (eingeladen) | nur eigene Spiele und Sammlungen, veröffentlichte Sammlungen lesen |
| Moderator | Vorleser | Passwort + Spielcode oder QR-Link aus der Regie | ein Spiel, sieht Lösungen, keine PINs |
| Beamer | Anzeige | Kopplungscode oder Beamer-Link ([[beamer-kopplung]]) | gewähltes Spiel seines Besitzers, keine Lösungen |
| Team | Team-Gerät | 6-stellige PIN + Spielcode oder Team-QR-Code | eigenes Team |
| Spieler | einzelne Person | Anmeldung in der Lobby mit Spielcode | eigenes Team |
| Gast | jeder mit Spielcode | – | nur die Insel, keine Fotos, kein Verlauf |

Ein Konto wird im **eigenen Spiel** zur Regie (Rolle „admin“ im Spiel); Admins dürfen alle Spiele steuern.

**Zugänge (Tokens):** Nach der Anmeldung bekommt das Gerät ein signiertes Token und speichert es im Browser (localStorage). Es wird bei jeder Anfrage und beim Aufbau der Echtzeitverbindung mitgeschickt. Der Server braucht dafür keinen Sitzungsspeicher; trotzdem lassen sich Zugänge sofort entwerten, weil in jedem Token ein Schlüssel steckt, der an Passwort bzw. PIN hängt (siehe Sicherheit). Zugänge in QR-Codes und Links (Team, Moderator, Beamer, Konto-Link) stehen hinter `#` in der Adresse und landen so in keinem Server- oder Tunnel-Protokoll.

**Konten** legt ein Admin unter *Regie → Konten* an. Die eingeladene Person bekommt einen Link (per E-Mail über [[smtp]] oder zum Weitergeben) und legt damit ihr Passwort fest. Ablauf: [[anmeldung-spielleitung]]. Wird ein Konto gelöscht, gehen seine Spiele, Sammlungen und Vorlagen an den Haupt-Admin über.

**Passwort vergessen** verschickt nur dann eine E-Mail, wenn ein Mailserver eingerichtet und eine feste Adresse bekannt ist (`PUBLIC_URL` oder *Einstellungen → Beitritts-Adresse*). Je Konto höchstens ein Link alle zwei Minuten.

**Der Haupt-Admin hat kein Konto** – sein Passwort steht nur in `.env`. Wie man es ändert oder ein vergessenes Passwort zurückholt, steht in [[notfall]].
