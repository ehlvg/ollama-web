import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "ollama_web_theme";

function getStoredTheme(): ThemeMode {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark =
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  const shouldUseDark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", shouldUseDark);
  root.style.colorScheme = shouldUseDark ? "dark" : "light";
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) callback();
  };
  const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onMql = () => callback();

  window.addEventListener("storage", onStorage);
  mql?.addEventListener?.("change", onMql);

  return () => {
    window.removeEventListener("storage", onStorage);
    mql?.removeEventListener?.("change", onMql);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => getStoredTheme(),
    () => "system" as ThemeMode,
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    applyTheme(mode);
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
  }, []);

  return useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme],
  );
}

