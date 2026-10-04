Was muss verbessert werden
--------------------------
- Dev/Prod-Konfigurationen vermischt; Flask Dev-Server im Docker CMD.
- Keine klare Migrations-/Backup-Strategie in Pipelines.

Wie wird es gemacht
-------------------
- Prod-Server (gunicorn/uwsgi) + Reverse Proxy (nginx) für Produktion.
- Multi-Stage Dockerfile, getrennte compose Profile (dev/prod/test).
- Migrationsschritt in Entrypoint/CI (alembic upgrade head).
- Backup/Restore-Skripte (DB und `spielstaende`) dokumentiert und automatisierbar.

ToDos
-----
- Dockerfile (prod) + docker-compose.prod.yml erstellen.
- Healthchecks/Readiness, Logging-Rotation, Metrics (optional).
