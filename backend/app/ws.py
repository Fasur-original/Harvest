"""Live push channel to the operator console (PDD §13).

`manager.send_to_all` is the one thing that broadcasts to every connected
client. Phase 06 makes operator confirmation the only code path that calls it
for suggested matches; for now, a manual search "Confirm" click in the
operator console calls it directly to prove the pipe works end to end.
"""

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active.remove(websocket)

    async def send_to_all(self, message: dict) -> None:
        for websocket in self.active:
            await websocket.send_json(message)


manager = ConnectionManager()
