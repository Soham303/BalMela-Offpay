import os
from pathlib import Path
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from backend.config import Config, DevelopmentConfig, ProductionConfig, TestingConfig
from backend.database import init_db, db_session

def create_app(config_class=None):
    if config_class is None:
        env = os.getenv("FLASK_ENV", "development").lower()
        if env == "production":
            config_class = ProductionConfig
        elif env == "testing":
            config_class = TestingConfig
        else:
            config_class = DevelopmentConfig

    app = Flask(__name__, static_folder="../frontend/dist", static_url_path="")
    app.config.from_object(config_class)

    # Initialize Database
    init_db(app.config["SQLALCHEMY_DATABASE_URI"])

    # CORS setup: allows React dev server and any tunnel origin
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # Register Blueprints
    from backend.routes.auth_routes import auth_bp
    from backend.routes.counter_routes import counter_bp
    from backend.routes.system_routes import system_bp
    from backend.routes.stall_routes import stall_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(counter_bp)
    app.register_blueprint(system_bp)
    app.register_blueprint(stall_bp)

    # Database Session Teardown
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        if db_session is not None:
            db_session.remove()

    # Health check endpoint
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({
            "status": "healthy",
            "service": "FestToken Backend",
            "version": "1.0",
        }), 200

    # Serve React SPA in production if built
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
        if path != "" and (static_dir / path).exists():
            return send_from_directory(str(static_dir), path)
        elif (static_dir / "index.html").exists():
            return send_from_directory(str(static_dir), "index.html")
        else:
            return jsonify({
                "message": "FestToken API Server. Frontend dist not found. Run 'npm run dev' or 'npm run build' in frontend/.",
                "endpoints": {
                    "health": "/api/health",
                    "auth": "/api/auth/login",
                }
            })

    # Global Error Handlers (failsafe: no raw exception leaks to client)
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error occurred. Please contact the administrator."}), 500

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)
