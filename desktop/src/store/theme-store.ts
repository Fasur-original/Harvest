import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

type ThemeState = {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
};

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // Matches the OS preference on first launch (no saved choice yet),
      // same default this app used before an explicit toggle existed.
      theme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      toggle: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        applyTheme(next);
        set({ theme: next });
      },
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: "harvest:theme",
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

// Apply immediately on module load too -- onRehydrateStorage only fires
// once persisted state is read back, which can be a tick after this module
// evaluates; applying the current in-memory value right away avoids a
// flash of the wrong theme on first paint.
applyTheme(useThemeStore.getState().theme);
