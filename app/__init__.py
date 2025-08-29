from flask import Flask, g
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_wtf.csrf import CSRFProtect
from config import Config
import os

db = SQLAlchemy()
login_manager = LoginManager()
migrate = Migrate()
csrf = CSRFProtect()

# login_manager.login_view = 'admin.login' # Setzen wir spezifischer pro Blueprint
# login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id_with_prefix): # user_id kommt jetzt als String mit Präfix
    from app.models import Admin, Team
    
    if user_id_with_prefix.startswith('admin_'):
        admin_id = int(user_id_with_prefix.split('_')[1])
        return Admin.query.get(admin_id)
    elif user_id_with_prefix.startswith('team_'):
        team_id = int(user_id_with_prefix.split('_')[1])
        return Team.query.get(team_id)
    return None

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # Erhöhe die maximale Request-Größe für Base64-Bilder
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB

    db.init_app(app)
    login_manager.init_app(app)
    migrate.init_app(app, db)
    csrf.init_app(app)

    # Setze die Login-Views für die Blueprints
    # Dies ist der Ort, an den Benutzer weitergeleitet werden, wenn @login_required fehlschlägt
    login_manager.login_view = "main.index" # Eine allgemeine Fallback-Seite, oder spezifischer
    login_manager.blueprint_login_views = {
        'admin': 'admin.login',
        'teams': 'teams.team_login',
    }
    login_manager.login_message_category = 'info'
    login_manager.login_message = None  # Disable automatic login messages


    from app.main.routes import main_bp
    app.register_blueprint(main_bp)

    from app.admin.routes import admin_bp
    app.register_blueprint(admin_bp)

    from app.teams.routes import teams_bp
    app.register_blueprint(teams_bp)

    @app.context_processor
    def inject_now_year_and_user_type():
        from datetime import datetime
        from flask_login import current_user
        from app.models import Admin as AdminModel, Team as TeamModel

        user_type_in_context = None
        if current_user.is_authenticated:
            if isinstance(current_user, AdminModel):
                user_type_in_context = 'admin'
            elif isinstance(current_user, TeamModel):
                user_type_in_context = 'team'
        return {'now_year': datetime.utcnow().year, 'user_type_in_context': user_type_in_context}

    @app.template_filter('is_admin')
    def is_admin_filter(user):
        from app.models import Admin as AdminModel
        return isinstance(user, AdminModel)

    @app.template_filter('is_team')
    def is_team_filter(user):
        from app.models import Team as TeamModel
        return isinstance(user, TeamModel)
        
    with app.app_context():
        from app import models 

    return app
