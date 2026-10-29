from flask import Blueprint, request, jsonify, g
from decimal import Decimal
from datetime import datetime, timezone
from backend.middleware.auth_middleware import token_required
from backend.services.audit_service import log_audit
from backend.database import get_db
from backend.models import SystemConfig

system_bp = Blueprint("system", __name__, url_prefix="/api")

@system_bp.route("/config", methods=["GET"])
def get_config():
    session = get_db()
    config = session.query(SystemConfig).filter_by(id=1).first()
    if not config:
        config = SystemConfig(id=1)
        session.add(config)
        session.commit()
    return jsonify(config.to_dict()), 200

@system_bp.route("/config", methods=["PUT"])
@token_required(allowed_roles=["admin"])
def update_config():
    session = get_db()
    config = session.query(SystemConfig).filter_by(id=1).first()
    if not config:
        config = SystemConfig(id=1)
        session.add(config)
        session.commit()

    data = request.get_json(silent=True) or {}
    new_event_name = data.get("event_name")
    new_rate = data.get("cash_to_token_rate")
    new_denominations = data.get("allowed_denominations")
    allow_new_rate_version = data.get("allow_new_rate_version", False)

    if new_event_name:
        config.event_name = str(new_event_name).strip()

    if new_denominations:
        if isinstance(new_denominations, list):
            config.allowed_denominations = ",".join(str(int(x)) for x in new_denominations)
        elif isinstance(new_denominations, str):
            config.allowed_denominations = new_denominations

    if new_rate is not None:
        try:
            rate_dec = Decimal(str(new_rate))
            if rate_dec <= 0:
                return jsonify({"error": "Conversion rate must be positive"}), 400
        except Exception:
            return jsonify({"error": "Invalid conversion rate format"}), 400

        # Enforce Section 2.3 business rule
        if config.issuance_started and rate_dec != config.cash_to_token_rate:
            if not allow_new_rate_version:
                return jsonify({
                    "error": "Issuance has already started with the current conversion rate. Changing it requires an explicit administrative rate version update (set allow_new_rate_version=true)."
                }), 400
            # Bump rate version
            config.rate_version += 1
            log_audit(
                action="RATE_VERSION_BUMP",
                entity_type="SYSTEM_CONFIG",
                actor_id=g.current_user.id,
                entity_id="1",
                metadata={
                    "old_rate": float(config.cash_to_token_rate),
                    "new_rate": float(rate_dec),
                    "new_rate_version": config.rate_version,
                },
            )

        config.cash_to_token_rate = rate_dec

    config.updated_at = datetime.now(timezone.utc)
    session.commit()

    log_audit(
        action="UPDATE_CONFIG",
        entity_type="SYSTEM_CONFIG",
        actor_id=g.current_user.id,
        entity_id="1",
        metadata=config.to_dict(),
    )

    return jsonify({
        "message": "System configuration updated successfully",
        "config": config.to_dict(),
    }), 200
