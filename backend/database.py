from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import get_settings

settings = get_settings()

url = settings.database_url
if url.startswith("postgres://"):
    url = url.replace("postgres://", "postgresql://", 1)

engine = create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
