from functools import wraps
from flask import request, jsonify, g
from backend.services.auth_service import decode_jwt_token
from backend.database import get_db
from backend.models import User

def token_required(allowed_roles=None):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                return jsonify({"error": "Missing or invalid authorization header"}), 401

            token = auth_header.split(" ")[1].strip()
            payload = decode_jwt_token(token)
            if not payload:
                return jsonify({"error": "Token is invalid or has expired"}), 401

            session = get_db()
            user_id = payload.get("sub")
            try:
                user_id = int(user_id)
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid token subject"}), 401

            user = session.query(User).filter_by(id=user_id).first()
            if not user or not user.is_active:
                return jsonify({"error": "Account is deactivated or does not exist"}), 401

            if allowed_roles and user.role not in allowed_roles:
                return jsonify({"error": "Forbidden: insufficient permissions"}), 403

            g.current_user = user
            g.token_payload = payload
            return f(*args, **kwargs)

        return decorated_function
    return decorator
