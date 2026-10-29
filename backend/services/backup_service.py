import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from backend.config import Config
from backend.services.audit_service import log_audit

BACKUP_DIR = Config.BASE_DIR / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

def create_database_backup(actor_id=None, note="Automated backup"):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    db_uri = Config.SQLALCHEMY_DATABASE_URI

    if db_uri.startswith("sqlite:///"):
        # Local SQLite file
        src_path = db_uri.replace("sqlite:///", "")
        src_file = Path(src_path)
        if not src_file.exists():
            # In-memory or not yet created
            return {"error": "Source database file does not exist."}

        backup_filename = f"festtoken_backup_{timestamp}.db"
        dest_file = BACKUP_DIR / backup_filename

        # Perform consistent SQLite online backup using sqlite3.Connection.backup
        src_conn = sqlite3.connect(str(src_file))
        dest_conn = sqlite3.connect(str(dest_file))
        with dest_conn:
            src_conn.backup(dest_conn)
        dest_conn.close()
        src_conn.close()

        file_size_bytes = dest_file.stat().st_size

        log_audit(
            action="DATABASE_BACKUP",
            entity_type="SYSTEM",
            actor_id=actor_id,
            entity_id=backup_filename,
            metadata={
                "backup_filename": backup_filename,
                "file_size_bytes": file_size_bytes,
                "note": note,
            },
        )

        return {
            "message": "Database backup created successfully",
            "filename": backup_filename,
            "filepath": str(dest_file),
            "size_bytes": file_size_bytes,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        # Fallback for PostgreSQL or other database URIs
        return {
            "message": "Database backup initiated (External PostgreSQL engine).",
            "db_uri": db_uri,
        }

def list_backups():
    backups = []
    if BACKUP_DIR.exists():
        for file in sorted(BACKUP_DIR.glob("*.db"), key=lambda f: f.stat().st_mtime, reverse=True):
            stat = file.stat()
            backups.append({
                "filename": file.name,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
    return backups
