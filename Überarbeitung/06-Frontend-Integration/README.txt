Was muss verbessert werden
--------------------------
- Frontend (Team/Admin/Board) nutzt unterschiedliche, teils instabile Endpunkte/Formate.
- Viel Logik im Template/JS nötig wegen inkonsistenter Backendschnittstellen.
 - CSS/JS/HTML sind nicht konsequent getrennt; Inline-Skripte/-Styles und uneinheitliche Strukturen.

Wie wird es gemacht
-------------------
- Frontend konsumiert nur API v1 + Stream. Templates bleiben, aber Datenbindung über klar definierte Endpunkte.
- Gemeinsame JS-Client-Utilities für API und Stream (ein Parsingpfad für Events/Status).
- Board/Moderation: dieselben Statusquellen, Admin bekommt Zusatzfelder (Rolle im Context).
 - Trennung & Vereinheitlichung:
   - JS als ES-Module mit klarer Ordnerstruktur (siehe JS-Struktur.txt), je Seite ein Entry-Point.
   - CSS nach BEM/Utilities mit Komponenten- und Seitenebenen (siehe CSS-Richtlinien.txt).
   - Templates in Layout/Partials/Macros aufteilen (siehe Templates-Struktur.txt), Inline-Assets entfernen.

ToDos
-----
- API-Client-Modul im Frontend erstellen (fetch, Fehler, Retries, CSRF/JWT).
- Komponenten für Würfelbanner, Spezialfeldbanner auf standardisierte Events umstellen.
 - JS-/CSS-/Template-Struktur anlegen und schrittweise migrieren.
