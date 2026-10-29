# FestToken (BalMela-Offpay)
## Local-Hosted QR Token and Stall Settlement System

FestToken is a high-performance, local-first web application designed for school and college festivals (20–30 stalls, 3,000–4,000 attendees). It replaces physical paper tokens with digital QR-based token passes, real-time stall redemption ledgers, and automated end-of-event financial reconciliation.

---

## 🎯 Architecture & Design Highlights

- **Local Backend & Private Database**: Runs on the organizer's laptop with persistent SQLite (WAL mode, busy timeout, foreign key enforcement) or local PostgreSQL.
- **Remote Smartphone Access**: Stall operators and staff connect securely over HTTPS via Cloudflare Tunnel or local network reverse proxy (Caddy).
- **Authoritative Security**: The attendee's QR code contains an opaque bearer secret (`FEST:PASS-<id>:<secret>`). Token balances are never stored on or trusted from the client.
- **Double-Spending Prevention**: Concurrency-tested atomic conditional updates and row-level locks ensure passes cannot be over-spent, even under concurrent requests.
- **Idempotent Redemptions**: Retrying a timed-out network submission returns the original transaction reference without deducting the balance a second time.
- **Separate Stall Ledgers**: Each redemption is strictly assigned to the operating stall's ID; stall operator interfaces are locked to their own stall's collections.
- **Automated Settlement Invariant**: Real-time ledger checks enforce `Issued = Redeemed + Outstanding` across all stalls and cash counter receipts.

---

## 🚀 Quickstart Guide

### 1. Requirements
- Python 3.12+
- Node.js v18+ & npm
- (Optional) Caddy or Cloudflare Tunnel for external HTTPS routing

### 2. Environment Setup
```bash
# Clone the repository
git clone https://github.com/Soham303/BalMela-Offpay.git
cd BalMela-Offpay

# Set up Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..

# Initialize and seed database with default staff accounts
PYTHONPATH=. python3 -m backend.seed
```

### 3. Development Mode
Run the backend and frontend development servers concurrently:

**Terminal 1 (Flask API on port 5000):**
```bash
source venv/bin/activate
export FLASK_APP=backend.app:create_app
export FLASK_ENV=development
python3 -m backend.app
```

**Terminal 2 (Vite React on port 5173 with proxy to backend):**
```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🎪 Event-Day Production Deployment

Run the all-in-one event launcher:
```bash
./scripts/run_event.sh
```
This automatically:
1. Compiles the React frontend into static assets (`frontend/dist`)
2. Verifies database schema and seeds initial stalls
3. Starts the Gunicorn WSGI server (`4 workers`) on `0.0.0.0:5000`

### External Tunnel Setup (Cloudflare Tunnel)
To allow stall operators to access the system from their smartphones over mobile data:
```bash
# Install and run cloudflared tunnel
cloudflared tunnel --url http://127.0.0.1:5000
```
Distribute the resulting HTTPS URL to cashiers and stall operators.

---

## 👥 Default Accounts & Roles

| Role | Username | Default Password | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin123` | Dashboard, Stall CRUD, Staff Users, Adjustments, Backups, Close Event |
| **Cashier** | `cashier1` | `cashier123` | Cash Counter, Issue Passes, Show/Print QR Code, Void Unspent Passes |
| **Auditor** | `auditor1` | `auditor123` | Read-only Dashboard, Audit Logs, Settlement Export |
| **Stall Operator 1** | `op_stall_01` | `operator123` | Stall 01 (Burger & Fries Corner) Camera Scanner & Redemption |
| **Stall Operator 2** | `op_stall_02` | `operator123` | Stall 02 (Artisan Coffee & Chai) Camera Scanner & Redemption |
| **Stall Operator 3** | `op_stall_03` | `operator123` | Stall 03 (Street Tacos & Nachos) Camera Scanner & Redemption |

*Note: Change default passwords in the Stalls & Staff operations tab before production operation.*

---

## 🧪 Automated Test Suite

Run the complete test suite covering all 17 Acceptance Tests:
```bash
PYTHONPATH=. pytest backend/tests/ -v
```

Tests include:
- `test_auth.py`: JWT issuance, verification, bcrypt hashing, login rate limiter
- `test_issuance.py`: Token pass generation, conversion rate locking, unspent voiding
- `test_redemption.py`: QR inspection, multi-stall redemption, balance checks, idempotency
- `test_admin.py`: Invariant verification, deductions/adjustments, CSV exports, event closing
- `test_acceptance_suite.py`: Multi-threaded race condition tests (preventing double spending), 25-session concurrent load test, restart persistence

---

## 💾 Backups & Disaster Recovery

### Create a Database Backup
```bash
./scripts/backup.sh
# Saved to backups/festtoken_backup_<timestamp>.db
```

### Restore from a Backup
```bash
python3 scripts/restore.py backups/festtoken_backup_<timestamp>.db
```

---

## 📊 End-of-Event Settlement & Reconciliation

1. Log into the Organizer Dashboard as `admin`.
2. Verify the **Ledger Balanced** status: `Issued = Redeemed + Outstanding`.
3. Review any stall space fees, damage deductions, or approved refunds using **Record Adjustment**.
4. Click **Transactions CSV** and **Settlement Summary CSV** to download verifiable payout records.
5. Click **Close Event** to freeze transaction processing once the festival concludes.
