import { defineStore } from "pinia";
import * as authApi from "@/services/auth";
import { ACCESS_TOKEN_KEY } from "@/services/http";
export const useAuthStore = defineStore("auth", {
    state: () => ({
        token: localStorage.getItem(ACCESS_TOKEN_KEY) || "",
        user: null,
        initialized: false,
    }),
    getters: {
        isAuthenticated: (state) => Boolean(state.token && state.user),
        userInitial: (state) => state.user?.username.trim().charAt(0).toLocaleUpperCase() || "N",
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
                this.user = await authApi.getCurrentUser();
            }
            catch {
                this.clearSession();
            }
            finally {
                this.initialized = true;
            }
        },
        async register(input) {
            const result = await authApi.register(input);
            this.applySession(result);
        },
        async login(input) {
            const result = await authApi.login(input);
            this.applySession(result);
        },
        logout() {
            this.clearSession();
        },
        applySession(result) {
            this.token = result.accessToken;
            this.user = result.user;
            this.initialized = true;
            localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
        },
        clearSession() {
            this.token = "";
            this.user = null;
            this.initialized = true;
            localStorage.removeItem(ACCESS_TOKEN_KEY);
        },
    },
});
