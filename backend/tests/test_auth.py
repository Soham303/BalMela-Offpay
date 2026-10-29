import pytest
from backend.app import create_app
from backend.config import TestingConfig
from backend.database import init_db, get_db, Base
from backend.models import User
from backend.services.auth_service import hash_password

@pytest.fixture
def client():
    app = create_app(TestingConfig)
    engine = init_db(TestingConfig.SQLALCHEMY_DATABASE_URI)
    Base.metadata.create_all(bind=engine)
    session = get_db()
    
    # Create test admin
    test_user = User(
        username="testadmin",
        password_hash=hash_password("adminpass"),
        role="admin",
        is_active=True,
    )
    session.add(test_user)
    session.commit()

    with app.test_client() as test_client:
        yield test_client

    Base.metadata.drop_all(bind=engine)

def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.get_json()["status"] == "healthy"

def test_login_success(client):
    res = client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "adminpass"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert "token" in data
    assert data["user"]["username"] == "testadmin"
    assert data["user"]["role"] == "admin"

def test_login_invalid_password(client):
    res = client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "wrongpassword"
    })
    assert res.status_code == 401

def test_get_current_user_profile(client):
    login_res = client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "adminpass"
    })
    token = login_res.get_json()["token"]

    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.get_json()["user"]["username"] == "testadmin"
