import pytest
import uuid
from backend.app import create_app
from backend.config import TestingConfig
from backend.database import get_db, Base
from backend.models import User, Stall, SystemConfig
from backend.services.auth_service import hash_password, generate_jwt_token
from backend.services.issuance_service import issue_token_pass

@pytest.fixture
def test_setup():
    app = create_app(TestingConfig)
    with app.app_context():
        session = get_db()
        from backend.database import _engine
        Base.metadata.create_all(bind=_engine)

        config = SystemConfig(id=1, cash_to_token_rate=1.0, rate_version=1, issuance_started=False, event_status="active")
        session.add(config)

        # Create Stalls
        stall1 = Stall(stall_code="STALL-01", name="Burger Corner", is_active=True)
        stall2 = Stall(stall_code="STALL-02", name="Coffee Shop", is_active=True)
        session.add(stall1)
        session.add(stall2)
        session.flush()

        # Create Users
        cashier = User(username="cashier", password_hash=hash_password("pass"), role="cashier", is_active=True)
        op1 = User(username="op1", password_hash=hash_password("pass"), role="stall_operator", stall_id=stall1.id, is_active=True)
        op2 = User(username="op2", password_hash=hash_password("pass"), role="stall_operator", stall_id=stall2.id, is_active=True)
        admin = User(username="admin", password_hash=hash_password("pass"), role="admin", is_active=True)

        session.add(cashier)
        session.add(op1)
        session.add(op2)
        session.add(admin)
        session.commit()

        cashier_token = generate_jwt_token(cashier)
        op1_token = generate_jwt_token(op1)
        op2_token = generate_jwt_token(op2)
        admin_token = generate_jwt_token(admin)

        with app.test_client() as client:
            yield {
                "client": client,
                "cashier_token": cashier_token,
                "op1_token": op1_token,
                "op2_token": op2_token,
                "admin_token": admin_token,
                "stall1": stall1,
                "stall2": stall2,
                "cashier": cashier,
            }

        Base.metadata.drop_all(bind=_engine)

def test_inspect_and_redeem(test_setup):
    data = test_setup
    client = data["client"]

    # 1. Issue a pass with 100 tokens
    pass_data = issue_token_pass(data["cashier"].id, cash_received=100.0, token_value=100)
    qr_payload = pass_data["qr_payload"]
    pub_id = pass_data["token_pass"]["public_pass_id"]

    # 2. Inspect pass
    inspect_res = client.post(
        "/api/stall/inspect",
        headers={"Authorization": f"Bearer {data['op1_token']}"},
        json={"qr_data": qr_payload}
    )
    assert inspect_res.status_code == 200
    inspect_body = inspect_res.get_json()
    assert inspect_body["valid"] is True
    assert inspect_body["remaining_value"] == 100

    # 3. Stall 1 redeems 40 tokens
    key1 = str(uuid.uuid4())
    redeem_res1 = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {data['op1_token']}"},
        json={"qr_data": qr_payload, "amount": 40, "idempotency_key": key1}
    )
    assert redeem_res1.status_code == 200
    assert redeem_res1.get_json()["remaining_value"] == 60
    assert redeem_res1.get_json()["transaction"]["amount"] == 40

    # 4. Stall 2 redeems 50 tokens from the same pass
    key2 = str(uuid.uuid4())
    redeem_res2 = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {data['op2_token']}"},
        json={"qr_data": qr_payload, "amount": 50, "idempotency_key": key2}
    )
    assert redeem_res2.status_code == 200
    assert redeem_res2.get_json()["remaining_value"] == 10

    # 5. Check Stall 1 collections total
    summary1 = client.get(
        "/api/stall/summary",
        headers={"Authorization": f"Bearer {data['op1_token']}"}
    )
    assert summary1.status_code == 200
    assert summary1.get_json()["total_tokens_collected"] == 40

    # 6. Check Stall 2 collections total
    summary2 = client.get(
        "/api/stall/summary",
        headers={"Authorization": f"Bearer {data['op2_token']}"}
    )
    assert summary2.status_code == 200
    assert summary2.get_json()["total_tokens_collected"] == 50

def test_insufficient_balance_rejection(test_setup):
    data = test_setup
    client = data["client"]

    pass_data = issue_token_pass(data["cashier"].id, cash_received=50.0, token_value=50)
    qr_payload = pass_data["qr_payload"]

    res = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {data['op1_token']}"},
        json={"qr_data": qr_payload, "amount": 60, "idempotency_key": str(uuid.uuid4())}
    )
    assert res.status_code == 400
    assert "Insufficient token balance" in res.get_json()["error"]

def test_idempotent_retry(test_setup):
    data = test_setup
    client = data["client"]

    pass_data = issue_token_pass(data["cashier"].id, cash_received=100.0, token_value=100)
    qr_payload = pass_data["qr_payload"]
    key = str(uuid.uuid4())

    # First attempt
    res1 = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {data['op1_token']}"},
        json={"qr_data": qr_payload, "amount": 30, "idempotency_key": key}
    )
    assert res1.status_code == 200
    assert res1.get_json()["remaining_value"] == 70
    assert res1.get_json()["is_duplicate_retry"] is False

    # Second attempt with SAME idempotency key (simulating network timeout retry)
    res2 = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {data['op1_token']}"},
        json={"qr_data": qr_payload, "amount": 30, "idempotency_key": key}
    )
    assert res2.status_code == 200
    assert res2.get_json()["is_duplicate_retry"] is True
    # Balance must NOT be deducted a second time!
    assert res2.get_json()["remaining_value"] == 70
