# Überarbeitung – Technische Neuausrichtung

Ziel: Das Spiel technisch auf ein neues Level heben. Fokus auf klare Schnittstellen, wiederverwendbare Services, saubere Datenmodelle, konsistente APIs, robuste Sicherheit und testbare Implementierung.

Diese Überarbeitung dokumentiert, was verbessert werden muss (Was/Warum), wie es umgesetzt wird (Wie), und hält Entscheidungen sowie TODOs pro Themenbereich fest.

Arbeitskontext und KI-Anweisung
--------------------------------
- Aktueller Arbeitsordner: `Überarbeitung` (Unterordner enthalten themenspezifische Pläne und Protokolle).
- WICHTIG (für KI und Mitwirkende): Bei jeder Änderung präzise dokumentieren
  - was gemacht wurde (konkret: Dateien, Endpunkte, Services, Migrationsschritte),
  - warum es gemacht wurde (Ziel, Problem, Entscheidung),
  - wo wir uns gerade befinden (aktueller Ordner/Pfad, betroffene Module),
  - nächster geplanter Schritt (kurz, überprüfbar).
  Diese Hinweise sind in jedem Unterordner als README/Protokoll zu ergänzen/fortzuführen.

- Commit-/Push-Policy (sehr wichtig):
  - Die KI beschreibt dem User stets exakt, was geändert werden soll (Dateipfade, Diff/Änderungen, Befehle) und wartet auf Bestätigung.
  - Commits und Pushes zu GitHub erfolgen ausschließlich durch den User, niemals durch die KI.
  - Die KI liefert schrittweise, überprüfbare Änderungen und passt den Plan an, sobald der User bestätigt.

- Laufzeitumgebung: Docker Live-Umgebung
  - Das Projekt läuft typischerweise in Docker (docker-compose) mit Live-Mount (`.:/app`).
  - Änderungen am Code werden im Container sichtbar; ggf. ist ein Reload/Neustart erforderlich (abhängig von Flask/Server-Konfiguration).
  - Relevante Dateien: `Dockerfile`, `docker-compose.yml`. Deployment-Details siehe `Überarbeitung/09-Deployment-und-DevOps/`.

Testprozess und Gate nach jeder Änderung
---------------------------------------
- Nach jeder einzelnen Änderung gibt die KI konkrete Test-Anweisungen mit:
  - Was genau zu testen ist (URLs/Endpunkte, UI-Aktionen, Kommandos),
  - Wie getestet wird (Schritte in Docker-Live-Umgebung),
  - Erwartete Ergebnisse/Erfolgskriterien und ggf. Logs, die zu prüfen sind,
  - Optional: Rollback-Hinweise, falls etwas fehlschlägt.
- Die KI wartet auf die Rückmeldung des Users (Testergebnisse). Erst bei erfolgreichem Feedback geht es weiter. Andernfalls werden Fixes vorgeschlagen und wieder getestet.
- Dieser Ablauf wird in jedem Protokoll festgehalten (siehe Protokoll-Template: Test-Anleitung/Erfolgskriterien/Ergebnisse/Genehmigung).
- WICHTIG: Tests step-by-step – immer nur eine Sache testen. Die KI gibt genau einen Testschritt vor, wartet auf Ergebnis, dann folgt der nächste. So bleiben Ursache/Wirkung eindeutig.

Nach erfolgreichem Test eines Schritts
--------------------------------------
- Wenn alle Tests für den jeweiligen Schritt erfolgreich waren, weist die KI den User darauf hin, dass jetzt gepusht werden kann.
- Die KI schlägt eine kurze, präzise Push-/Commit-Beschreibung vor (z. B. "feat(api-v1): add read-only board status endpoint" oder "chore(events): store dice_event as JSON").
- Der Push erfolgt ausschließlich durch den User. Erst danach geht es mit dem nächsten Schritt weiter.

Pflicht: Dokumentation nach jeder Änderung
-----------------------------------------
- Nach jeder Änderung wird im passenden Protokoll festgehalten:
  - Was/Warum/Wo/Nächster Schritt,
  - Test-Anleitung (Wie testen) und Testergebnis (erfolgreich/nicht),
  - Genehmigung des Users (ja/nein),
  - Status: Abgeschlossen (bei Erfolg) bzw. Offen (bei Folgearbeiten notwendig).

Spielprinzip (Allgemein)
------------------------
- Teams bewegen sich rundenweise auf einem Spielbrett von Start (0) bis Ziel (72).
- Pro Runde wählt der Admin Inhalte (Minigames/Fragen) aus Ordnern aus (manuell, zufällig, geplant). Fragen erlauben Antworten pro Team; richtige und schnelle Antworten vergeben Platzierungen.
- Platzierungen verleihen Bonuswürfel (z. B. 1–6 Seiten), die sich zum Standardwurf addieren.
- Beim Würfeln bewegen sich Teams entsprechend, Sonderfelder können zusätzliche Effekte auslösen:
  - Katapult vorwärts/rückwärts (Positionssprung),
  - Spieler-Tausch (Position swap),
  - Sperren-Feld (Team ist blockiert, wird per Würfelregel befreit).
- Zielbedingung: Wer sich bereits auf Feld 72 befindet, gewinnt mit einem späteren Wurf ≥ 6.
- Der Spielstatus (Teams, Session/Phase, Events) wird zentral verwaltet, das Gameboard zeigt ihn live (Echtzeit-Events + periodisches Refresh als Fallback).

Struktur:
- 01-Architektur
- 02-APIs-und-Routen
- 03-Datenbank-und-Modelle
- 04-Services-und-Domain-Logik
- 05-Events-und-Echtzeit
- 06-Frontend-Integration
- 07-Sicherheit-und-Config
- 08-Tests-und-Qualität
- 09-Deployment-und-DevOps
- 10-Migration-und-Backwards-Compat
 - 11-Gameboard

Querschnittliche Kernziele:
- Eine einzige, versionierte API-Schicht für Admin- und Team-Dashboards (Rollen/Scopes regeln Zugriff, nicht getrennte Logik).
- Services/Use-Cases statt Logik in Routen (Trennung von Web, Domain, Datenzugriff).
- Einheitliche JSON-Schemata, Fehlerbehandlung und Ereignisformate (Events).
- Entfernung von Duplikaten und Legacy-Pfaden. Deprecation-Strategie und Migrationsplan.
- Sicherheit „by default“ (keine eval-Fallbacks, Secrets aus Env, Upload-Validierung, RBAC).
- Saubere Alembic-Migrationen, Indizes, Constraints, ggf. Normalisierung.
- Automatisierte Tests, Linting/Type-Checks und CI.

Hinweis: In jedem Unterordner liegen .txt-Dateien mit „Was“, „Wie“, „ToDos“ und ggf. Beispielen/Schnittstellen.
