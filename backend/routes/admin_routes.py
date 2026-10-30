import csv
import io
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g, Response
from sqlalchemy import or_
from backend.middleware.auth_middleware import token_required
from backend.services.reconciliation_service import get_financial_reconciliation
from backend.services.backup_service import create_database_backup, list_backups
from backend.services.auth_service import hash_password
from backend.services.audit_service import log_audit
from backend.database import get_db
from backend.models import (
    User,
    Stall,
    TokenPass,
    Issuance,
    Redemption,
    Adjustment,
    AuditLog,
    SystemConfig,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

@admin_bp.route("/dashboard", methods=["GET"])
@token_required(allowed_roles=["admin", "auditor"])
def dashboard():
    reconciliation = get_financial_reconciliation()
    session = get_db()
    config = session.query(SystemConfig).filter_by(id=1).first()

    # Get recent audit logs
    recent_audits = (
        session.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(15)
        .all()
    )

    return jsonify({
        "reconciliation": reconciliation["summary"],
        "stall_summaries": reconciliation["stall_summaries"],
        "config": config.to_dict() if config else None,
        "recent_audits": [a.to_dict() for a in recent_audits],
    }), 200

@admin_bp.route("/transactions", methods=["GET"])
@token_required(allowed_roles=["admin", "auditor"])
def list_transactions():
    session = get_db()
    txn_type = request.args.get("type", "all")  # 'all', 'issuance', 'redemption'
    stall_id = request.args.get("stall_id")
    limit = min(int(request.args.get("limit", 50)), 200)
    offset = int(request.args.get("offset", 0))
    search = request.args.get("search", "").strip()

    items = []

    # Query issuances
    if txn_type in ["all", "issuance"]:
        iss_query = session.query(Issuance)
        if search:
            iss_query = iss_query.join(TokenPass).filter(
                or_(
                    TokenPass.public_pass_id.ilike(f"%{search}%"),
                    Issuance.id.ilike(f"%{search}%"),
                )
            )
        for iss in iss_query.order_by(Issuance.created_at.desc()).limit(limit).all():
            items.append({
                "type": "issuance",
                "id": iss.id,
                "reference": f"ISS-{iss.id}",
                "public_pass_id": iss.token_pass.public_pass_id if iss.token_pass else None,
                "cash_amount": float(iss.cash_received),
                "token_amount": iss.token_value_issued,
                "conversion_rate": float(iss.conversion_rate),
                "actor_username": iss.cashier.username if iss.cashier else None,
                "stall_name": None,
                "stall_code": None,
                "status": iss.status,
                "created_at": iss.created_at.isoformat() if iss.created_at else None,
            })

    # Query redemptions
    if txn_type in ["all", "redemption"]:
        red_query = session.query(Redemption)
        if stall_id:
            red_query = red_query.filter(Redemption.stall_id == int(stall_id))
        if search:
            red_query = red_query.join(TokenPass).filter(
                or_(
                    TokenPass.public_pass_id.ilike(f"%{search}%"),
                    Redemption.idempotency_key.ilike(f"%{search}%"),
                    Redemption.id.ilike(f"%{search}%"),
                )
            )
        for red in red_query.order_by(Redemption.created_at.desc()).limit(limit).all():
            items.append({
                "type": "redemption",
                "id": red.id,
                "reference": f"RED-{red.id}",
                "public_pass_id": red.token_pass.public_pass_id if red.token_pass else None,
                "cash_amount": None,
                "token_amount": red.amount,
                "conversion_rate": None,
                "actor_username": red.operator.username if red.operator else None,
                "stall_name": red.stall.name if red.stall else None,
                "stall_code": red.stall.stall_code if red.stall else None,
                "status": red.status,
                "created_at": red.created_at.isoformat() if red.created_at else None,
            })

    # Sort combined items by created_at descending
    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    paginated = items[offset : offset + limit]

    return jsonify({
        "total": len(items),
        "offset": offset,
        "limit": limit,
        "transactions": paginated,
    }), 200

@admin_bp.route("/export/transactions", methods=["GET"])
@token_required(allowed_roles=["admin", "auditor"])
def export_transactions_csv():
    session = get_db()
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Transaction Type",
        "Reference ID",
        "Public Pass ID",
        "Stall Code",
        "Stall Name",
        "Cash Amount",
        "Token Amount",
        "Actor (Cashier/Operator)",
        "Status",
        "Timestamp (UTC)",
    ])

    # 1. Issuances
    issuances = session.query(Issuance).order_by(Issuance.created_at.asc()).all()
    for iss in issuances:
        writer.writerow([
            "Issuance",
            f"ISS-{iss.id}",
            iss.token_pass.public_pass_id if iss.token_pass else "",
            "",
            "",
            float(iss.cash_received),
            iss.token_value_issued,
            iss.cashier.username if iss.cashier else "",
            iss.status,
            iss.created_at.isoformat() if iss.created_at else "",
        ])

    # 2. Redemptions
    redemptions = session.query(Redemption).order_by(Redemption.created_at.asc()).all()
    for red in redemptions:
        writer.writerow([
            "Redemption",
            f"RED-{red.id}",
            red.token_pass.public_pass_id if red.token_pass else "",
            red.stall.stall_code if red.stall else "",
            red.stall.name if red.stall else "",
            "",
            red.amount,
            red.operator.username if red.operator else "",
            red.status,
            red.created_at.isoformat() if red.created_at else "",
        ])

    csv_data = output.getvalue()
    filename = f"festtoken_transactions_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@admin_bp.route("/export/settlement", methods=["GET"])
@token_required(allowed_roles=["admin", "auditor"])
def export_settlement_csv():
    reconciliation = get_financial_reconciliation()
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Stall Code",
        "Stall Name",
        "Gross Tokens Redeemed",
        "Deductions & Adjustments",
        "Net Payable Tokens",
        "Net Payable Cash",
        "Status",
    ])

    for s in reconciliation["stall_summaries"]:
        writer.writerow([
            s["stall_code"],
            s["name"],
            s["gross_tokens_collected"],
            s["adjustments_deducted"],
            s["net_payable_tokens"],
            s["net_payable_cash"],
            "Active" if s["is_active"] else "Inactive",
        ])

    csv_data = output.getvalue()
    filename = f"festtoken_stall_settlement_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@admin_bp.route("/adjustments", methods=["POST"])
@token_required(allowed_roles=["admin"])
def create_adjustment():
    data = request.get_json(silent=True) or {}
    stall_id = data.get("stall_id")
    adjustment_type = data.get("adjustment_type", "manual_adjustment")
    amount = data.get("amount")
    reason = data.get("reason", "").strip()

    if not reason:
        return jsonify({"error": "Reason is required for an adjustment"}), 400
    if amount is None:
        return jsonify({"error": "Amount is required"}), 400

    try:
        amount_int = int(amount)
        stall_id_int = int(stall_id) if stall_id is not None else None
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid numerical parameters"}), 400

    session = get_db()
    adj = Adjustment(
        reference_transaction_id=data.get("reference_transaction_id"),
        stall_id=stall_id_int,
        adjustment_type=adjustment_type,
        amount=amount_int,
        reason=reason,
        approved_by=g.current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(adj)
    session.commit()

    log_audit(
        action="CREATE_ADJUSTMENT",
        entity_type="ADJUSTMENT",
        actor_id=g.current_user.id,
        entity_id=adj.id,
        metadata=adj.to_dict(),
    )

    return jsonify({
        "message": "Adjustment recorded successfully",
        "adjustment": adj.to_dict(),
    }), 201

@admin_bp.route("/stalls", methods=["GET"])
@token_required(allowed_roles=["admin", "auditor"])
def list_stalls():
    session = get_db()
    stalls = session.query(Stall).order_by(Stall.stall_code.asc()).all()
    results = []
    for s in stalls:
        d = s.to_dict()
        d["operators"] = [u.username for u in s.operators]
        results.append(d)
    return jsonify({"stalls": results}), 200

@admin_bp.route("/stalls", methods=["POST"])
@token_required(allowed_roles=["admin"])
def create_stall():
    data = request.get_json(silent=True) or {}
    stall_code = data.get("stall_code", "").strip().upper()
    name = data.get("name", "").strip()

    if not stall_code or not name:
        return jsonify({"error": "stall_code and name are required"}), 400

    session = get_db()
    if session.query(Stall).filter_by(stall_code=stall_code).first():
        return jsonify({"error": f"Stall with code '{stall_code}' already exists"}), 400

    stall = Stall(stall_code=stall_code, name=name, is_active=True)
    session.add(stall)
    session.commit()

    log_audit(
        action="CREATE_STALL",
        entity_type="STALL",
        actor_id=g.current_user.id,
        entity_id=stall.id,
        metadata={"stall_code": stall_code, "name": name},
    )

    return jsonify({"message": "Stall created", "stall": stall.to_dict()}), 201

@admin_bp.route("/stalls/<int:stall_id>", methods=["PUT"])
@token_required(allowed_roles=["admin"])
def update_stall(stall_id):
    session = get_db()
    stall = session.query(Stall).filter_by(id=stall_id).first()
    if not stall:
        return jsonify({"error": "Stall not found"}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data and data["name"].strip():
        stall.name = data["name"].strip()
    if "is_active" in data:
        stall.is_active = bool(data["is_active"])

    session.commit()

    log_audit(
        action="UPDATE_STALL",
        entity_type="STALL",
        actor_id=g.current_user.id,
        entity_id=stall.id,
        metadata=stall.to_dict(),
    )

    return jsonify({"message": "Stall updated", "stall": stall.to_dict()}), 200

@admin_bp.route("/users", methods=["GET"])
@token_required(allowed_roles=["admin", "auditor"])
def list_users():
    session = get_db()
    users = session.query(User).order_by(User.id.asc()).all()
    return jsonify({"users": [u.to_dict() for u in users]}), 200

@admin_bp.route("/users", methods=["POST"])
@token_required(allowed_roles=["admin"])
def create_user():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    role = data.get("role", "stall_operator")
    stall_id = data.get("stall_id")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    if role not in ["admin", "cashier", "stall_operator", "auditor"]:
        return jsonify({"error": "Invalid user role"}), 400

    session = get_db()
    if session.query(User).filter_by(username=username).first():
        return jsonify({"error": f"Username '{username}' already exists"}), 400

    stall_id_val = int(stall_id) if stall_id is not None and role == "stall_operator" else None

    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        stall_id=stall_id_val,
        is_active=True,
    )
    session.add(user)
    session.commit()

    log_audit(
        action="CREATE_USER",
        entity_type="USER",
        actor_id=g.current_user.id,
        entity_id=user.id,
        metadata={"username": username, "role": role, "stall_id": stall_id_val},
    )

    return jsonify({"message": "User created", "user": user.to_dict()}), 201

@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
@token_required(allowed_roles=["admin"])
def update_user(user_id):
    session = get_db()
    user = session.query(User).filter_by(id=user_id).first()
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
    if "password" in data and len(data["password"]) >= 6:
        user.password_hash = hash_password(data["password"])
    if "stall_id" in data and user.role == "stall_operator":
        user.stall_id = int(data["stall_id"]) if data["stall_id"] else None

    session.commit()

    log_audit(
        action="UPDATE_USER",
        entity_type="USER",
        actor_id=g.current_user.id,
        entity_id=user.id,
        metadata={"user_id": user_id, "is_active": user.is_active, "stall_id": user.stall_id},
    )

    return jsonify({"message": "User updated", "user": user.to_dict()}), 200

@admin_bp.route("/close-event", methods=["POST"])
@token_required(allowed_roles=["admin"])
def close_event():
    session = get_db()
    config = session.query(SystemConfig).filter_by(id=1).first()
    if not config:
        config = SystemConfig(id=1)
        session.add(config)

    config.event_status = "closed"
    session.commit()

    log_audit(
        action="CLOSE_EVENT",
        entity_type="SYSTEM",
        actor_id=g.current_user.id,
        entity_id="1",
        metadata={"status": "closed"},
    )

    return jsonify({
        "message": "Event financial ledger closed. New issuances and redemptions are now blocked.",
        "config": config.to_dict(),
    }), 200

@admin_bp.route("/open-event", methods=["POST"])
@token_required(allowed_roles=["admin"])
def open_event():
    session = get_db()
    config = session.query(SystemConfig).filter_by(id=1).first()
    if not config:
        config = SystemConfig(id=1)
        session.add(config)

    config.event_status = "active"
    session.commit()

    log_audit(
        action="OPEN_EVENT",
        entity_type="SYSTEM",
        actor_id=g.current_user.id,
        entity_id="1",
        metadata={"status": "active"},
    )

    return jsonify({
        "message": "Event is now OPEN. Token issuances and stall redemptions are active.",
        "config": config.to_dict(),
    }), 200

@admin_bp.route("/backup", methods=["POST"])
@token_required(allowed_roles=["admin"])
def trigger_backup():
    data = request.get_json(silent=True) or {}
    note = data.get("note", "Manual admin backup")
    result = create_database_backup(actor_id=g.current_user.id, note=note)
    return jsonify(result), 200

@admin_bp.route("/backups", methods=["GET"])
@token_required(allowed_roles=["admin", "auditor"])
def get_backups():
    backups = list_backups()
    return jsonify({"backups": backups}), 200

@admin_bp.route("/audit-logs", methods=["GET"])
@token_required(allowed_roles=["admin", "auditor"])
def list_audit_logs():
    session = get_db()
    limit = min(int(request.args.get("limit", 50)), 200)
    offset = int(request.args.get("offset", 0))

    query = session.query(AuditLog).order_by(AuditLog.created_at.desc())
    total = query.count()
    records = query.offset(offset).limit(limit).all()

    return jsonify({
        "total": total,
        "offset": offset,
        "limit": limit,
        "logs": [r.to_dict() for r in records],
    }), 200
