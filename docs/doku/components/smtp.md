---
name: E-Mail-Server (SMTP)
type: external
layer: extern
tech: [smtp]
provides:
  - smtp Versand von Einladungen, Links zum Zurücksetzen von Passwörtern und Testmails
zone: extern
exposure: public
security:
  - transport: Verschlüsselung in der Regie wählbar – SSL/TLS (meist Port 465), STARTTLS (meist 587) oder ausnahmsweise unverschlüsselt
  - secrets: Zugangsdaten werden in der Regie eingetragen und nur in der Datenbank gespeichert; das Passwort geht nie wieder an den Browser, Fehlermeldungen enthalten keine Zugangsdaten
  - network: Bei Variante A (docker-compose.server.yml) hat der Container absichtlich kein Internet – für den Mailversand ein zusätzliches Netz mit Internet anhängen; auf dem aktuellen VPS (Variante B) ist das nicht nötig
  - other: Links in Mails zeigen nur auf die feste Adresse (PUBLIC_URL oder eingestellte Beitritts-Adresse) – ohne feste Adresse verschickt „Passwort vergessen“ keine Mail
---
Ein beliebiger Mailserver des Betreibers (z. B. das Postfach beim eigenen Mail-Anbieter), über den die Insel E-Mails verschickt. **Optional:** Ohne Mailserver zeigt die Regie die Einladungs- und Zurücksetzen-Links zum Kopieren und Weitergeben an.

Eingerichtet wird er unter *Regie → Einstellungen → E-Mail-Versand*: Mailserver, Port, Verschlüsselung, Benutzer, Passwort, Absenderadresse und -name eintragen, speichern und eine **Testmail** schicken. Genutzt von [[konten]] (Einladung, Passwort vergessen) und der Testmail-Funktion der [[http-api]]. Die Verbindung hat kurze Zeitgrenzen (10 Sekunden Aufbau, 20 Sekunden Übertragung), damit ein hängender Mailserver die Insel nicht aufhält.
