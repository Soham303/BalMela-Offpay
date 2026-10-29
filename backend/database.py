from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from sqlalchemy.engine import Engine

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
    if database_uri.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        
    _engine = create_engine(database_uri, echo=echo, connect_args=connect_args)
    _SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    db_session = scoped_session(_SessionFactory)
    return _engine

def get_db():
    if db_session is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return db_session
