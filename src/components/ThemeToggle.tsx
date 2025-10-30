"use client";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button className="btn-icon" aria-label="Cambiar tema" title={isDark ? "Claro" : "Oscuro"} onClick={toggle}>
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8 1.8-1.8zM1 13h3v-2H1v2zm10-9h2V1h-2v3zm7.07 2.76l1.79-1.8-1.79-1.79-1.8 1.79 1.8 1.8zM20 13h3v-2h-3v2zm-8 8h2v-3h-2v3zm-6.24-2.76l-1.8 1.8 1.8 1.79 1.79-1.79-1.79-1.8zM17.24 19.24l1.79 1.79 1.8-1.79-1.8-1.8-1.79 1.8zM12 6a6 6 0 100 12 6 6 0 000-12z"/></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.64 13A9 9 0 1111 2.36 7 7 0 1021.64 13z"/></svg>
      )}
    </button>
  );
}
