import { defineStore } from "pinia"

export const useAppStore = defineStore("app", {
  state: () => ({
    mobileNavigationOpen: false,
    darkMode: localStorage.getItem("nova.color-scheme") === "dark",
  }),
  actions: {
    toggleMobileNavigation() {
      this.mobileNavigationOpen = !this.mobileNavigationOpen
    },
    closeMobileNavigation() {
      this.mobileNavigationOpen = false
    },
    toggleDarkMode() {
      this.darkMode = !this.darkMode
      localStorage.setItem("nova.color-scheme", this.darkMode ? "dark" : "light")
    },
  },
})
