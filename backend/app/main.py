# app/main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
# from app.api.v1.router import api_router
# from app.core.exceptions import AppException


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up...")
    yield
    print("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# app.include_router(api_router, prefix="/api/v1")


# @app.exception_handler(AppException)
# async def app_exception_handler(request: Request, exc: AppException):
#     return JSONResponse(
#         status_code=exc.status_code,
#         content={"success": False, "message": exc.message, "errors": exc.errors}
#     )


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
