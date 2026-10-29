#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if [ -d "venv" ]; then
    source venv/bin/activate
fi

python3 -c "
from backend.services.backup_service import create_database_backup
res = create_database_backup(note='CLI scheduled backup')
print(res)
"
