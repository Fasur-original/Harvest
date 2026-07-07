import { useEffect, useState } from "react";

// Mirrors useState, but reads its initial value from (and writes every
// update back to) localStorage -- survives a full app/window reload, not
// just client-side route navigation. Lifting state to a parent component
// alone only solves navigation (a reload wipes all in-memory JS state no
// matter which component owns it); this is the piece that actually persists
// across that. Deliberately not used for state that would be misleading if
// stale after a real reload (a pending match suggestion tied to a specific
// moment of live speech, e.g.) -- see OperatorConsole.tsx for which state
// uses this and which doesn't, and why.
export function usePersistedState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable -- not worth failing the UI over.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
