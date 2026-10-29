from flask import Blueprint, request, jsonify, g
from backend.services.auth_service import (
    authenticate_user,
    generate_jwt_token,
    hash_password,
    check_password,
)
from backend.services.audit_service import log_audit
from backend.middleware.rate_limiter import login_limiter
from backend.middleware.auth_middleware import token_required
from backend.database import get_db

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    limiter_key = f"{client_ip}:{username}"

    if login_limiter.is_rate_limited(limiter_key):
        return jsonify({
            "error": "Too many failed login attempts. Please wait 60 seconds before retrying."
        }), 429

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = authenticate_user(username, password)
    if not user:
        login_limiter.record_failure(limiter_key)
        log_audit(
            action="LOGIN_FAILED",
            entity_type="USER",
            metadata={"username": username, "ip": client_ip},
        )
        return jsonify({"error": "Invalid username or password"}), 401

    login_limiter.record_success(limiter_key)
    token = generate_jwt_token(user)

    log_audit(
        action="LOGIN_SUCCESS",
        entity_type="USER",
        actor_id=user.id,
        entity_id=user.id,
        metadata={"username": user.username, "role": user.role, "ip": client_ip},
    )

    return jsonify({
        "message": "Login successful",
        "token": token,
        "user": user.to_dict(),
    }), 200

@auth_bp.route("/me", methods=["GET"])
@token_required()
def get_current_user():
    user = g.current_user
    return jsonify({
        "user": user.to_dict(),
    }), 200

@auth_bp.route("/logout", methods=["POST"])
@token_required()
def logout():
    user = g.current_user
    log_audit(
        action="LOGOUT",
        entity_type="USER",
        actor_id=user.id,
        entity_id=user.id,
    )
    return jsonify({"message": "Logged out successfully"}), 200

@auth_bp.route("/change-password", methods=["POST"])
@token_required()
def change_password():
    data = request.get_json(silent=True) or {}
    old_password = data.get("old_password", "")
    new_password = data.get("new_password", "")

    if not new_password or len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    user = g.current_user
    if not check_password(old_password, user.password_hash):
        return jsonify({"error": "Current password is incorrect"}), 400

    session = get_db()
    user.password_hash = hash_password(new_password)
    session.commit()

    log_audit(
        action="PASSWORD_CHANGED",
        entity_type="USER",
        actor_id=user.id,
        entity_id=user.id,
    )

    return jsonify({"message": "Password changed successfully"}), 200
