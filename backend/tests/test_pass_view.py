import pytest
from backend.app import create_app
from backend.config import TestingConfig
from backend.database import get_db, Base
from backend.models import User, Stall, TokenPass, SystemConfig, Redemption
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

        cashier = User(username="cashier_test", password_hash=hash_password("pass"), role="cashier", is_active=True)
        session.add(cashier)

        stall = Stall(name="Taco Stall", stall_code="TACO_01")
        session.add(stall)
        session.commit()

        cashier_token = generate_jwt_token(cashier)

        with app.test_client() as client:
            yield client, cashier_token, session, stall

        Base.metadata.drop_all(bind=_engine)


def test_attendee_pass_view_flow(test_setup):
    client, cashier_token, session, stall = test_setup

    # 1. Issue a pass via cashier
    res_issue = client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"cash_received": 100}
    )
    assert res_issue.status_code == 201
    issue_data = res_issue.get_json()
    pass_id = issue_data["token_pass"]["public_pass_id"]
    secret = issue_data["secret"]

    # 2. View pass with credentials
    res = client.post("/api/pass/view", json={
        "public_pass_id": pass_id,
        "secret": secret
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["public_pass_id"] == pass_id
    assert data["remaining_value"] == 100
    assert len(data["transactions"]) == 0

    # 3. View pass with URL payload
    url_payload = f"http://localhost:5173/pass#id={pass_id}&secret={secret}"
    res2 = client.post("/api/pass/view", json={
        "qr_data": url_payload
    })
    assert res2.status_code == 200
    assert res2.get_json()["remaining_value"] == 100

    # 4. View pass with FEST: prefix
    fest_payload = f"FEST:{pass_id}:{secret}"
    res3 = client.post("/api/pass/view", json={
        "qr_data": fest_payload
    })
    assert res3.status_code == 200
    assert res3.get_json()["remaining_value"] == 100

    # 5. Add a redemption transaction and check transaction list
    operator = User(username="op_test", password_hash=hash_password("pass"), role="stall_operator", stall_id=stall.id, is_active=True)
    session.add(operator)
    session.commit()

    pass_obj = session.query(TokenPass).filter_by(public_pass_id=pass_id).first()
    redemption = Redemption(
        token_pass_id=pass_obj.id,
        stall_id=stall.id,
        operator_id=operator.id,
        amount=30,
        status="confirmed",
        idempotency_key="idemp_attendee_test_1"
    )
    pass_obj.remaining_value -= 30
    session.add(redemption)
    session.commit()

    res4 = client.post("/api/pass/view", json={
        "public_pass_id": pass_id,
        "secret": secret
    })
    assert res4.status_code == 200
    data4 = res4.get_json()
    assert data4["remaining_value"] == 70
    assert len(data4["transactions"]) == 1
    assert data4["transactions"][0]["amount"] == 30
    assert data4["transactions"][0]["stall_name"] == "Taco Stall"


def test_attendee_pass_invalid_credentials(test_setup):
    client, _, _, _ = test_setup
    res = client.post("/api/pass/view", json={
        "public_pass_id": "PASS-FAKE999",
        "secret": "wrongsecret123"
    })
    assert res.status_code == 404
