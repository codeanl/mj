import { createRouter, createWebHistory } from "vue-router"

import { useAdminAuthStore } from "@/stores/auth"

const adminSections = [
  ["users", "用户管理", "管理用户账户、状态、角色和权益。"],
  ["channels", "模型渠道", "配置供应商、密钥、模型目录和路由。"],
  ["points", "积分规则", "配置新用户积分、模型基础扣费和生成参数倍率。"],
] as const

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: () => import("@/layouts/AdminLayout.vue"),
      meta: { requiresAdmin: true },
      redirect: "/users",
      children: adminSections.map(([path, title, description]) => ({
        path,
        component: path === "channels" ? () => import("@/views/ChannelsView.vue") : path === "users" ? () => import("@/views/UsersView.vue") : () => import("@/views/PointsRulesView.vue"),
        meta: { title, description },
      })),
    },
    { path: "/login", component: () => import("@/views/LoginView.vue"), meta: { title: "管理员登录", guestOnly: true } },
    { path: "/:pathMatch(.*)*", redirect: "/users" },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAdminAuthStore()
  await auth.ensureSession()
  if (to.meta.requiresAdmin && !auth.authenticated) return "/login"
  if (to.meta.guestOnly && auth.authenticated) return "/channels"
})

router.afterEach((to) => {
  document.title = `${String(to.meta.title || "控制台")} · Nova Console`
})

export default router
