import pytest
from backend.app import create_app
from backend.config import TestingConfig
from backend.database import init_db, get_db, Base
from backend.models import User, SystemConfig
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

        cashier = User(username="cashier_test", password_hash=hash_password("pass"), role="cashier", is_active=True)
        admin = User(username="admin_test", password_hash=hash_password("pass"), role="admin", is_active=True)
        session.add(cashier)
        session.add(admin)
        session.commit()

        cashier_token = generate_jwt_token(cashier)
        admin_token = generate_jwt_token(admin)

        with app.test_client() as client:
            yield client, cashier_token, admin_token, session

        Base.metadata.drop_all(bind=_engine)


def test_issue_pass(test_setup):
    client, cashier_token, _, session = test_setup

    res = client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"cash_received": 150}
    )
    assert res.status_code == 201
    data = res.get_json()
    assert "token_pass" in data
    assert "qr_payload" in data
    assert data["token_pass"]["issued_value"] == 150
    assert data["token_pass"]["remaining_value"] == 150
    assert data["qr_payload"].startswith("FEST:PASS-")

    # Verify issuance_started became True
    cfg = session.query(SystemConfig).filter_by(id=1).first()
    assert cfg.issuance_started is True

def test_rate_lock_after_issuance(test_setup):
    client, cashier_token, admin_token, _ = test_setup

    # 1. Issue pass to start issuance
    client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"cash_received": 100}
    )

    # 2. Try to change rate without allow_new_rate_version -> should fail (400)
    res = client.put(
        "/api/config",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"cash_to_token_rate": 2.0}
    )
    assert res.status_code == 400
    assert "Issuance has already started" in res.get_json()["error"]

    # 3. Change rate with allow_new_rate_version=True -> should succeed
    res2 = client.put(
        "/api/config",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"cash_to_token_rate": 2.0, "allow_new_rate_version": True}
    )
    assert res2.status_code == 200
    assert res2.get_json()["config"]["rate_version"] == 2
    assert res2.get_json()["config"]["cash_to_token_rate"] == 2.0

def test_void_unspent_pass(test_setup):
    client, cashier_token, _, session = test_setup

    issue_res = client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"cash_received": 200}
    )
    issuance_id = issue_res.get_json()["issuance"]["id"]

    void_res = client.post(
        f"/api/counter/void/{issuance_id}",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"reason": "Attendee paid wrong amount"}
    )
    assert void_res.status_code == 200
    assert void_res.get_json()["issuance"]["status"] == "voided"
