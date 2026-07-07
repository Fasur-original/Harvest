import { create } from "zustand";

const WS_URL = "ws://localhost:8000/ws";
const RECONNECT_DELAY_MS = 2000;

type SocketState = {
  lastMessage: unknown;
  connected: boolean;
  send: (data: unknown) => void;
};

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

export const useSocketStore = create<SocketState>(() => ({
  lastMessage: null,
  connected: false,
  send: (data: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  },
}));

function connect() {
  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => useSocketStore.setState({ connected: true });
  socket.onmessage = (event) => useSocketStore.setState({ lastMessage: JSON.parse(event.data) });
  socket.onclose = () => {
    useSocketStore.setState({ connected: false });
    // Reconnect rather than leaving the connection dead mid-service.
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  };
  socket.onerror = () => socket.close();
}

// A zustand store is a plain module-level singleton (unlike the old
// useBackendSocket hook, which opened a fresh connection per component that
// called it) -- this starts the one connection this window needs as soon as
// the store is first imported, not tied to any component's mount lifecycle.
// The operator window and the display window are separate Tauri webviews
// with entirely separate JS contexts, so each still gets exactly one
// connection of its own.
connect();

// Exposed for completeness/tests -- not needed by ordinary consumers, who
// should just use the store's `send`.
export function _disconnectForTesting() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
}
