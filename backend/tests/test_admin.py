import pytest
import uuid
from backend.app import create_app
from backend.config import TestingConfig
from backend.database import get_db, Base
from backend.models import User, Stall, SystemConfig
from backend.services.auth_service import hash_password, generate_jwt_token
from backend.services.issuance_service import issue_token_pass
from backend.services.redemption_service import process_redemption

@pytest.fixture
def test_setup():
    app = create_app(TestingConfig)
    with app.app_context():
        session = get_db()
        from backend.database import _engine
        Base.metadata.create_all(bind=_engine)

        config = SystemConfig(id=1, cash_to_token_rate=1.0, rate_version=1, issuance_started=False, event_status="active")
        session.add(config)

        stall = Stall(stall_code="STALL-01", name="Tasty Bites", is_active=True)
        session.add(stall)
        session.flush()

        admin = User(username="admin", password_hash=hash_password("adminpass"), role="admin", is_active=True)
        cashier = User(username="cashier", password_hash=hash_password("cashierpass"), role="cashier", is_active=True)
        op = User(username="operator", password_hash=hash_password("oppass"), role="stall_operator", stall_id=stall.id, is_active=True)

        session.add(admin)
        session.add(cashier)
        session.add(op)
        session.commit()

        admin_token = generate_jwt_token(admin)
        cashier_token = generate_jwt_token(cashier)
        op_token = generate_jwt_token(op)

        with app.test_client() as client:
            yield {
                "client": client,
                "admin_token": admin_token,
                "cashier_token": cashier_token,
                "op_token": op_token,
                "stall": stall,
                "cashier": cashier,
                "op": op,
            }

        Base.metadata.drop_all(bind=_engine)

def test_admin_dashboard_reconciliation(test_setup):
    data = test_setup
    client = data["client"]

    # Issue 200 tokens
    pass_res = issue_token_pass(data["cashier"].id, cash_received=200.0, token_value=200)
    qr = pass_res["qr_payload"]

    # Redeem 70 tokens at stall
    process_redemption(
        operator_id=data["op"].id,
        stall_id=data["stall"].id,
        amount=70,
        idempotency_key=str(uuid.uuid4()),
        qr_data=qr,
    )

    # Fetch admin dashboard
    res = client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {data['admin_token']}"})
    assert res.status_code == 200
    body = res.get_json()
    recon = body["reconciliation"]

    assert recon["total_cash_received"] == 200.0
    assert recon["total_tokens_issued"] == 200
    assert recon["total_tokens_redeemed"] == 70
    assert recon["total_outstanding_value"] == 130
    assert recon["is_balanced"] is True
    assert recon["discrepancy"] == 0

    stalls = body["stall_summaries"]
    assert len(stalls) == 1
    assert stalls[0]["stall_code"] == "STALL-01"
    assert stalls[0]["gross_tokens_collected"] == 70
    assert stalls[0]["net_payable_tokens"] == 70

def test_adjustments_and_stall_payout(test_setup):
    data = test_setup
    client = data["client"]

    # Issue 100 tokens, redeem 60 tokens
    pass_res = issue_token_pass(data["cashier"].id, cash_received=100.0, token_value=100)
    process_redemption(
        operator_id=data["op"].id,
        stall_id=data["stall"].id,
        amount=60,
        idempotency_key=str(uuid.uuid4()),
        qr_data=pass_res["qr_payload"],
    )

    # Create an adjustment of 10 tokens deduction (e.g., fee or approved refund)
    adj_res = client.post(
        "/api/admin/adjustments",
        headers={"Authorization": f"Bearer {data['admin_token']}"},
        json={
            "stall_id": data["stall"].id,
            "adjustment_type": "deduction",
            "amount": 10,
            "reason": "Stall space clean-up deduction",
        }
    )
    assert adj_res.status_code == 201

    # Check dashboard net payout
    dash_res = client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {data['admin_token']}"})
    stall_summary = dash_res.get_json()["stall_summaries"][0]
    assert stall_summary["gross_tokens_collected"] == 60
    assert stall_summary["adjustments_deducted"] == 10
    assert stall_summary["net_payable_tokens"] == 50

def test_csv_exports(test_setup):
    data = test_setup
    client = data["client"]

    pass_res = issue_token_pass(data["cashier"].id, cash_received=100.0, token_value=100)
    process_redemption(
        operator_id=data["op"].id,
        stall_id=data["stall"].id,
        amount=50,
        idempotency_key=str(uuid.uuid4()),
        qr_data=pass_res["qr_payload"],
    )

    # Export transactions CSV
    txn_csv = client.get("/api/admin/export/transactions", headers={"Authorization": f"Bearer {data['admin_token']}"})
    assert txn_csv.status_code == 200
    assert "text/csv" in txn_csv.content_type
    content = txn_csv.data.decode("utf-8")
    assert "Transaction Type" in content
    assert "Issuance" in content
    assert "Redemption" in content

    # Export settlement CSV
    set_csv = client.get("/api/admin/export/settlement", headers={"Authorization": f"Bearer {data['admin_token']}"})
    assert set_csv.status_code == 200
    assert "text/csv" in set_csv.content_type
    settlement_content = set_csv.data.decode("utf-8")
    assert "STALL-01" in settlement_content
    assert "Tasty Bites" in settlement_content

def test_close_event(test_setup):
    data = test_setup
    client = data["client"]

    close_res = client.post("/api/admin/close-event", headers={"Authorization": f"Bearer {data['admin_token']}"})
    assert close_res.status_code == 200
    assert close_res.get_json()["config"]["event_status"] == "closed"

    # Attempting new issuance after close must fail
    issue_res = client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {data['cashier_token']}"},
        json={"cash_received": 100}
    )
    assert issue_res.status_code == 400
    assert "Event is closed" in issue_res.get_json()["error"]

    # Reopen event via /api/admin/open-event
    open_res = client.post("/api/admin/open-event", headers={"Authorization": f"Bearer {data['admin_token']}"})
    assert open_res.status_code == 200
    assert open_res.get_json()["config"]["event_status"] == "active"

    # Issuance should now succeed
    reissue_res = client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {data['cashier_token']}"},
        json={"cash_received": 100}
    )
    assert reissue_res.status_code == 201
