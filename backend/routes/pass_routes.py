from flask import Blueprint, request, jsonify
from backend.database import get_db
from backend.models import TokenPass, Redemption, Stall
from backend.services.pass_service import parse_qr_payload, hash_secret

pass_bp = Blueprint("pass", __name__, url_prefix="/api/pass")

@pass_bp.route("/view", methods=["POST"])
def view_pass():
    data = request.get_json(silent=True) or {}
    qr_data = data.get("qr_data")
    public_pass_id = data.get("public_pass_id")
    secret = data.get("secret")

    if qr_data:
        parsed_id, parsed_secret = parse_qr_payload(qr_data)
        if parsed_id and parsed_secret:
            public_pass_id, secret = parsed_id, parsed_secret

    if not public_pass_id or not secret:
        return jsonify({"error": "Pass ID and secret credential are required"}), 400

    session = get_db()
    cred_hash = hash_secret(secret)

    pass_obj = session.query(TokenPass).filter_by(
        public_pass_id=public_pass_id.strip(),
        credential_hash=cred_hash,
    ).first()

    if not pass_obj:
        return jsonify({"error": "Token pass not found or invalid credential"}), 404

    # Fetch transactions for this pass
    txns = (
        session.query(Redemption)
        .filter_by(token_pass_id=pass_obj.id)
        .order_by(Redemption.created_at.desc())
        .all()
    )

    transactions_list = []
    for t in txns:
        transactions_list.append({
            "id": t.id,
            "reference": f"RED-{t.id}",
            "stall_name": t.stall.name if t.stall else "Festival Stall",
            "stall_code": t.stall.stall_code if t.stall else "STALL",
            "amount": t.amount,
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return jsonify({
        "public_pass_id": pass_obj.public_pass_id,
        "attendee_name": pass_obj.attendee_name,
        "issued_value": pass_obj.issued_value,
        "remaining_value": pass_obj.remaining_value,
        "status": pass_obj.status,
        "created_at": pass_obj.created_at.isoformat() if pass_obj.created_at else None,
        "transactions": transactions_list,
    }), 200
