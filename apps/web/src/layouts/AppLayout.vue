<script setup lang="ts">
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  Boxes,
  Clapperboard,
  CircleUserRound,
  Coins,
  House,
  LogOut,
  ListChecks,
  Menu,
  Moon,
  Sun,
  X,
} from "@lucide/vue"

import BrandMark from "@/components/BrandMark.vue"
import UserAvatar from "@/components/UserAvatar.vue"
import { useModalDialog } from "@/hooks/use-modal-dialog"
import { useAppStore } from "@/stores/app"
import { useAuthStore } from "@/stores/auth"

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const logoutConfirmationOpen = ref(false)
const logoutDialogPanel = ref<HTMLElement | null>(null)

useModalDialog(logoutConfirmationOpen, logoutDialogPanel, cancelLogout)

const primaryNavigation = [
  { label: "创作", path: "/", icon: House },
  { label: "素材", path: "/assets", icon: Boxes },
  { label: "任务中心", path: "/tasks", icon: ListChecks },
  { label: "个人中心", path: "/profile", icon: CircleUserRound },
]

const currentTitle = computed(() => String(route.meta.title || "创作工作台"))
const isActive = (path: string) => (path === "/" ? route.path === "/" : route.path.startsWith(path))

async function logout() {
  logoutConfirmationOpen.value = false
  await authStore.logout()
  await router.replace("/login")
}

function requestLogout() {
  appStore.closeMobileNavigation()
  logoutConfirmationOpen.value = true
}

function cancelLogout() {
  logoutConfirmationOpen.value = false
}

function formatPoints(value: number | undefined) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--dark': appStore.darkMode }">
    <aside class="sidebar" :class="{ 'sidebar--open': appStore.mobileNavigationOpen }">
      <div class="sidebar__brand">
        <BrandMark title="NOVA" />
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
          :title="item.label"
          :aria-label="item.label"
          @click="appStore.closeMobileNavigation"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar__bottom">
        <button class="sidebar-theme" type="button" :title="appStore.darkMode ? '切换浅色模式' : '切换暗黑模式'" :aria-label="appStore.darkMode ? '切换浅色模式' : '切换暗黑模式'" @click="appStore.toggleDarkMode">
          <Sun v-if="appStore.darkMode" :size="17" />
          <Moon v-else :size="17" />
          <span>{{ appStore.darkMode ? "浅色模式" : "暗黑模式" }}</span>
        </button>
        <div class="profile-strip">
          <RouterLink class="profile-strip__identity" to="/profile" title="个人中心" aria-label="个人中心" @click="appStore.closeMobileNavigation">
            <UserAvatar class="profile-strip__avatar" />
            <span class="profile-strip__copy">
            <strong>{{ authStore.user?.username }}</strong>
            <small>{{ authStore.user?.email }}</small>
            <small class="profile-strip__points" title="积分余额"><Coins :size="12" />{{ formatPoints(authStore.user?.pointsBalance) }} 积分</small>
            </span>
          </RouterLink>
          <div class="profile-strip__hover-card" role="status" aria-label="账号摘要">
            <strong>{{ authStore.user?.username || "未登录" }}</strong>
            <small>{{ authStore.user?.email || "" }}</small>
            <div><span>账号状态</span><em>{{ authStore.user?.status === "active" ? "正常" : "已停用" }}</em></div>
            <div><span>积分余额</span><em class="profile-strip__hover-points"><Coins :size="13" />{{ formatPoints(authStore.user?.pointsBalance) }}</em></div>
          </div>
          <button type="button" aria-label="退出登录" title="退出登录" @click="requestLogout"><LogOut :size="16" /></button>
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
      </header>

      <main class="page-scroll">
        <RouterView />
      </main>
    </section>

    <div v-if="logoutConfirmationOpen" class="logout-confirmation" @click.self="cancelLogout">
      <section ref="logoutDialogPanel" class="logout-confirmation__dialog" role="dialog" aria-modal="true" aria-labelledby="logout-confirmation-title" aria-describedby="logout-confirmation-description" tabindex="-1">
        <span class="logout-confirmation__icon"><LogOut :size="20" /></span>
        <h2 id="logout-confirmation-title">确认退出登录</h2>
        <p id="logout-confirmation-description">退出后需要重新登录才能继续创作。</p>
        <div class="logout-confirmation__actions">
          <button type="button" data-dialog-initial-focus @click="cancelLogout">取消</button>
          <button class="logout-confirmation__submit" type="button" @click="logout">退出登录</button>
        </div>
      </section>
    </div>
  </div>
</template>
