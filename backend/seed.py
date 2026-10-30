import bcrypt
from datetime import datetime, timezone
from backend.config import Config
from backend.database import init_db, get_db, Base
from backend.models import User, Stall, SystemConfig, AuditLog

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def seed_database(reset=False):
    engine = init_db(Config.SQLALCHEMY_DATABASE_URI)
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    session = get_db()
    
    # 1. Initialize SystemConfig if not present
    config = session.query(SystemConfig).filter_by(id=1).first()
    if not config:
        config = SystemConfig(
            id=1,
            event_name="FestToken 2026",
            cash_to_token_rate=1.0,
            rate_version=1,
            allowed_denominations="10,20,50,100,200,500",
            issuance_started=False,
            event_status="active",
        )
        session.add(config)
        session.commit()
        print("Initialized system configuration.")
        
    # 2. Check and seed Admin
    admin = session.query(User).filter_by(username="admin").first()
    if not admin:
        admin = User(
            username="admin",
            password_hash=hash_password("admin123"),
            role="admin",
            is_active=True,
        )
        session.add(admin)
        session.commit()
        print("Created default admin: username='admin', password='admin123'")
        
        # Audit log
        session.add(AuditLog(
            actor_id=admin.id,
            action="SYSTEM_INIT",
            entity_type="SYSTEM",
            entity_id="1",
            metadata_json='{"message": "Database initialized with default admin"}',
        ))
        session.commit()

    # 3. Check and seed 2 Cashiers
    for c_user in ["cashier1", "cashier2"]:
        cashier = session.query(User).filter_by(username=c_user).first()
        if not cashier:
            cashier = User(
                username=c_user,
                password_hash=hash_password("cashier123"),
                role="cashier",
                is_active=True,
            )
            session.add(cashier)
            session.commit()
            print(f"Created cashier: username='{c_user}', password='cashier123'")

    # 4. Check and seed Auditor
    auditor = session.query(User).filter_by(username="auditor1").first()
    if not auditor:
        auditor = User(
            username="auditor1",
            password_hash=hash_password("auditor123"),
            role="auditor",
            is_active=True,
        )
        session.add(auditor)
        session.commit()
        print("Created auditor: username='auditor1', password='auditor123'")

    # 5. Check and seed 4 Sample Stalls & Operators
    sample_stalls = [
        ("STALL-01", "Burger & Fries Corner"),
        ("STALL-02", "Artisan Coffee & Chai"),
        ("STALL-03", "Street Tacos & Nachos"),
        ("STALL-04", "Ice Cream & Waffles"),
    ]
    for code, name in sample_stalls:
        stall = session.query(Stall).filter_by(stall_code=code).first()
        if not stall:
            stall = Stall(stall_code=code, name=name, is_active=True)
            session.add(stall)
            session.commit()
            
            # Create corresponding operator
            op_username = f"op_{code.lower().replace('-', '_')}"
            op_user = session.query(User).filter_by(username=op_username).first()
            if not op_user:
                op_user = User(
                    username=op_username,
                    password_hash=hash_password("operator123"),
                    role="stall_operator",
                    stall_id=stall.id,
                    is_active=True,
                )
                session.add(op_user)
                session.commit()
                print(f"Created Stall {code} ({name}) with operator '{op_username}'")
                
    session.close()
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    seed_database(reset=False)
