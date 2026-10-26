import { defineStore } from "pinia";
import * as authApi from "@/services/auth";
import { ACCESS_TOKEN_KEY } from "@/services/http";
import { getPointWallet } from "@/services/points";
export const useAuthStore = defineStore("auth", {
    state: () => ({
        token: localStorage.getItem(ACCESS_TOKEN_KEY) || "",
        user: null,
        avatarObjectUrl: "",
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
                await this.refreshAvatar();
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
        setPointsBalance(pointsBalance) {
            if (this.user)
                this.user = { ...this.user, pointsBalance };
        },
        async updateProfile(username) {
            this.user = await authApi.updateProfile({ username });
        },
        async updateAvatar(file) {
            this.user = await authApi.updateAvatar(file);
            await this.refreshAvatar();
        },
        async removeAvatar() {
            this.user = await authApi.removeAvatar();
            this.revokeAvatar();
        },
        async refreshAvatar() {
            this.revokeAvatar();
            if (!this.user?.avatarUrl)
                return;
            try {
                this.avatarObjectUrl = URL.createObjectURL(await authApi.getAvatar());
            }
            catch {
                this.avatarObjectUrl = "";
            }
        },
        revokeAvatar() {
            if (this.avatarObjectUrl)
                URL.revokeObjectURL(this.avatarObjectUrl);
            this.avatarObjectUrl = "";
        },
        async refreshPointsBalance() {
            if (!this.user)
                return;
            const wallet = await getPointWallet();
            this.user = { ...this.user, pointsBalance: wallet.balance };
        },
        applySession(result) {
            this.token = result.accessToken;
            this.user = result.user;
            this.initialized = true;
            localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
            void this.refreshAvatar();
        },
        clearSession() {
            this.token = "";
            this.user = null;
            this.revokeAvatar();
            this.initialized = true;
            localStorage.removeItem(ACCESS_TOKEN_KEY);
        },
    },
});
