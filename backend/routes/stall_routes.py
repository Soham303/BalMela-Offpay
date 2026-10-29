from flask import Blueprint, request, jsonify, g
from sqlalchemy import func
from backend.middleware.auth_middleware import token_required
from backend.services.redemption_service import inspect_token_pass, process_redemption
from backend.database import get_db
from backend.models import Redemption, Stall

stall_bp = Blueprint("stall", __name__, url_prefix="/api/stall")

def get_target_stall_id(requested_stall_id=None):
    user = g.current_user
    if user.role == "stall_operator":
        if not user.stall_id:
            raise ValueError("Stall operator is not assigned to any active stall.")
        return user.stall_id
    elif user.role in ["admin", "auditor"]:
        if requested_stall_id:
            return int(requested_stall_id)
        elif user.stall_id:
            return user.stall_id
        raise ValueError("Please specify stall_id for administrative inspection/redemption.")
    else:
        raise ValueError("Unauthorized role for stall operations.")

@stall_bp.route("/inspect", methods=["POST"])
@token_required(allowed_roles=["stall_operator", "admin"])
def inspect_pass():
    data = request.get_json(silent=True) or {}
    qr_data = data.get("qr_data")
    public_pass_id = data.get("public_pass_id")
    secret = data.get("secret")

    try:
        result = inspect_token_pass(
            qr_data=qr_data,
            public_pass_id=public_pass_id,
            secret=secret,
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"valid": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"valid": False, "error": f"Failed to inspect pass: {str(e)}"}), 500

@stall_bp.route("/redeem", methods=["POST"])
@token_required(allowed_roles=["stall_operator", "admin"])
def redeem_tokens():
    data = request.get_json(silent=True) or {}
    amount = data.get("amount")
    idempotency_key = data.get("idempotency_key")
    qr_data = data.get("qr_data")
    public_pass_id = data.get("public_pass_id")
    secret = data.get("secret")
    requested_stall_id = data.get("stall_id")

    try:
        stall_id = get_target_stall_id(requested_stall_id)
        amount_int = int(amount)
    except (ValueError, TypeError) as e:
        return jsonify({"error": str(e)}), 400

    try:
        result = process_redemption(
            operator_id=g.current_user.id,
            stall_id=stall_id,
            amount=amount_int,
            idempotency_key=idempotency_key,
            qr_data=qr_data,
            public_pass_id=public_pass_id,
            secret=secret,
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Redemption failed: {str(e)}"}), 500

@stall_bp.route("/summary", methods=["GET"])
@token_required(allowed_roles=["stall_operator", "admin", "auditor"])
def stall_summary():
    requested_stall_id = request.args.get("stall_id")
    try:
        stall_id = get_target_stall_id(requested_stall_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    session = get_db()
    stall = session.query(Stall).filter_by(id=stall_id).first()
    if not stall:
        return jsonify({"error": "Stall not found"}), 404

    # Calculate total gross tokens collected for this stall
    stats = (
        session.query(
            func.coalesce(func.sum(Redemption.amount), 0).label("total_tokens"),
            func.count(Redemption.id).label("total_transactions"),
        )
        .filter(Redemption.stall_id == stall_id, Redemption.status == "completed")
        .first()
    )

    return jsonify({
        "stall": stall.to_dict(),
        "total_tokens_collected": int(stats.total_tokens),
        "transaction_count": int(stats.total_transactions),
    }), 200

@stall_bp.route("/transactions", methods=["GET"])
@token_required(allowed_roles=["stall_operator", "admin", "auditor"])
def stall_transactions():
    requested_stall_id = request.args.get("stall_id")
    try:
        stall_id = get_target_stall_id(requested_stall_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    session = get_db()
    limit = min(int(request.args.get("limit", 50)), 200)
    offset = int(request.args.get("offset", 0))

    query = session.query(Redemption).filter_by(stall_id=stall_id)
    total_count = query.count()
    records = query.order_by(Redemption.created_at.desc()).offset(offset).limit(limit).all()

    return jsonify({
        "stall_id": stall_id,
        "total": total_count,
        "offset": offset,
        "limit": limit,
        "transactions": [r.to_dict() for r in records],
    }), 200
