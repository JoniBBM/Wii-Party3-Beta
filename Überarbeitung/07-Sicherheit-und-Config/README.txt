Was muss verbessert werden
--------------------------
- Default-Admin-Passwort hartkodiert; fehlende Env-Validierung.
- eval-Fallbacks beim Parsen von Events (Sicherheitsrisiko).
- Upload-/Bilder-Handling (Profilbilder) absichern.
- RBAC/Scopes klar definieren, Trennung Admin/Team per Rollen, nicht per Route.

Wie wird es gemacht
-------------------
- Secrets/Config ausschließlich über `.env`/Umgebung, sichere Defaults entfernen.
- eval vollständig entfernen, strikt JSON und Migration alter Daten.
- CSRF für HTML-Formulare; für reine API Endpunkte: CSRF-Ausnahmen mit Token/JWT.
- Rate Limits für kritische Endpunkte (optional).
- Upload-Validierung (MIME/Größe), Pfad-Whitelists, keine frei wählbaren Pfade.

ToDos
-----
- Config-Härtung und Doku (.env.example).
- Security-Review der Upload-Routen und Bildverarbeitung.
- Rollen-/Scope-Matrix erstellen (Endpunkt x Rolle -> erlaubt?).
