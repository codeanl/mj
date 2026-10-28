<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import {
	Activity,
  Bot,
  ChevronLeft,
  CircleDollarSign,
  Gift,
  Menu,
  LayoutDashboard,
  LogOut,
  Moon,
  ScrollText,
  Sun,
  UsersRound,
  X,
} from "@lucide/vue"

import BrandMark from "@/components/BrandMark.vue"
import { useAdminAuthStore } from "@/stores/auth"
import { useAdminThemeStore } from "@/stores/theme"

const router = useRouter()
const auth = useAdminAuthStore()
const theme = useAdminThemeStore()
const mobileOpen = ref(false)
const collapsed = ref(false)

const groups = [
  { title: "经营分析", items: [{ label: "经营总览", path: "/dashboard", icon: LayoutDashboard }] },
  { title: "财务管理", items: [{ label: "积分规则", path: "/points", icon: CircleDollarSign }, { label: "CDK 管理", path: "/cdk", icon: Gift }] },
	{ title: "上游配置", items: [{ label: "模型渠道", path: "/channels", icon: Bot }, { label: "生成任务", path: "/generation", icon: Activity }] },
  { title: "系统管理", items: [{ label: "用户管理", path: "/users", icon: UsersRound }, { label: "操作审计", path: "/audit", icon: ScrollText }] },
]

async function logout() {
  try {
    await auth.logout()
  } finally {
    await router.replace("/login")
  }
}
</script>

<template>
  <div class="admin-shell" :class="{ 'admin-shell--collapsed': collapsed, 'admin-shell--dark': theme.isDark }">
    <aside class="admin-sidebar" :class="{ 'admin-sidebar--open': mobileOpen }">
      <div class="admin-brand">
        <BrandMark />
        <span v-if="!collapsed"><strong>NOVA</strong><small>管理控制台</small></span>
        <button class="icon-button mobile-only" type="button" aria-label="关闭菜单" @click="mobileOpen = false"><X :size="18" /></button>
      </div>

      <nav class="admin-nav" aria-label="后台导航">
        <section v-for="group in groups" :key="group.title">
          <h2 v-if="!collapsed">{{ group.title }}</h2>
          <RouterLink v-for="item in group.items" :key="item.path" :to="item.path" :title="collapsed ? item.label : undefined" @click="mobileOpen = false">
            <component :is="item.icon" :size="17" />
            <span v-if="!collapsed">{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>

      <div class="admin-user">
        <span class="admin-user__avatar">{{ auth.user?.username?.charAt(0).toUpperCase() || "A" }}</span>
        <span v-if="!collapsed"><strong>{{ auth.user?.username || "平台管理员" }}</strong><small>管理员</small></span>
        <button v-if="!collapsed" class="icon-button" type="button" aria-label="退出登录" @click="logout"><LogOut :size="16" /></button>
      </div>
    </aside>

    <button v-if="mobileOpen" class="admin-backdrop" type="button" aria-label="关闭菜单" @click="mobileOpen = false" />

    <div class="admin-main">
      <header class="admin-header">
        <button class="icon-button desktop-only" type="button" :aria-label="collapsed ? '展开侧栏' : '收起侧栏'" @click="collapsed = !collapsed"><ChevronLeft :size="18" /></button>
        <button class="icon-button mobile-only" type="button" aria-label="打开菜单" @click="mobileOpen = true"><Menu :size="19" /></button>
        <div class="admin-header__spacer" />
        <button class="icon-button" type="button" :title="theme.isDark ? '切换至浅色模式' : '切换至暗色模式'" :aria-label="theme.isDark ? '切换至浅色模式' : '切换至暗色模式'" @click="theme.toggle()"><Sun v-if="theme.isDark" :size="18" /><Moon v-else :size="18" /></button>
      </header>

      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>
