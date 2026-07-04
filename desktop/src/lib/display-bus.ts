import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

const DISPLAY_UPDATE_EVENT = "display:update";

export type DisplayContent = {
  kind: "verse" | "song";
  text: string;
};

export function pushToDisplay(content: DisplayContent) {
  return emit(DISPLAY_UPDATE_EVENT, content);
}

export function onDisplayUpdate(
  handler: (content: DisplayContent) => void,
): Promise<UnlistenFn> {
  return listen<DisplayContent>(DISPLAY_UPDATE_EVENT, (event) => handler(event.payload));
}
