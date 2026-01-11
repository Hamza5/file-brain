"""
Database base configuration and setup
"""

from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from file_brain.core.paths import app_paths

Base = declarative_base()

# Database setup


# Database setup
DATABASE_PATH = str(app_paths.database_file)
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def db_session():
    """
    Context manager for database sessions.

    Usage:
        with db_session() as db:
            repo = SomeRepository(db)
            # ... do work
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_default_data(db):
    """Initialize default data"""
    from .crawler_state import CrawlerState
    from .setting import Setting

    # Initialize crawler state if not exists
    state = db.query(CrawlerState).filter(CrawlerState.id == 1).first()
    if not state:
        state = CrawlerState(id=1)
        db.add(state)

    # Initialize default settings if not exist
    default_settings = {
        "max_file_size_mb": "100",
        "batch_size": "10",
        "worker_queue_size": "1000",
        # Initial scan settings removed - now uses auto-resume based on previous state
    }

    for key, value in default_settings.items():
        existing = db.query(Setting).filter(Setting.key == key).first()
        if not existing:
            setting = Setting(key=key, value=value)
            db.add(setting)

    db.commit()
