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
    Parses QR payload format:
    - URL format: 'http://<host>/pass#id=<public_pass_id>&secret=<secret>' or '?id=...&secret=...'
    - Plain format: 'FEST:<public_pass_id>:<secret>'
    - Short format: '<public_pass_id>:<secret>'
    """
    if not payload:
        return None, None
    payload = payload.strip()

    # Check if payload is a URL
    if "#id=" in payload or "?id=" in payload:
        import urllib.parse
        parsed = urllib.parse.urlparse(payload)
        query_string = parsed.fragment if "#id=" in payload else parsed.query
        params = urllib.parse.parse_qs(query_string)
        pass_id = params.get("id", [None])[0]
        secret = params.get("secret", [None])[0]
        if pass_id and secret:
            return pass_id.strip(), secret.strip()

    parts = payload.split(":")
    if len(parts) == 3 and parts[0] == "FEST":
        return parts[1].strip(), parts[2].strip()
    elif len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return None, None

