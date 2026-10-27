"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const saved = localStorage.getItem("corper-register-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.dataset.theme = saved;
      setTheme(saved);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("corper-register-theme", next);
    setTheme(next);
  }
  return <button className="btn btn-ghost" type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? "Light mode" : "Dark mode"}</button>;
}
