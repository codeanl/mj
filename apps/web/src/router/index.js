import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
const workspaceRoutes = [
    { path: "", name: "home", component: () => import("@/views/HomeView.vue"), meta: { title: "创作" } },
    { path: "assets", name: "assets", component: () => import("@/views/AssetsView.vue"), meta: { title: "素材" } },
];
const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: "/",
            component: () => import("@/layouts/AppLayout.vue"),
            meta: { requiresAuth: true },
            children: workspaceRoutes,
        },
        { path: "/login", name: "login", component: () => import("@/views/LoginView.vue"), meta: { title: "登录", guestOnly: true } },
        { path: "/register", name: "register", component: () => import("@/views/RegisterView.vue"), meta: { title: "注册", guestOnly: true } },
        { path: "/:pathMatch(.*)*", redirect: "/" },
    ],
});
router.beforeEach(async (to) => {
    const auth = useAuthStore();
    await auth.ensureSession();
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
        return { name: "login", query: { redirect: to.fullPath } };
    }
    if (to.meta.guestOnly && auth.isAuthenticated) {
        return { name: "home" };
    }
});
router.afterEach((to) => {
    document.title = `${String(to.meta.title || "工作台")} · Nova Studio`;
});
export default router;
