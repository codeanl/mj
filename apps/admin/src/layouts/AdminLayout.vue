<script setup lang="ts">
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  ChevronLeft,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileClock,
  Gauge,
  Menu,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
  X,
} from "@lucide/vue"

import BrandMark from "@/components/BrandMark.vue"
import { useAdminAuthStore } from "@/stores/auth"

const route = useRoute()
const router = useRouter()
const auth = useAdminAuthStore()
const mobileOpen = ref(false)
const collapsed = ref(false)

const groups = [
  { title: "经营分析", items: [{ label: "经营概览", path: "/overview", icon: Gauge }, { label: "用户管理", path: "/users", icon: UsersRound }] },
  { title: "AI 能力", items: [{ label: "模型渠道", path: "/channels", icon: Bot }, { label: "逻辑模型", path: "/models", icon: Database }, { label: "生成任务", path: "/generation", icon: Activity }] },
  { title: "平台运营", items: [{ label: "媒体资产", path: "/assets", icon: Boxes }, { label: "计费中心", path: "/billing", icon: CircleDollarSign }, { label: "内容运营", path: "/content", icon: ClipboardList }] },
  { title: "系统管理", items: [{ label: "审计日志", path: "/audit", icon: FileClock }, { label: "系统设置", path: "/settings", icon: Settings }] },
]

const title = computed(() => String(route.meta.title || "管理控制台"))
const description = computed(() => String(route.meta.description || ""))

async function logout() {
  auth.logout()
  await router.replace("/login")
}
</script>

<template>
  <div class="admin-shell" :class="{ 'admin-shell--collapsed': collapsed }">
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
        <div class="admin-header__search"><Search :size="16" /><span>搜索用户、任务或设置</span><kbd>Ctrl K</kbd></div>
        <button class="icon-button" type="button" aria-label="通知"><Bell :size="18" /></button>
        <span class="admin-header__status"><ShieldCheck :size="15" /> 系统正常</span>
      </header>

      <main class="admin-content">
        <div class="admin-page-heading">
          <div><p>NOVA CONSOLE</p><h1>{{ title }}</h1><span>{{ description }}</span></div>
        </div>
        <RouterView />
      </main>
    </div>
  </div>
</template>
