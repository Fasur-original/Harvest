"""Tracks the LLM cleanup step's live enable/disable state -- the operator
console's "live/idle" indicator (separate from the main WS connection
status) reads this, and it's what actually gates every call in
llm_cleanup.py, not just a display value.

Deliberately an in-process module-level singleton, same pattern as
app.ws's ConnectionManager and app.matching.display_state -- live-session
state for a single running desktop instance.
"""

from __future__ import annotations

_manual_enabled = True
_auto_disabled_reason: str | None = None
_last_call_timed_out = False


def set_manual_enabled(value: bool) -> None:
    global _manual_enabled
    _manual_enabled = value


def set_auto_disabled(reason: str | None) -> None:
    """Called once at startup (see app/main.py's lifespan) after checking
    available RAM -- a reason here overrides the manual toggle regardless of
    its value, since it reflects a real hardware constraint, not a
    preference.
    """
    global _auto_disabled_reason
    _auto_disabled_reason = reason


def record_success() -> None:
    global _last_call_timed_out
    _last_call_timed_out = False


def record_timeout_or_error() -> None:
    global _last_call_timed_out
    _last_call_timed_out = True


def is_enabled() -> bool:
    return _manual_enabled and _auto_disabled_reason is None


def get_status() -> dict:
    return {
        "enabled": is_enabled(),
        "manual_enabled": _manual_enabled,
        "auto_disabled_reason": _auto_disabled_reason,
        "last_call_timed_out": _last_call_timed_out,
    }
