---
name: Anmeldung der Spielleitung
trigger: Ein Admin lädt einen Spielleiter ein bzw. jemand meldet sich in der Regie an
actors: [admin, spielleiter]
steps:
  - == Einladung ==
  - admin -> regie: Konten → Name, E-Mail, Rolle (Spielleiter oder Admin)
  - regie -> konten: POST /api/users
  - konten -> datenbank: Konto „eingeladen“ ohne Passwort, Link-Hash (gilt 7 Tage)
  - konten ->> smtp: Einladungsmail mit Link …/konto#t=… (nur mit Mailserver und fester Adresse)
  - konten --> regie: Link zum Kopieren (falls keine Mail möglich)
  - spielleiter -> regie: öffnet den Link und legt ein Passwort fest (mind. 10 Zeichen)
  - regie -> konten: POST /api/auth/set-password
  - konten -> datenbank: scrypt-Hash speichern, Link verbrauchen, Konto aktiv, Schlüsselversion +1
  - konten --> regie: signiertes Token (Spielleiter, 7 Tage) – gleich angemeldet
  - == Anmeldung ==
  - spielleiter -> regie: E-Mail + Passwort (Haupt-Admin – Benutzername admin + ADMIN_PASSWORD)
  - regie -> konten: POST /api/auth/login bzw. POST /api/auth/admin
  - note konten: Bremse gegen Rateversuche prüfen, Passwort in konstanter Zeit prüfen, Fehlversuch zählen
  - konten --> regie: Token (im Browser gespeichert)
  - regie -> echtzeit: Verbindung mit Token aufbauen
  - note echtzeit: Konto prüfen, gewähltes Spiel bestimmen – im eigenen Spiel ist das Konto die Regie
  - echtzeit -->> regie: state (volle Sicht), show, beamers, presence
  - == Abmelden und Sperren ==
  - admin -> regie: Konten → Überall abmelden / Sperren / neues Passwort
  - regie -> konten: POST /api/users/:id/logout bzw. PUT /api/users/:id
  - konten -> datenbank: Schlüsselversion +1 (alle Tokens des Kontos ungültig)
  - konten -> echtzeit: refreshAccounts
  - echtzeit -->> regie: session:ended – das Regie-Fenster springt ohne Neuladen zur Anmeldung
  - note echtzeit: Beamer und Moderator-Links dieses Kontos verlieren ihren Zugang ebenfalls
---
Wie Spielleiter zu einem Konto kommen, wie die Anmeldung in der Regie abläuft und wie ein Admin Zugänge sofort wieder entzieht.

**Haupt-Admin:** Er hat kein Konto in der Datenbank. Er meldet sich auf derselben Anmeldeseite mit dem Benutzernamen `admin` und dem `ADMIN_PASSWORD` aus der Datei `.env` an. Wird dieses Passwort in `.env` geändert und der Container neu gestartet, sind alle bisherigen Regie-, Moderator- und Beamer-Zugänge des Haupt-Admins ungültig.

**Passwort vergessen:** Auf der Anmeldeseite „Passwort vergessen“ wählen. Der Server antwortet immer gleich (verrät nicht, ob es die Adresse gibt) und schickt – nur mit eingerichtetem Mailserver ([[smtp]]) und fester Adresse – einen Link, der eine Stunde gilt. Danach sind alle anderen Geräte des Kontos abgemeldet.

**Eigenes Passwort ändern:** Unter *Konto*. Das eigene Gerät bekommt sofort einen neuen Zugang (`session:token`), alle anderen werden abgemeldet.

Die Bremsen gegen Rateversuche und die Laufzeiten der Zugänge stehen bei [[konten]].
