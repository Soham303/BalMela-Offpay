from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy import func
from backend.database import get_db
from backend.models import TokenPass, Issuance, SystemConfig, Adjustment, Redemption
from backend.services.pass_service import (
    generate_public_pass_id,
    generate_secret,
    hash_secret,
    create_qr_payload,
    parse_qr_payload,
)
from backend.services.audit_service import log_audit

def issue_token_pass(
    cashier_id: int, 
    cash_received: float, 
    token_value: int = None, 
    attendee_name: str = None,
    scanned_qr_payload: str = None,
    custom_pass_id: str = None,
):
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

    # 2. Determine Pass Credentials (Scanned QR, Custom Pass ID, or Auto-Generated)
    public_id = None
    secret = None

    if scanned_qr_payload and scanned_qr_payload.strip():
        parsed_id, parsed_secret = parse_qr_payload(scanned_qr_payload.strip())
        if parsed_id:
            public_id = parsed_id
            secret = parsed_secret or generate_secret()
        else:
            public_id = scanned_qr_payload.strip()
            secret = generate_secret()
    elif custom_pass_id and custom_pass_id.strip():
        public_id = custom_pass_id.strip()
        secret = generate_secret()
    else:
        public_id = generate_public_pass_id()
        secret = generate_secret()

    # Verify pass does not already exist
    existing = session.query(TokenPass).filter_by(public_pass_id=public_id).first()
    if existing:
        raise ValueError(f"Pass '{public_id}' is already initialized with {existing.remaining_value} tokens. Please use the 'Top-Up Existing Pass' tab to add more credits.")

    cred_hash = hash_secret(secret)
    clean_name = attendee_name.strip() if attendee_name and attendee_name.strip() else None

    # 3. Create TokenPass
    pass_obj = TokenPass(
        public_pass_id=public_id,
        attendee_name=clean_name,
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
        is_topup=False,
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
            "attendee_name": clean_name,
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

def lookup_pass_details(pass_identifier: str):
    """
    Looks up pass details for cashier inspection and top-up.
    Accepts:
    - QR string (FEST:PASS-...:secret or URL)
    - Public Pass ID (PASS-XXXXXXXX)
    """
    if not pass_identifier:
        raise ValueError("Pass identifier is required.")

    pass_identifier = pass_identifier.strip()
    session = get_db()

    target_pass_id = pass_identifier
    if ":" in pass_identifier or "id=" in pass_identifier:
        parsed_id, _ = parse_qr_payload(pass_identifier)
        if parsed_id:
            target_pass_id = parsed_id

    pass_obj = session.query(TokenPass).filter_by(public_pass_id=target_pass_id).first()
    if not pass_obj:
        raise ValueError(f"No pass found matching '{target_pass_id}'.")

    # Fetch issuances
    issuances = session.query(Issuance).filter_by(token_pass_id=pass_obj.id).order_by(Issuance.created_at.desc()).all()
    # Fetch redemptions
    redemptions = session.query(Redemption).filter_by(token_pass_id=pass_obj.id).order_by(Redemption.created_at.desc()).all()

    return {
        "token_pass": pass_obj.to_dict(),
        "issuances": [i.to_dict() for i in issuances],
        "redemptions": [r.to_dict() for r in redemptions],
    }

def topup_token_pass(pass_identifier: str, cashier_id: int, cash_received: float, token_value: int = None):
    """
    Tops up an existing active or exhausted TokenPass.
    Creates a new completed Issuance record with is_topup=True.
    Increases issued_value and remaining_value atomically.
    """
    if not pass_identifier:
        raise ValueError("Pass identifier is required.")
    if cash_received <= 0:
        raise ValueError("Cash received must be greater than 0.")

    session = get_db()
    target_pass_id = pass_identifier.strip()
    if ":" in target_pass_id or "id=" in target_pass_id:
        parsed_id, _ = parse_qr_payload(target_pass_id)
        if parsed_id:
            target_pass_id = parsed_id

    pass_obj = session.query(TokenPass).filter_by(public_pass_id=target_pass_id).first()
    if not pass_obj:
        raise ValueError(f"Token pass '{target_pass_id}' not found.")

    if pass_obj.status in ["voided", "revoked"]:
        raise ValueError(f"Cannot top up pass: pass is currently {pass_obj.status}.")

    # Fetch config for conversion rate
    config = session.query(SystemConfig).filter_by(id=1).first()
    conversion_rate = float(config.cash_to_token_rate) if config else 1.0

    if token_value is None:
        token_value = int(cash_received / conversion_rate)

    if token_value <= 0:
        raise ValueError("Top-up token value must be at least 1.")

    # 1. Create top-up Issuance
    issuance = Issuance(
        token_pass_id=pass_obj.id,
        cash_received=Decimal(str(cash_received)),
        token_value_issued=token_value,
        conversion_rate=Decimal(str(conversion_rate)),
        cashier_id=cashier_id,
        is_topup=True,
        status="completed",
        created_at=datetime.now(timezone.utc),
    )
    session.add(issuance)

    # 2. Update TokenPass balances
    pass_obj.issued_value += token_value
    pass_obj.remaining_value += token_value
    if pass_obj.status == "exhausted":
        pass_obj.status = "active"

    session.commit()

    # 3. Audit log
    log_audit(
        action="TOPUP_PASS",
        entity_type="TOKEN_PASS",
        actor_id=cashier_id,
        entity_id=pass_obj.id,
        metadata={
            "public_pass_id": pass_obj.public_pass_id,
            "attendee_name": pass_obj.attendee_name,
            "cash_received": cash_received,
            "tokens_added": token_value,
            "new_remaining_value": pass_obj.remaining_value,
            "new_issued_value": pass_obj.issued_value,
        },
    )

    return {
        "message": f"Successfully topped up {token_value} tokens on {pass_obj.public_pass_id}!",
        "token_pass": pass_obj.to_dict(),
        "issuance": issuance.to_dict(),
        "tokens_added": token_value,
        "new_balance": pass_obj.remaining_value,
    }

def get_cashier_summary(cashier_id: int = None):
    """
    Computes total tokens given and cash collected.
    """
    session = get_db()
    query = session.query(Issuance).filter(Issuance.status == "completed")
    if cashier_id:
        query = query.filter(Issuance.cashier_id == cashier_id)

    total_cash = (
        session.query(func.coalesce(func.sum(Issuance.cash_received), 0))
        .filter(Issuance.status == "completed", Issuance.cashier_id == cashier_id if cashier_id else True)
        .scalar()
    ) or 0.0

    total_tokens = (
        session.query(func.coalesce(func.sum(Issuance.token_value_issued), 0))
        .filter(Issuance.status == "completed", Issuance.cashier_id == cashier_id if cashier_id else True)
        .scalar()
    ) or 0

    total_issuances = (
        session.query(func.count(Issuance.id))
        .filter(Issuance.status == "completed", Issuance.cashier_id == cashier_id if cashier_id else True)
        .scalar()
    ) or 0

    total_passes = (
        session.query(func.count(TokenPass.id))
        .filter(TokenPass.issued_by == cashier_id if cashier_id else True)
        .scalar()
    ) or 0

    return {
        "total_cash_collected": float(total_cash),
        "total_tokens_given": int(total_tokens),
        "total_issuances_count": int(total_issuances),
        "total_passes_count": int(total_passes),
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
