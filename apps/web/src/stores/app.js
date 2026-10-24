import { defineStore } from "pinia";
export const useAppStore = defineStore("app", {
    state: () => ({
        mobileNavigationOpen: false,
        notifications: 2,
    }),
    actions: {
        toggleMobileNavigation() {
            this.mobileNavigationOpen = !this.mobileNavigationOpen;
        },
        closeMobileNavigation() {
            this.mobileNavigationOpen = false;
        },
    },
});
