from flask import Blueprint, request, jsonify, g
from sqlalchemy import or_
from backend.middleware.auth_middleware import token_required
from backend.services.issuance_service import (
    issue_token_pass, 
    void_issuance,
    lookup_pass_details,
    topup_token_pass,
    get_cashier_summary,
)
from backend.database import get_db
from backend.models import Issuance, TokenPass

counter_bp = Blueprint("counter", __name__, url_prefix="/api/counter")

@counter_bp.route("/issue", methods=["POST"])
@token_required(allowed_roles=["cashier", "admin"])
def issue_pass():
    data = request.get_json(silent=True) or {}
    cash_received = data.get("cash_received")
    token_value = data.get("token_value")
    attendee_name = data.get("attendee_name")

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
            attendee_name=attendee_name,
        )
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to issue token pass: {str(e)}"}), 500

@counter_bp.route("/lookup", methods=["POST"])
@token_required(allowed_roles=["cashier", "admin", "auditor"])
def lookup_pass():
    data = request.get_json(silent=True) or {}
    pass_identifier = data.get("pass_identifier") or data.get("qr_data") or data.get("public_pass_id")
    if not pass_identifier:
        return jsonify({"error": "Pass code, QR data, or ID is required"}), 400

    try:
        details = lookup_pass_details(pass_identifier)
        return jsonify(details), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Lookup failed: {str(e)}"}), 500

@counter_bp.route("/topup", methods=["POST"])
@token_required(allowed_roles=["cashier", "admin"])
def topup_pass():
    data = request.get_json(silent=True) or {}
    pass_identifier = data.get("pass_identifier") or data.get("qr_data") or data.get("public_pass_id")
    cash_received = data.get("cash_received")
    token_value = data.get("token_value")

    if not pass_identifier:
        return jsonify({"error": "Pass identifier is required"}), 400
    if cash_received is None and token_value is None:
        return jsonify({"error": "Cash received or token value is required"}), 400

    try:
        cash_val = float(cash_received) if cash_received is not None else 0.0
        tok_val = int(token_value) if token_value is not None else None
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid numerical values"}), 400

    try:
        result = topup_token_pass(
            pass_identifier=pass_identifier,
            cashier_id=g.current_user.id,
            cash_received=cash_val,
            token_value=tok_val,
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Top-up failed: {str(e)}"}), 500

@counter_bp.route("/summary", methods=["GET"])
@token_required(allowed_roles=["cashier", "admin", "auditor"])
def cashier_summary():
    cashier_id = g.current_user.id if g.current_user.role == "cashier" else None
    summary = get_cashier_summary(cashier_id=cashier_id)
    return jsonify(summary), 200

@counter_bp.route("/search", methods=["GET"])
@token_required(allowed_roles=["cashier", "admin", "auditor"])
def search_passes():
    query_str = request.args.get("q", "").strip()
    if not query_str:
        return jsonify({"passes": []}), 200

    session = get_db()
    # Search by attendee_name or public_pass_id (case insensitive)
    matches = (
        session.query(TokenPass)
        .filter(
            or_(
                TokenPass.attendee_name.ilike(f"%{query_str}%"),
                TokenPass.public_pass_id.ilike(f"%{query_str}%"),
            )
        )
        .order_by(TokenPass.created_at.desc())
        .limit(20)
        .all()
    )

    return jsonify({"passes": [p.to_dict() for p in matches]}), 200

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

