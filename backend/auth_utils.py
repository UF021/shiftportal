from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from .config import get_settings
from . import models

settings  = get_settings()
pwd_ctx   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2    = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(p: str) -> str:
    return pwd_ctx.hash(p)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_token(user_id: int, org_id: Optional[int], role: str) -> str:
    payload = {
        "sub":  str(user_id),
        "org":  str(org_id) if org_id else None,
        "role": role,
        "exp":  datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    token: str = Depends(oauth2),
    db:    Session = Depends(get_db),
) -> models.User:
    payload = _decode(token)
    user = db.query(models.User).filter(models.User.id == int(payload["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def require_hr(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role not in (models.UserRole.hr, models.UserRole.superadmin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "HR access required")
    return user


def require_superadmin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != models.UserRole.superadmin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Superadmin access required")
    return user


def org_guard(user: models.User, org_id: int):
    """Ensure a non-superadmin user belongs to org_id."""
    if user.role == models.UserRole.superadmin:
        return  # superadmin sees all
    if user.organisation_id != org_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
