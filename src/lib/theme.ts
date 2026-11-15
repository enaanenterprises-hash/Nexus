"use client";

import { useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "nexus:theme.v1";
const listeners = new Set<() => void>();
let cachedTheme: ThemeMode = "dark";
let initialized = false;

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // Ignore storage access errors in restricted contexts.
  }
  return "dark";
}

function syncDocumentAttr(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.dashTheme = theme;
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  cachedTheme = readStoredTheme();
  syncDocumentAttr(cachedTheme);
}

export function getTheme(): ThemeMode {
  ensureInit();
  return cachedTheme;
}

export function setTheme(next: ThemeMode) {
  ensureInit();
  if (cachedTheme === next) return;
  cachedTheme = next;
  syncDocumentAttr(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore storage write errors.
  }
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

function subscribe(listener: () => void) {
  ensureInit();
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) {
      cachedTheme = event.newValue;
      syncDocumentAttr(cachedTheme);
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme(): {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
} {
  const theme = useSyncExternalStore<ThemeMode>(subscribe, getTheme, () => "dark");
  return { theme, setTheme, toggleTheme };
}
