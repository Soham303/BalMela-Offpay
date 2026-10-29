import json
from datetime import datetime, timezone
from backend.database import get_db
from backend.models import AuditLog

def log_audit(action: str, entity_type: str, actor_id=None, entity_id=None, metadata=None):
    session = get_db()
    meta_str = None
    if metadata is not None:
        try:
            meta_str = json.dumps(metadata)
        except Exception:
            meta_str = str(metadata)
            
    audit = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        metadata_json=meta_str,
        created_at=datetime.now(timezone.utc),
    )
    session.add(audit)
    session.commit()
    return audit
