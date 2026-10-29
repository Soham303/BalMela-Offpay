import pytest
import uuid
import threading
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from backend.app import create_app
from backend.config import TestingConfig, Config
from backend.database import init_db, get_db, Base
from backend.models import User, Stall, SystemConfig, TokenPass, Issuance, Redemption
from backend.services.auth_service import hash_password, generate_jwt_token
from backend.services.issuance_service import issue_token_pass
from backend.services.redemption_service import process_redemption
from backend.services.reconciliation_service import get_financial_reconciliation
from backend.services.backup_service import create_database_backup

@pytest.fixture
def acceptance_env(tmp_path):
    # Use a persistent file-backed SQLite database in a temp directory to test restart and backup recovery
    db_file = tmp_path / "festtoken_acceptance.db"
    db_uri = f"sqlite:///{db_file}"

    class PersistentTestConfig(TestingConfig):
        SQLALCHEMY_DATABASE_URI = db_uri

    app = create_app(PersistentTestConfig)
    with app.app_context():
        engine = init_db(db_uri)
        Base.metadata.create_all(bind=engine)
        session = get_db()

        # Seed config
        config = SystemConfig(id=1, cash_to_token_rate=1.0, rate_version=1, issuance_started=False, event_status="active")
        session.add(config)

        # Seed 3 stalls
        stall1 = Stall(stall_code="STALL-01", name="Burger Stand", is_active=True)
        stall2 = Stall(stall_code="STALL-02", name="Smoothie Bar", is_active=True)
        stall3 = Stall(stall_code="STALL-03", name="Pizza Corner", is_active=True)
        session.add_all([stall1, stall2, stall3])
        session.flush()

        # Seed users
        admin = User(username="admin_acc", password_hash=hash_password("adminpass"), role="admin", is_active=True)
        cashier = User(username="cashier_acc", password_hash=hash_password("cashierpass"), role="cashier", is_active=True)
        op1 = User(username="op1_acc", password_hash=hash_password("oppass"), role="stall_operator", stall_id=stall1.id, is_active=True)
        op2 = User(username="op2_acc", password_hash=hash_password("oppass"), role="stall_operator", stall_id=stall2.id, is_active=True)
        op3 = User(username="op3_acc", password_hash=hash_password("oppass"), role="stall_operator", stall_id=stall3.id, is_active=True)
        session.add_all([admin, cashier, op1, op2, op3])
        session.commit()

        tokens = {
            "admin": generate_jwt_token(admin),
            "cashier": generate_jwt_token(cashier),
            "op1": generate_jwt_token(op1),
            "op2": generate_jwt_token(op2),
            "op3": generate_jwt_token(op3),
        }

        stall_ids = [stall1.id, stall2.id, stall3.id]
        cashier_id = cashier.id
        op1_id = op1.id
        op2_id = op2.id
        op3_id = op3.id

        with app.test_client() as client:
            yield {
                "client": client,
                "app": app,
                "db_uri": db_uri,
                "db_file": db_file,
                "tokens": tokens,
                "stall_ids": stall_ids,
                "cashier_id": cashier_id,
                "op1_id": op1_id,
                "op2_id": op2_id,
                "op3_id": op3_id,
                "stalls": [stall1, stall2, stall3],
                "cashier": cashier,
                "op1": op1,
                "op2": op2,
                "op3": op3,
            }

        session.close()
        engine.dispose()

# Acceptance Test 1: A cashier can issue a pass after recording a cash payment.
def test_at01_cashier_issue_pass(acceptance_env):
    env = acceptance_env
    res = env["client"].post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {env['tokens']['cashier']}"},
        json={"cash_received": 500}
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["token_pass"]["issued_value"] == 500
    assert body["token_pass"]["remaining_value"] == 500
    assert body["issuance"]["cash_received"] == 500.0

# Acceptance Tests 2 & 3: An authorized stall can redeem tokens, and a second stall can redeem remaining value from the same pass.
def test_at02_at03_multi_stall_redemption(acceptance_env):
    env = acceptance_env
    client = env["client"]

    # Issue pass with 100 tokens
    pass_res = issue_token_pass(env["cashier"].id, cash_received=100.0, token_value=100)
    qr = pass_res["qr_payload"]

    # Stall 1 redeems 40
    res1 = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"qr_data": qr, "amount": 40, "idempotency_key": str(uuid.uuid4())}
    )
    assert res1.status_code == 200
    assert res1.get_json()["remaining_value"] == 60

    # Stall 2 redeems 35 from the same pass
    res2 = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {env['tokens']['op2']}"},
        json={"qr_data": qr, "amount": 35, "idempotency_key": str(uuid.uuid4())}
    )
    assert res2.status_code == 200
    assert res2.get_json()["remaining_value"] == 25

# Acceptance Test 4: The total for each stall includes only transactions assigned to that stall.
def test_at04_separate_stall_ledgers(acceptance_env):
    env = acceptance_env
    client = env["client"]

    pass_res = issue_token_pass(env["cashier"].id, cash_received=200.0, token_value=200)
    qr = pass_res["qr_payload"]

    client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"qr_data": qr, "amount": 80, "idempotency_key": str(uuid.uuid4())}
    )
    client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {env['tokens']['op2']}"},
        json={"qr_data": qr, "amount": 45, "idempotency_key": str(uuid.uuid4())}
    )

    s1 = client.get("/api/stall/summary", headers={"Authorization": f"Bearer {env['tokens']['op1']}"}).get_json()
    s2 = client.get("/api/stall/summary", headers={"Authorization": f"Bearer {env['tokens']['op2']}"}).get_json()

    assert s1["total_tokens_collected"] == 80
    assert s2["total_tokens_collected"] == 45

# Acceptance Test 5 & 10: Rejects redemption larger than remaining pass value without changing totals.
def test_at05_at10_reject_overspend_no_side_effects(acceptance_env):
    env = acceptance_env
    client = env["client"]

    pass_res = issue_token_pass(env["cashier"].id, cash_received=50.0, token_value=50)
    qr = pass_res["qr_payload"]

    res = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"qr_data": qr, "amount": 60, "idempotency_key": str(uuid.uuid4())}
    )
    assert res.status_code == 400
    assert "Insufficient token balance" in res.get_json()["error"]

    # Verify pass balance is unchanged
    inspect_res = client.post(
        "/api/stall/inspect",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"qr_data": qr}
    )
    assert inspect_res.get_json()["remaining_value"] == 50

# Acceptance Test 6: Concurrent race condition testing: two concurrent purchases cannot spend more than available value.
def test_at06_concurrent_double_spend_prevention(acceptance_env):
    env = acceptance_env
    app = env["app"]

    # Issue a pass with 50 tokens
    with app.app_context():
        pass_res = issue_token_pass(env["cashier"].id, cash_received=50.0, token_value=50)
        qr = pass_res["qr_payload"]
        # Ensure session is committed and closed before subthreads start
        get_db().remove()

    results = []

    def attempt_redemption(operator_id, stall_id, amount):
        with app.app_context():
            try:
                res = process_redemption(
                    operator_id=operator_id,
                    stall_id=stall_id,
                    amount=amount,
                    idempotency_key=str(uuid.uuid4()),
                    qr_data=qr,
                )
                results.append(("SUCCESS", res["transaction"]["amount"]))
            except Exception as e:
                results.append(("FAILED", str(e)))

    # Two concurrent threads attempt to redeem 40 tokens simultaneously from a 50 token pass!
    # If there is a race condition, both might succeed and deduct 80 tokens.
    # With atomic locks, exactly one must succeed (40 tokens) and the other must fail!
    t1 = threading.Thread(target=attempt_redemption, args=(env["op1_id"], env["stall_ids"][0], 40))
    t2 = threading.Thread(target=attempt_redemption, args=(env["op2_id"], env["stall_ids"][1], 40))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    successes = [r for r in results if r[0] == "SUCCESS"]
    failures = [r for r in results if r[0] == "FAILED"]

    assert len(successes) == 1, f"Expected exactly 1 success, got {len(successes)}: {failures}"
    assert len(failures) == 1, f"Expected exactly 1 failure, got {len(failures)}"

    with app.app_context():
        session = get_db()
        p = session.query(TokenPass).filter_by(public_pass_id=pass_res["token_pass"]["public_pass_id"]).first()
        assert p.remaining_value == 10

# Acceptance Test 7: Retrying a successful request with the same idempotency key does not create a second deduction.
def test_at07_idempotency_no_duplicate_deduction(acceptance_env):
    env = acceptance_env
    client = env["client"]

    pass_res = issue_token_pass(env["cashier"].id, cash_received=100.0, token_value=100)
    qr = pass_res["qr_payload"]
    key = f"key-{uuid.uuid4()}"

    res1 = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"qr_data": qr, "amount": 30, "idempotency_key": key}
    )
    assert res1.status_code == 200
    assert res1.get_json()["remaining_value"] == 70

    # Retry exact same request
    res2 = client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"qr_data": qr, "amount": 30, "idempotency_key": key}
    )
    assert res2.status_code == 200
    assert res2.get_json()["is_duplicate_retry"] is True
    assert res2.get_json()["remaining_value"] == 70

# Acceptance Test 9: An unauthorized user cannot perform administrative or other-stall actions.
def test_at09_rbac_unauthorized_rejections(acceptance_env):
    env = acceptance_env
    client = env["client"]

    # Cashier cannot access admin dashboard
    res1 = client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {env['tokens']['cashier']}"})
    assert res1.status_code == 403

    # Stall operator cannot issue tokens
    res2 = client.post(
        "/api/counter/issue",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"cash_received": 100}
    )
    assert res2.status_code == 403

    # Stall operator cannot change system config
    res3 = client.put(
        "/api/config",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"cash_to_token_rate": 2.0}
    )
    assert res3.status_code == 403

# Acceptance Test 11 & 12: Adjustments, refunds, and CSV exports reproduce displayed totals.
def test_at11_at12_adjustments_and_csv_reproducibility(acceptance_env):
    env = acceptance_env
    client = env["client"]

    pass_res = issue_token_pass(env["cashier"].id, cash_received=300.0, token_value=300)
    client.post(
        "/api/stall/redeem",
        headers={"Authorization": f"Bearer {env['tokens']['op1']}"},
        json={"qr_data": pass_res["qr_payload"], "amount": 120, "idempotency_key": str(uuid.uuid4())}
    )

    # Add deduction of 20
    client.post(
        "/api/admin/adjustments",
        headers={"Authorization": f"Bearer {env['tokens']['admin']}"},
        json={"stall_id": env["stalls"][0].id, "adjustment_type": "deduction", "amount": 20, "reason": "Penalty"}
    )

    dash = client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {env['tokens']['admin']}"}).get_json()
    s1 = [s for s in dash["stall_summaries"] if s["stall_code"] == "STALL-01"][0]
    assert s1["gross_tokens_collected"] == 120
    assert s1["adjustments_deducted"] == 20
    assert s1["net_payable_tokens"] == 100

    # Test CSV export
    csv_res = client.get("/api/admin/export/settlement", headers={"Authorization": f"Bearer {env['tokens']['admin']}"})
    assert csv_res.status_code == 200
    csv_text = csv_res.data.decode("utf-8")
    assert "STALL-01" in csv_text
    assert "100" in csv_text  # Net payable reproduced

# Acceptance Test 13: Recover from a temporary backend restart with data preserved.
def test_at13_backend_restart_persistence(acceptance_env):
    env = acceptance_env
    client = env["client"]

    # Issue a pass
    pass_res = issue_token_pass(env["cashier"].id, cash_received=150.0, token_value=150)
    pass_id = pass_res["token_pass"]["public_pass_id"]

    # "Simulate Restart": Create a completely fresh Flask app connected to the same persistent SQLite database file
    class PersistentRestartConfig(TestingConfig):
        SQLALCHEMY_DATABASE_URI = env["db_uri"]

    restarted_app = create_app(PersistentRestartConfig)
    with restarted_app.test_client() as restarted_client:
        recon = restarted_client.get(
            "/api/admin/dashboard",
            headers={"Authorization": f"Bearer {env['tokens']['admin']}"}
        ).get_json()
        assert recon["reconciliation"]["total_cash_received"] >= 150.0
        assert recon["reconciliation"]["is_balanced"] is True

# Acceptance Test 16: Load test simulating 25 active stall sessions without duplicate deductions or lost records.
def test_at16_stall_sessions_load_test(acceptance_env):
    env = acceptance_env
    app = env["app"]

    # Issue 5 passes of 200 tokens each = 1000 tokens total
    passes = []
    for _ in range(5):
        p = issue_token_pass(env["cashier"].id, cash_received=200.0, token_value=200)
        passes.append(p)

    total_attempted_charges = 0
    tasks = []

    # Simulate 25 distinct stall transactions across stalls
    for i in range(25):
        assigned_pass = passes[i % 5]
        charge = 10  # 25 * 10 = 250 tokens total (well within 1000 tokens)
        stall_id = env["stalls"][i % 3].id
        op_id = env["op1"].id
        tasks.append((op_id, stall_id, charge, assigned_pass["qr_payload"], str(uuid.uuid4())))
        total_attempted_charges += charge

    def execute_txn(args):
        op_id, stall_id, charge, qr, key = args
        with app.app_context():
            return process_redemption(
                operator_id=op_id,
                stall_id=stall_id,
                amount=charge,
                idempotency_key=key,
                qr_data=qr,
            )

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(execute_txn, tasks))

    assert len(results) == 25
    for r in results:
        assert r["is_duplicate_retry"] is False

    with app.app_context():
        recon = get_financial_reconciliation()
        assert recon["summary"]["is_balanced"] is True
        assert recon["summary"]["total_tokens_redeemed"] >= 250
