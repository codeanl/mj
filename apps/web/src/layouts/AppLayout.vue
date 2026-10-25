<script setup lang="ts">
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  Boxes,
  Clapperboard,
  Coins,
  House,
  LogOut,
  Menu,
  X,
} from "@lucide/vue"

import BrandMark from "@/components/BrandMark.vue"
import { useAppStore } from "@/stores/app"
import { useAuthStore } from "@/stores/auth"

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()

const primaryNavigation = [
  { label: "创作", path: "/", icon: House },
  { label: "素材", path: "/assets", icon: Boxes },
]

const currentTitle = computed(() => String(route.meta.title || "创作工作台"))
const isActive = (path: string) => (path === "/" ? route.path === "/" : route.path.startsWith(path))

async function logout() {
  authStore.logout()
  await router.replace("/login")
}

function formatPoints(value: number | undefined) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ 'sidebar--open': appStore.mobileNavigationOpen }">
      <div class="sidebar__brand">
        <BrandMark />
        <div>
          <strong>NOVA</strong>
          <span>CREATOR STUDIO</span>
        </div>
        <button class="icon-button sidebar__close" type="button" aria-label="关闭导航" @click="appStore.closeMobileNavigation">
          <X :size="18" />
        </button>
      </div>

      <nav class="sidebar__nav" aria-label="主要导航">
        <RouterLink
          v-for="item in primaryNavigation"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ 'nav-item--active': isActive(item.path) }"
          @click="appStore.closeMobileNavigation"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar__bottom">
        <div class="profile-strip">
          <span class="profile-strip__avatar">{{ authStore.userInitial }}</span>
          <span class="profile-strip__copy">
            <strong>{{ authStore.user?.username }}</strong>
            <small>{{ authStore.user?.email }}</small>
            <small class="profile-strip__points" title="积分余额"><Coins :size="12" />{{ formatPoints(authStore.user?.pointsBalance) }} 积分</small>
          </span>
          <button type="button" aria-label="退出登录" title="退出登录" @click="logout"><LogOut :size="16" /></button>
        </div>
      </div>
    </aside>

    <button
      v-if="appStore.mobileNavigationOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航"
      @click="appStore.closeMobileNavigation"
    />

    <section class="app-main">
      <header class="mobile-header">
        <button class="icon-button" type="button" aria-label="打开导航" @click="appStore.toggleMobileNavigation">
          <Menu :size="20" />
        </button>
        <div class="mobile-header__title">
          <Clapperboard :size="17" />
          <span>{{ currentTitle }}</span>
        </div>
        <span class="mobile-user-balance"><Coins :size="13" />{{ formatPoints(authStore.user?.pointsBalance) }}</span>
        <span class="profile-strip__avatar profile-strip__avatar--small">{{ authStore.userInitial }}</span>
      </header>

      <main class="page-scroll">
        <RouterView />
      </main>
    </section>
  </div>
</template>
