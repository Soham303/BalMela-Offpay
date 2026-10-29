import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "festtoken-dev-secret-key-change-in-production-2026")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "festtoken-jwt-secret-key-change-in-production-2026")
    JWT_ACCESS_TOKEN_EXPIRES_MINUTES = int(os.getenv("SESSION_TIMEOUT_MINUTES", "480"))
    
    # Database
    INSTANCE_DIR = BASE_DIR / "instance"
    INSTANCE_DIR.mkdir(exist_ok=True)
    DEFAULT_DB_PATH = f"sqlite:///{INSTANCE_DIR}/festtoken.db"
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", DEFAULT_DB_PATH)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Rate Limiting
    RATE_LIMIT_LOGIN_ATTEMPTS = int(os.getenv("RATE_LIMIT_LOGIN_ATTEMPTS", "10"))
    RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_SECRET_KEY = "test-jwt-secret-key-minimum-32-bytes-long-for-hmac"
    SECRET_KEY = "test-secret-key-minimum-32-bytes-long"
