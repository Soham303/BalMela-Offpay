from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool, NullPool

Base = declarative_base()

_engine = None
_SessionFactory = None
db_session = None

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    # Enable WAL mode, busy timeout, and foreign keys for SQLite
    if "sqlite" in str(dbapi_connection.__class__).lower() or hasattr(dbapi_connection, "execute"):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=10000")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
        except Exception:
            pass

def init_db(database_uri, echo=False):
    global _engine, _SessionFactory, db_session
    connect_args = {}
    poolclass = None
    if database_uri.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        if ":memory:" in database_uri or database_uri == "sqlite://":
            poolclass = StaticPool
        else:
            poolclass = NullPool
        
    kwargs = {"echo": echo, "connect_args": connect_args}
    if poolclass:
        kwargs["poolclass"] = poolclass

    _engine = create_engine(database_uri, **kwargs)
    _SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    db_session = scoped_session(_SessionFactory)
    return _engine

def close_db(e=None):
    global db_session
    if db_session is not None:
        db_session.remove()



def get_db():
    global db_session
    if db_session is None:
        from flask import current_app
        try:
            if current_app and "SQLALCHEMY_DATABASE_URI" in current_app.config:
                init_db(current_app.config["SQLALCHEMY_DATABASE_URI"])
                return db_session
        except Exception:
            pass
        from backend.config import Config
        init_db(Config.SQLALCHEMY_DATABASE_URI)
    return db_session
