import { createRouter, createWebHistory } from "vue-router"

import { useAdminAuthStore } from "@/stores/auth"

const adminSections = [
  ["dashboard", "经营总览", "集中查看平台增长、生成质量、积分消耗和运行告警。"],
  ["users", "用户管理", "管理用户账户、状态、角色和权益。"],
  ["channels", "模型渠道", "配置供应商、密钥、模型目录和路由。"],
	["generation", "生成任务", "追踪生成状态、上游渠道、积分与失败原因。"],
  ["points", "积分规则", "配置新用户积分、模型基础扣费和生成参数倍率。"],
  ["audit", "操作审计", "追踪管理员敏感操作、目标、请求来源和变更快照。"],
] as const

const sectionComponents = {
  dashboard: () => import("@/views/DashboardView.vue"),
  users: () => import("@/views/UsersView.vue"),
  channels: () => import("@/views/ChannelsView.vue"),
  generation: () => import("@/views/GenerationTasksView.vue"),
  points: () => import("@/views/PointsRulesView.vue"),
  audit: () => import("@/views/AuditLogView.vue"),
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: () => import("@/layouts/AdminLayout.vue"),
      meta: { requiresAdmin: true },
      redirect: "/dashboard",
      children: [
        ...adminSections.map(([path, title, description]) => ({
          path,
		  component: sectionComponents[path],
          meta: { title, description },
        })),
        { path: ":pathMatch(.*)*", component: () => import("@/views/NotFoundView.vue"), meta: { title: "页面不存在", description: "请求的管理页面不存在或已经移动。" } },
      ],
    },
    { path: "/login", component: () => import("@/views/LoginView.vue"), meta: { title: "管理员登录", guestOnly: true } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAdminAuthStore()
  await auth.ensureSession()
  if (to.meta.requiresAdmin && !auth.authenticated) return "/login"
  if (to.meta.guestOnly && auth.authenticated) return "/dashboard"
})

router.afterEach((to) => {
  document.title = `${String(to.meta.title || "控制台")} · Nova Console`
})

export default router
