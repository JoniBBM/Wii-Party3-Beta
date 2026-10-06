import getpass
import os

from app import create_app, db
from app.models import Admin

# Passwort nie im Code: aus ADMIN_PASSWORD (Umgebung/.env) oder interaktiv abfragen
password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Neues Admin-Passwort: ")
if len(password) < 8:
    raise SystemExit("Passwort zu kurz (mindestens 8 Zeichen)")

app = create_app()
with app.app_context():
    # Prüfen ob Admin existiert
    admin = Admin.query.filter_by(username="admin").first()
    
    if not admin:
        # Admin-Benutzer erstellen
        admin = Admin(username="admin")
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        print("✅ Admin-Benutzer erfolgreich erstellt!")
    else:
        print("⚠️ Admin-Benutzer existiert bereits!")
