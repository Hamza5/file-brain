"""
Database base configuration and setup
"""
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

# Database setup
DATABASE_URL = "sqlite:///./file_brain.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # Needed for SQLite
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


def init_default_data(db):
    """Initialize default data"""
    from .watch_path import WatchPath
    from .setting import Setting
    from .crawler_state import CrawlerState
    
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