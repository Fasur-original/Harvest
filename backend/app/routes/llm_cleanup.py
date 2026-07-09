from fastapi import APIRouter
from pydantic import BaseModel

from app.matching import llm_cleanup_state
from app.ws import manager

router = APIRouter(prefix="/llm-cleanup", tags=["llm-cleanup"])


class ToggleRequest(BaseModel):
    enabled: bool


@router.get("/status")
async def get_status() -> dict:
    return llm_cleanup_state.get_status()


@router.post("/toggle")
async def toggle(payload: ToggleRequest) -> dict:
    # "Use AI cleanup for unclear speech" in Settings -- broadcast the new
    # status immediately so the operator console's live/idle indicator
    # updates without polling, same pattern every other live state change in
    # this app already uses.
    llm_cleanup_state.set_manual_enabled(payload.enabled)
    status = llm_cleanup_state.get_status()
    await manager.send_to_all({"type": "llm_cleanup_status", **status})
    return status
