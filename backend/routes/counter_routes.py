from flask import Blueprint, request, jsonify, g
from backend.middleware.auth_middleware import token_required
from backend.services.issuance_service import issue_token_pass, void_issuance
from backend.database import get_db
from backend.models import Issuance

counter_bp = Blueprint("counter", __name__, url_prefix="/api/counter")

@counter_bp.route("/issue", methods=["POST"])
@token_required(allowed_roles=["cashier", "admin"])
def issue_pass():
    data = request.get_json(silent=True) or {}
    cash_received = data.get("cash_received")
    token_value = data.get("token_value")

    if cash_received is None and token_value is None:
        return jsonify({"error": "Either cash_received or token_value is required"}), 400

    try:
        cash_val = float(cash_received) if cash_received is not None else 0.0
        tok_val = int(token_value) if token_value is not None else None
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid numerical values provided"}), 400

    try:
        result = issue_token_pass(
            cashier_id=g.current_user.id,
            cash_received=cash_val,
            token_value=tok_val,
        )
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to issue token pass: {str(e)}"}), 500

@counter_bp.route("/issuances", methods=["GET"])
@token_required(allowed_roles=["cashier", "admin", "auditor"])
def list_issuances():
    session = get_db()
    limit = min(int(request.args.get("limit", 50)), 200)
    offset = int(request.args.get("offset", 0))

    query = session.query(Issuance)
    # If cashier, allow seeing their own issuances, or if admin/auditor see all
    if g.current_user.role == "cashier":
        query = query.filter_by(cashier_id=g.current_user.id)

    total_count = query.count()
    records = query.order_by(Issuance.created_at.desc()).offset(offset).limit(limit).all()

    return jsonify({
        "total": total_count,
        "offset": offset,
        "limit": limit,
        "issuances": [r.to_dict() for r in records],
    }), 200

@counter_bp.route("/void/<int:issuance_id>", methods=["POST"])
@token_required(allowed_roles=["cashier", "admin"])
def void_pass(issuance_id):
    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "Operator requested void")

    try:
        result = void_issuance(issuance_id, user_id=g.current_user.id, reason=reason)
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to void issuance: {str(e)}"}), 500
