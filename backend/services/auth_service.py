import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from backend.config import Config
from backend.database import get_db
from backend.models import User

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def check_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def get_jwt_secret():
    from flask import current_app
    try:
        if current_app:
            return current_app.config.get("JWT_SECRET_KEY", Config.JWT_SECRET_KEY)
    except Exception:
        pass
    return Config.JWT_SECRET_KEY

def generate_jwt_token(user: User) -> str:
    expire_time = datetime.now(timezone.utc) + timedelta(minutes=Config.JWT_ACCESS_TOKEN_EXPIRES_MINUTES)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "stall_id": user.stall_id,
        "exp": expire_time,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")

def decode_jwt_token(token: str):
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def authenticate_user(username: str, password: str):
    session = get_db()
    user = session.query(User).filter_by(username=username).first()
    if not user or not user.is_active:
        return None
    if not check_password(password, user.password_hash):
        return None
        
    user.last_login_at = datetime.now(timezone.utc)
    session.commit()
    return user
