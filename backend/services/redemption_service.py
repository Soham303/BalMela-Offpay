from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError
from backend.database import get_db
from backend.models import TokenPass, Redemption, Stall, SystemConfig
from backend.services.pass_service import parse_qr_payload, hash_secret
from backend.services.audit_service import log_audit

def inspect_token_pass(qr_data: str = None, public_pass_id: str = None, secret: str = None):
    if qr_data:
        parsed_id, parsed_secret = parse_qr_payload(qr_data)
        if not parsed_id or not parsed_secret:
            raise ValueError("Invalid QR code format. Expected 'FEST:<pass_id>:<secret>'.")
        public_pass_id, secret = parsed_id, parsed_secret

    if not public_pass_id or not secret:
        raise ValueError("Public pass ID and secret credential are required.")

    session = get_db()
    cred_hash = hash_secret(secret)

    pass_obj = session.query(TokenPass).filter_by(
        public_pass_id=public_pass_id.strip(),
        credential_hash=cred_hash,
    ).first()

    if not pass_obj:
        raise ValueError("Invalid pass credential or pass does not exist.")

    if pass_obj.status != "active":
        return {
            "valid": False,
            "public_pass_id": pass_obj.public_pass_id,
            "status": pass_obj.status,
            "remaining_value": pass_obj.remaining_value,
            "issued_value": pass_obj.issued_value,
            "message": f"Pass is {pass_obj.status} and cannot be redeemed.",
        }

    return {
        "valid": True,
        "public_pass_id": pass_obj.public_pass_id,
        "status": pass_obj.status,
        "remaining_value": pass_obj.remaining_value,
        "issued_value": pass_obj.issued_value,
        "message": "Pass is active with valid balance.",
    }

def process_redemption(
    operator_id: int,
    stall_id: int,
    amount: int,
    idempotency_key: str,
    qr_data: str = None,
    public_pass_id: str = None,
    secret: str = None,
):
    if not idempotency_key or not idempotency_key.strip():
        raise ValueError("Idempotency key is required to prevent duplicate charges.")
    idempotency_key = idempotency_key.strip()

    if not amount or amount <= 0:
        raise ValueError("Redemption amount must be a positive integer.")

    session = get_db()

    # 1. Check idempotency: If this key has already been processed, return original committed result
    existing = session.query(Redemption).filter_by(idempotency_key=idempotency_key).first()
    if existing:
        return {
            "message": "Transaction already processed (idempotent result)",
            "transaction": existing.to_dict(),
            "remaining_value": existing.token_pass.remaining_value,
            "is_duplicate_retry": True,
        }

    # 2. Check event status
    config = session.query(SystemConfig).filter_by(id=1).first()
    if config and config.event_status == "closed":
        raise ValueError("Event is closed. Token redemptions are disabled.")

    # 3. Validate Stall
    stall = session.query(Stall).filter_by(id=stall_id, is_active=True).first()
    if not stall:
        raise ValueError("Assigned stall not found or is currently inactive.")

    # 4. Resolve pass credentials
    if qr_data:
        parsed_id, parsed_secret = parse_qr_payload(qr_data)
        if not parsed_id or not parsed_secret:
            raise ValueError("Invalid QR code format.")
        public_pass_id, secret = parsed_id, parsed_secret

    if not public_pass_id or not secret:
        raise ValueError("Public pass ID and secret credential are required.")

    cred_hash = hash_secret(secret)

    # 5. Check pass exists and is active
    pass_obj = (
        session.query(TokenPass)
        .filter_by(public_pass_id=public_pass_id.strip(), credential_hash=cred_hash)
        .with_for_update()
        .first()
    )

    if not pass_obj:
        raise ValueError("Invalid pass credential or pass does not exist.")

    if pass_obj.status != "active":
        raise ValueError(f"Pass cannot be redeemed because its status is '{pass_obj.status}'.")

    # 6. Atomic conditional update: guarantees concurrent double-spending cannot occur
    rows_updated = (
        session.query(TokenPass)
        .filter(
            TokenPass.id == pass_obj.id,
            TokenPass.status == "active",
            TokenPass.remaining_value >= amount,
        )
        .update(
            {TokenPass.remaining_value: TokenPass.remaining_value - amount},
            synchronize_session="fetch",
        )
    )

    if rows_updated == 0:
        session.refresh(pass_obj)
        raise ValueError(
            f"Insufficient token balance. Requested: {amount}, Available: {pass_obj.remaining_value}."
        )

    if pass_obj.remaining_value == 0:
        pass_obj.status = "exhausted"

    # 7. Record redemption in stall's separate ledger
    redemption = Redemption(
        token_pass_id=pass_obj.id,
        stall_id=stall_id,
        operator_id=operator_id,
        amount=amount,
        idempotency_key=idempotency_key,
        status="completed",
        created_at=datetime.now(timezone.utc),
    )
    session.add(redemption)
    session.flush()

    # 8. Record audit log in the SAME atomic transaction
    log_audit(
        action="REDEEM_TOKEN",
        entity_type="REDEMPTION",
        actor_id=operator_id,
        entity_id=redemption.id,
        metadata={
            "stall_id": stall_id,
            "stall_code": stall.stall_code,
            "amount": amount,
            "pass_id": pass_obj.public_pass_id,
            "remaining_value": pass_obj.remaining_value,
            "idempotency_key": idempotency_key,
        },
        session=session,
        commit=False,
    )

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        # Another concurrent request used the same idempotency key
        duplicate = session.query(Redemption).filter_by(idempotency_key=idempotency_key).first()
        if duplicate:
            return {
                "message": "Transaction already processed (idempotent result)",
                "transaction": duplicate.to_dict(),
                "remaining_value": duplicate.token_pass.remaining_value,
                "is_duplicate_retry": True,
            }
        raise ValueError("Integrity error processing redemption.")

    return {
        "message": "Redemption successful",
        "transaction": redemption.to_dict(),
        "remaining_value": pass_obj.remaining_value,
        "is_duplicate_retry": False,
    }
