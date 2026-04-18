"""FastAPI application factory for the bookbridge worker service."""

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from bookbridge.worker_api.routes import router


def create_app() -> FastAPI:
    app = FastAPI(title="BookBridge Worker", version="0.1.0")

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return await request_validation_exception_handler(request, exc)

    @app.exception_handler(Exception)
    async def _generic_error(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "Internal server error."})

    app.include_router(router)
    return app


app = create_app()
