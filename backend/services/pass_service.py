import secrets
import hashlib
import uuid
from backend.models import TokenPass

def generate_public_pass_id() -> str:
    # Generates a clean human-readable pass ID like PASS-7C8D2E1A
    short_uuid = uuid.uuid4().hex[:8].upper()
    return f"PASS-{short_uuid}"

def generate_secret() -> str:
    # 256-bit cryptographically secure URL-safe bearer token
    return secrets.token_urlsafe(32)

def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.strip().encode("utf-8")).hexdigest()

def create_qr_payload(public_pass_id: str, secret: str) -> str:
    return f"FEST:{public_pass_id}:{secret.strip()}"

def parse_qr_payload(payload: str):
    """
    Parses QR payload format: 'FEST:<public_pass_id>:<secret>'
    Or manual format '<public_pass_id>:<secret>'
    """
    payload = payload.strip()
    parts = payload.split(":")
    if len(parts) == 3 and parts[0] == "FEST":
        return parts[1], parts[2]
    elif len(parts) == 2:
        return parts[0], parts[1]
    return None, None
