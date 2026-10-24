import { createRouter, createWebHistory } from "vue-router";
import AdminLayout from "@/layouts/AdminLayout.vue";
import EmptyAdminView from "@/views/EmptyAdminView.vue";
const adminSections = [
    ["overview", "经营概览", "查看平台运行与业务核心指标。"],
    ["users", "用户管理", "管理用户账户、状态、角色和权益。"],
    ["channels", "模型渠道", "配置供应商、密钥、模型目录和路由。"],
    ["models", "逻辑模型", "统一管理对外模型与能力参数。"],
    ["generation", "生成任务", "追踪图片、视频、音频和 Agent 任务。"],
    ["assets", "媒体资产", "管理本地及对象存储中的媒体文件。"],
    ["billing", "计费中心", "配置套餐、额度、订单与支付渠道。"],
    ["content", "内容运营", "管理公告、模板、提示词与公开内容。"],
    ["audit", "审计日志", "查询管理员操作与安全事件。"],
    ["settings", "系统设置", "配置站点、注册、安全与运行参数。"],
];
const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: "/",
            component: AdminLayout,
            redirect: "/overview",
            children: adminSections.map(([path, title, description]) => ({
                path,
                component: EmptyAdminView,
                meta: { title, description },
            })),
        },
    ],
});
router.afterEach((to) => {
    document.title = `${String(to.meta.title || "控制台")} · Nova Console`;
});
export default router;
