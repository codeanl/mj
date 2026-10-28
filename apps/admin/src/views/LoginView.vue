<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { ArrowRight, LockKeyhole, Mail, Moon, Sun } from "@lucide/vue"

import BrandMark from "@/components/BrandMark.vue"
import { useAdminAuthStore } from "@/stores/auth"
import { useAdminThemeStore } from "@/stores/theme"

const auth = useAdminAuthStore()
const theme = useAdminThemeStore()
const router = useRouter()
const email = ref("")
const password = ref("")
const submitting = ref(false)
const error = ref("")

async function submit() {
  if (submitting.value) return
  submitting.value = true
  error.value = ""
  try {
    await auth.login(email.value.trim(), password.value)
    await router.replace("/dashboard")
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "登录失败"
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="admin-login-page">
    <button class="icon-button admin-login-theme" type="button" :title="theme.isDark ? '切换至浅色模式' : '切换至暗色模式'" :aria-label="theme.isDark ? '切换至浅色模式' : '切换至暗色模式'" @click="theme.toggle()"><Sun v-if="theme.isDark" :size="18" /><Moon v-else :size="18" /></button>
    <form class="admin-login-panel" @submit.prevent="submit">
      <div class="admin-login-brand"><BrandMark /><span><strong>NOVA</strong><small>管理控制台</small></span></div>
      <p>ADMIN CONSOLE</p>
      <h1>管理员登录</h1>
      <span class="admin-login-hint">使用管理员账号管理模型渠道与平台配置。</span>
      <label><span>邮箱</span><span class="admin-login-input"><Mail :size="17" /><input v-model="email" type="email" autocomplete="email" required /></span></label>
      <label><span>密码</span><span class="admin-login-input"><LockKeyhole :size="17" /><input v-model="password" type="password" autocomplete="current-password" required /></span></label>
      <div v-if="error" class="admin-login-error" role="alert">{{ error }}</div>
      <button type="submit" class="admin-login-submit" :disabled="submitting"><span>{{ submitting ? "登录中" : "登录" }}</span><ArrowRight :size="17" /></button>
    </form>
  </main>
</template>
