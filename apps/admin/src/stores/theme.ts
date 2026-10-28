import { defineStore } from "pinia"

export type AdminTheme = "light" | "dark"

const THEME_KEY = "nova.admin_theme"

function initialTheme(): AdminTheme {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === "light" || saved === "dark") return saved
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export const useAdminThemeStore = defineStore("admin-theme", {
  state: () => ({ theme: initialTheme() as AdminTheme }),
  getters: {
    isDark: (state) => state.theme === "dark",
  },
  actions: {
    apply() {
      document.documentElement.classList.toggle("dark", this.isDark)
      document.documentElement.style.colorScheme = this.theme
    },
    setTheme(theme: AdminTheme) {
      this.theme = theme
      localStorage.setItem(THEME_KEY, theme)
      this.apply()
    },
    toggle() {
      this.setTheme(this.isDark ? "light" : "dark")
    },
  },
})
