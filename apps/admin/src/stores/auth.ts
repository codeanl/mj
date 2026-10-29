import { defineStore } from "pinia"

import * as authApi from "@/services/auth"
import { ADMIN_ACCESS_TOKEN_KEY } from "@/services/http"

export const useAdminAuthStore = defineStore("admin-auth", {
  state: () => ({
    token: localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
    user: null as authApi.AdminUser | null,
    avatarObjectUrl: "",
    initialized: false,
  }),
  getters: {
    authenticated: (state) => Boolean(state.token && state.user?.role === "admin"),
  },
  actions: {
    async ensureSession() {
      if (this.initialized) return
      if (!this.token) {
        this.initialized = true
        return
      }
      try {
        const user = await authApi.currentUser()
        if (user.role !== "admin") throw new Error("需要管理员权限")
        this.user = user
        await this.refreshAvatar()
      } catch {
        this.clearSession()
      } finally {
        this.initialized = true
      }
    },
    async login(email: string, password: string) {
      const result = await authApi.login(email, password)
      if (result.user.role !== "admin") throw new Error("该账号没有管理员权限")
      this.token = result.accessToken
      this.user = result.user
      this.initialized = true
      localStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, result.accessToken)
      void this.refreshAvatar()
    },
    clearSession() {
      this.token = ""
      this.user = null
      this.revokeAvatar()
      this.initialized = true
      localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY)
    },
    async refreshAvatar() {
      this.revokeAvatar()
      if (!this.user?.avatarUrl) return
      try {
        this.avatarObjectUrl = URL.createObjectURL(await authApi.getAvatar())
      } catch {
        this.avatarObjectUrl = ""
      }
    },
    revokeAvatar() {
      if (this.avatarObjectUrl) URL.revokeObjectURL(this.avatarObjectUrl)
      this.avatarObjectUrl = ""
    },
    async logout() {
      try {
        if (this.token) await authApi.logout()
      } finally {
        this.clearSession()
      }
    },
  },
})
