import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"

import AppLayout from "@/layouts/AppLayout.vue"
import HomeView from "@/views/HomeView.vue"
import AssetsView from "@/views/AssetsView.vue"
import LoginView from "@/views/LoginView.vue"
import RegisterView from "@/views/RegisterView.vue"
import { useAuthStore } from "@/stores/auth"

const workspaceRoutes: Array<RouteRecordRaw> = [
  { path: "", name: "home", component: HomeView, meta: { title: "创作" } },
  { path: "assets", name: "assets", component: AssetsView, meta: { title: "素材" } },
]

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: AppLayout,
      meta: { requiresAuth: true },
      children: workspaceRoutes,
    },
    { path: "/login", name: "login", component: LoginView, meta: { title: "登录", guestOnly: true } },
    { path: "/register", name: "register", component: RegisterView, meta: { title: "注册", guestOnly: true } },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ensureSession()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: "home" }
  }
})

router.afterEach((to) => {
  document.title = `${String(to.meta.title || "工作台")} · Nova Studio`
})

export default router
