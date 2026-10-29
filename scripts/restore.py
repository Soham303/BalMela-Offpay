#!/usr/bin/env python3
import sys
import shutil
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def restore_backup(backup_path: str, target_db_path: str = None):
    backup_file = Path(backup_path)
    if not backup_file.exists():
        print(f"Error: Backup file '{backup_path}' does not exist.")
        sys.exit(1)

    if not target_db_path:
        target_db_path = BASE_DIR / "instance" / "festtoken.db"
    else:
        target_db_path = Path(target_db_path)

    target_db_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Restoring backup from '{backup_file}' to '{target_db_path}'...")

    # Consistent SQLite copy using online backup API
    src = sqlite3.connect(str(backup_file))
    dst = sqlite3.connect(str(target_db_path))
    with dst:
        src.backup(dst)
    dst.close()
    src.close()

    print("Backup restored successfully!")

    # Verify counts
    conn = sqlite3.connect(str(target_db_path))
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM users;")
    user_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM stalls;")
    stall_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM token_passes;")
    pass_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM redemptions;")
    red_count = cur.fetchone()[0]
    conn.close()

    print(f"Verification Results:")
    print(f" - Users: {user_count}")
    print(f" - Stalls: {stall_count}")
    print(f" - Token Passes: {pass_count}")
    print(f" - Redemptions: {red_count}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/restore.py <path_to_backup.db> [optional_target_path]")
        sys.exit(1)
    target = sys.argv[2] if len(sys.argv) > 2 else None
    restore_backup(sys.argv[1], target)
