import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useTheme = create(
  persist(
    (set) => ({
      theme: "dark",
      toggle: () => set(s => {
        const next = s.theme === "dark" ? "light" : "dark";
        document.documentElement.classList.toggle("light", next === "light");
        return { theme: next };
      }),
      init: () => {
        const saved = JSON.parse(localStorage.getItem("theme-store") || "{}");
        const t = saved?.state?.theme ?? "dark";
        document.documentElement.classList.toggle("light", t === "light");
      },
    }),
    { name: "theme-store" }
  )
);