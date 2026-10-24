import { defineStore } from "pinia";
import * as authApi from "@/services/auth";
import { ADMIN_ACCESS_TOKEN_KEY } from "@/services/http";
export const useAdminAuthStore = defineStore("admin-auth", {
    state: () => ({
        token: localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY) || "",
        user: null,
        initialized: false,
    }),
    getters: {
        authenticated: (state) => Boolean(state.token && state.user?.role === "admin"),
    },
    actions: {
        async ensureSession() {
            if (this.initialized)
                return;
            if (!this.token) {
                this.initialized = true;
                return;
            }
            try {
                const user = await authApi.currentUser();
                if (user.role !== "admin")
                    throw new Error("需要管理员权限");
                this.user = user;
            }
            catch {
                this.logout();
            }
            finally {
                this.initialized = true;
            }
        },
        async login(email, password) {
            const result = await authApi.login(email, password);
            if (result.user.role !== "admin")
                throw new Error("该账号没有管理员权限");
            this.token = result.accessToken;
            this.user = result.user;
            this.initialized = true;
            localStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, result.accessToken);
        },
        logout() {
            this.token = "";
            this.user = null;
            this.initialized = true;
            localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
        },
    },
});
