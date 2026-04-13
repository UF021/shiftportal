from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import engine, Base
from routers import auth, staff, registrations, timelogs, holidays, organisations, superadmin


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title       = "ShiftPortal API",
    description = "Multi-tenant staff management platform",
    version     = "1.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["https://shiftportal.vercel.app", "http://localhost:5173", "*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(auth.router,          prefix="/api/auth",          tags=["Auth"])
app.include_router(staff.router,         prefix="/api/staff",         tags=["Staff"])
app.include_router(registrations.router, prefix="/api/registrations", tags=["Registrations"])
app.include_router(timelogs.router,      prefix="/api/timelogs",      tags=["Timelogs"])
app.include_router(holidays.router,      prefix="/api/holidays",      tags=["Holidays"])
app.include_router(organisations.router, prefix="/api/orgs",          tags=["Organisations"])
app.include_router(superadmin.router,    prefix="/api/superadmin",    tags=["Superadmin"])


@app.get("/")
def root():
    return {"service": "ShiftPortal API", "version": "1.0.0", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
