from decimal import Decimal
from datetime import datetime, timezone
from backend.database import get_db
from backend.models import TokenPass, Issuance, SystemConfig, Adjustment
from backend.services.pass_service import (
    generate_public_pass_id,
    generate_secret,
    hash_secret,
    create_qr_payload,
)
from backend.services.audit_service import log_audit

def issue_token_pass(cashier_id: int, cash_received: float, token_value: int = None):
    session = get_db()
    
    # 1. Fetch system config
    config = session.query(SystemConfig).filter_by(id=1).first()
    if not config:
        config = SystemConfig(id=1)
        session.add(config)
        session.commit()

    if config.event_status == "closed":
        raise ValueError("Event is closed. New token issuances are disabled.")

    conversion_rate = float(config.cash_to_token_rate)
    
    # Calculate token_value if not given, or validate
    if token_value is None:
        token_value = int(cash_received / conversion_rate)
    
    if token_value <= 0:
        raise ValueError("Token value must be at least 1 unit.")
    if cash_received <= 0:
        raise ValueError("Cash received must be greater than 0.")

    # Mark issuance started so conversion rate cannot be changed casually
    if not config.issuance_started:
        config.issuance_started = True

    # 2. Generate pass credentials
    public_id = generate_public_pass_id()
    secret = generate_secret()
    cred_hash = hash_secret(secret)

    # 3. Create TokenPass
    pass_obj = TokenPass(
        public_pass_id=public_id,
        credential_hash=cred_hash,
        issued_value=token_value,
        remaining_value=token_value,
        conversion_rate_version=config.rate_version,
        status="active",
        issued_by=cashier_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(pass_obj)
    session.flush()

    # 4. Create Issuance Record
    issuance = Issuance(
        token_pass_id=pass_obj.id,
        cash_received=Decimal(str(cash_received)),
        token_value_issued=token_value,
        conversion_rate=Decimal(str(conversion_rate)),
        cashier_id=cashier_id,
        status="completed",
        created_at=datetime.now(timezone.utc),
    )
    session.add(issuance)
    session.commit()

    qr_payload = create_qr_payload(public_id, secret)

    # 5. Audit Log
    log_audit(
        action="ISSUE_PASS",
        entity_type="TOKEN_PASS",
        actor_id=cashier_id,
        entity_id=pass_obj.id,
        metadata={
            "public_pass_id": public_id,
            "cash_received": cash_received,
            "token_value_issued": token_value,
            "conversion_rate": conversion_rate,
        },
    )

    return {
        "issuance": issuance.to_dict(),
        "token_pass": pass_obj.to_dict(),
        "qr_payload": qr_payload,
        "secret": secret,
    }

def void_issuance(issuance_id: int, user_id: int, reason: str):
    session = get_db()
    issuance = session.query(Issuance).filter_by(id=issuance_id).first()
    if not issuance:
        raise ValueError("Issuance record not found.")

    if issuance.status == "voided":
        raise ValueError("This issuance has already been voided.")

    token_pass = issuance.token_pass
    if not token_pass:
        raise ValueError("Associated token pass not found.")

    # Business rule: Can only void if the pass has not been spent!
    if token_pass.remaining_value != token_pass.issued_value:
        raise ValueError("Cannot void issuance: tokens have already been redeemed from this pass. Use administrative adjustment instead.")

    # Mark as voided
    issuance.status = "voided"
    token_pass.status = "voided"
    token_pass.remaining_value = 0

    # Create auditable adjustment
    adj = Adjustment(
        reference_transaction_id=issuance.id,
        stall_id=None,
        adjustment_type="void_issuance",
        amount=token_pass.issued_value,
        reason=reason or "Cash counter void",
        approved_by=user_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(adj)
    session.commit()

    # Log audit
    log_audit(
        action="VOID_PASS",
        entity_type="ISSUANCE",
        actor_id=user_id,
        entity_id=issuance.id,
        metadata={
            "token_pass_id": token_pass.id,
            "public_pass_id": token_pass.public_pass_id,
            "cash_refunded": float(issuance.cash_received),
            "tokens_voided": token_pass.issued_value,
            "reason": reason,
        },
    )

    return {
        "message": f"Issuance {issuance_id} and Pass {token_pass.public_pass_id} successfully voided.",
        "issuance": issuance.to_dict(),
    }
