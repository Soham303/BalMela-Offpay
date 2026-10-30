import pytest
from backend.app import create_app
from backend.config import TestingConfig
from backend.database import get_db, Base
from backend.models import User, SystemConfig, TokenPass, Issuance
from backend.services.auth_service import hash_password, generate_jwt_token

@pytest.fixture
def test_setup():
    app = create_app(TestingConfig)
    with app.app_context():
        session = get_db()
        from backend.database import _engine
        Base.metadata.create_all(bind=_engine)

        config = SystemConfig(id=1, cash_to_token_rate=1.0, rate_version=1, issuance_started=False, event_status="active")
        session.add(config)

        cashier = User(username="cashier_topup", password_hash=hash_password("pass"), role="cashier", is_active=True)
        session.add(cashier)
        session.commit()

        cashier_token = generate_jwt_token(cashier)

        with app.test_client() as client:
            yield client, cashier_token, session

        Base.metadata.drop_all(bind=_engine)

def test_issue_with_attendee_name_and_search(test_setup):
    client, cashier_token, session = test_setup

    # 1. Issue pass with attendee_name
    res = client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"cash_received": 100, "attendee_name": "Soham Sharma"}
    )
    assert res.status_code == 201
    data = res.get_json()
    assert data["token_pass"]["attendee_name"] == "Soham Sharma"
    pass_id = data["token_pass"]["public_pass_id"]

    # 2. Search by name
    search_res = client.get(
        "/api/counter/search?q=Soham",
        headers={"Authorization": f"Bearer {cashier_token}"}
    )
    assert search_res.status_code == 200
    passes = search_res.get_json()["passes"]
    assert len(passes) >= 1
    assert passes[0]["attendee_name"] == "Soham Sharma"
    assert passes[0]["public_pass_id"] == pass_id

def test_lookup_and_topup_flow(test_setup):
    client, cashier_token, session = test_setup

    # 1. Issue initial pass with 50 tokens
    res = client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"cash_received": 50, "attendee_name": "Alex Student"}
    )
    assert res.status_code == 201
    pass_id = res.get_json()["token_pass"]["public_pass_id"]
    qr_payload = res.get_json()["qr_payload"]

    # 2. Lookup pass using QR payload
    lookup_res = client.post(
        "/api/counter/lookup",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"qr_data": qr_payload}
    )
    assert lookup_res.status_code == 200
    lookup_data = lookup_res.get_json()
    assert lookup_data["token_pass"]["public_pass_id"] == pass_id
    assert lookup_data["token_pass"]["remaining_value"] == 50
    assert len(lookup_data["issuances"]) == 1

    # 3. Top up with 150 cash
    topup_res = client.post(
        "/api/counter/topup",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"pass_identifier": pass_id, "cash_received": 150}
    )
    assert topup_res.status_code == 200
    topup_data = topup_res.get_json()
    assert topup_data["new_balance"] == 200
    assert topup_data["tokens_added"] == 150
    assert topup_data["issuance"]["is_topup"] is True

    # 4. Verify cashier summary has both issuances recorded
    summary_res = client.get(
        "/api/counter/summary",
        headers={"Authorization": f"Bearer {cashier_token}"}
    )
    assert summary_res.status_code == 200
    summary = summary_res.get_json()
    assert summary["total_cash_collected"] == 200.0
    assert summary["total_tokens_given"] == 200
    assert summary["total_issuances_count"] == 2
    assert summary["total_passes_count"] == 1
