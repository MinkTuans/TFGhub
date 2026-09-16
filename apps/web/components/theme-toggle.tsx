"use client";

import { useSyncExternalStore } from "react";

// Keep the legacy "system" storage value for the TFG default night theme.
type ThemePreference = "system" | "light" | "dark";

const preferences: ThemePreference[] = ["system", "light", "dark"];
const labels: Record<ThemePreference, string> = {
  system: "mặc định TFG",
  light: "sáng",
  dark: "tối",
};

const listeners = new Set<() => void>();

function getDocumentPreference(): ThemePreference {
  const theme = document.documentElement.dataset.theme;
  return preferences.includes(theme as ThemePreference)
    ? (theme as ThemePreference)
    : "system";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getServerPreference(): ThemePreference {
  return "system";
}

function notifyThemeChange() {
  listeners.forEach((listener) => listener());
}

function applyTheme(preference: ThemePreference) {
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = preference;
  }
  notifyThemeChange();
}

export function ThemeToggle() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribe,
    getDocumentPreference,
    getServerPreference,
  );

  function cycleTheme() {
    const nextPreference =
      preferences[
        (preferences.indexOf(preference) + 1) % preferences.length
      ];
    applyTheme(nextPreference);
    try {
      window.localStorage.setItem("tfg-theme", nextPreference);
    } catch {
      // Private browsing and embedded webviews may deny storage access.
    }
  }

  return (
    <button
      aria-label={`Giao diện: ${labels[preference]}`}
      className="theme-toggle"
      onClick={cycleTheme}
      title={`Giao diện: ${labels[preference]}`}
      type="button"
    >
      <span aria-hidden="true">◐</span>
      <span className="theme-toggle__label">Giao diện</span>
    </button>
  );
}
