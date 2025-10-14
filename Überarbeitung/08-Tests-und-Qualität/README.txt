Was muss verbessert werden
--------------------------
- Kaum automatisierte Tests; Logik schwer testbar wegen Verteilung in Routen.
- Kein Linting/Type-Checking definiert.

Wie wird es gemacht
-------------------
- Testpyramide: Unit-Tests für Services, Integrationstests für API v1, Smoke-Tests für Start/Init.
- Factories/Fixtures für DB-Objekte (Teams, Runden, Inhalte).
- Linting (ruff/flake8) + Typisierung (mypy/pyright) + Formatter (black) in CI.

ToDos
-----
- pytest-Struktur anlegen (`tests/`), erste Unit-Tests für dice_service/field_service.
- GitHub Actions/CI Pipeline definieren (lint, type, test).
