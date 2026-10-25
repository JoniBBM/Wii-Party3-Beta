---
title: Gemeinsame Spiellogik für Server und Browser
date: 2026-10-04
status: accepted
affects: [engine, spielmodell, spielfeld, show, server, echtzeit, regie, handy, beamer]
---
**Kontext:** In der ersten Version (Flask) steckten Spielregeln verstreut in Server-Routen und Oberflächen. Die Regeln wurden doppelt gepflegt, die Oberflächen rechneten teils anders als der Server, und Abläufe ließen sich kaum automatisch testen. Für den Neubau (Version 2) sollten Server, Beamer, Regie und Handys garantiert dieselben Regeln, Begriffe und Datenformen verwenden.

**Entscheidung:** Alle Spielregeln, Datentypen, Eingabeprüfungen, der Spielfeld-Generator, der Inselplan und die Beamer-Show-Einstellungen liegen in einem eigenen Paket („shared“), das Server und Browser gleichermaßen einbinden. Die Engine ist eine **reine Funktion**: Spielstand + Befehl → neuer Spielstand + Effekte. Uhrzeit, Zufall, neue Kennungen und die Bibliothek werden von außen hineingereicht; das Paket selbst greift weder auf Netzwerk noch Datenbank noch Dateien zu.

- Der **Server ist die einzige Quelle der Wahrheit**: Nur er führt Befehle aus, speichert und verteilt den Spielstand ([[engine]] läuft in [[server]] und [[echtzeit]]).
- Die **Browser** nutzen dasselbe Paket nur zum Anzeigen und Vorausrechnen: Typen, Kataloge (Feldtypen, Teamfarben, Begriffe je Welt), Eingabeprüfung vor dem Absenden, Dauer-Schätzung und Vorschläge im Einrichtungs-Assistenten, Inselplan für Brett-Editor und 3D-Welt.

**Folgen:**
- Jede Regeländerung wirkt an einer Stelle und überall gleich; Server und Oberflächen können nicht auseinanderlaufen.
- Die Abläufe sind mit festen Zufallswerten wiederholbar und durch automatische Tests abgedeckt.
- Der Inselplan (wo Liane, Fässer, Lavahöhle und Kraterloch liegen) wird von Engine, Brett-Editor und 3D-Welt identisch berechnet.
- Im Browser muss die Eingabeprüfung ohne dynamisch erzeugten Code laufen, weil die Sicherheitsrichtlinie des Servers das verbietet – das Paket bietet dafür einen eigenen Schalter, den die Weboberfläche beim Start setzt.
- Was das Paket rechnet, ist für jeden Browser sichtbar. Geheimes (Lösungen, PINs, Zugänge) entsteht deshalb nur auf dem Server und wird vor dem Versand per Projektion entfernt.
