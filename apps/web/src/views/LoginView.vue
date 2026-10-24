<script setup lang="ts">
import { ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "@lucide/vue"

import BrandMark from "@/components/BrandMark.vue"
import { apiErrorMessage } from "@/services/http"
import { useAuthStore } from "@/stores/auth"

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const email = ref("")
const password = ref("")
const passwordVisible = ref(false)
const submitting = ref(false)
const errorMessage = ref("")

async function submit() {
  if (submitting.value) return
  errorMessage.value = ""
  submitting.value = true
  try {
    await auth.login({ email: email.value, password: password.value })
    const redirect = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/") ? route.query.redirect : "/"
    await router.replace(redirect)
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "登录失败")
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-visual" aria-label="Nova Studio">
      <div class="auth-brand auth-brand--light"><BrandMark /><strong>NOVA</strong><span>CREATOR STUDIO</span></div>
      <div class="auth-visual__copy">
        <p>CREATE WITHOUT LIMITS</p>
        <h1>让每一次灵感<br />都有清晰去处</h1>
      </div>
      <span class="auth-visual__foot">IMAGE · VIDEO · ASSETS</span>
    </section>

    <section class="auth-panel">
      <div class="auth-panel__inner">
        <div class="auth-brand auth-brand--mobile"><BrandMark /><strong>NOVA</strong></div>
        <p class="auth-eyebrow">WELCOME BACK</p>
        <h2>登录创作空间</h2>
        <span class="auth-subtitle">使用邮箱和密码继续你的创作。</span>

        <form class="auth-form" @submit.prevent="submit">
          <label>
            <span>邮箱</span>
            <span class="auth-input"><Mail :size="17" /><input v-model.trim="email" type="email" autocomplete="email" placeholder="name@example.com" required /></span>
          </label>
          <label>
            <span>密码</span>
            <span class="auth-input">
              <LockKeyhole :size="17" />
              <input v-model="password" :type="passwordVisible ? 'text' : 'password'" autocomplete="current-password" placeholder="输入密码" required />
              <button type="button" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" @click="passwordVisible = !passwordVisible">
                <EyeOff v-if="passwordVisible" :size="17" /><Eye v-else :size="17" />
              </button>
            </span>
          </label>

          <p v-if="errorMessage" class="auth-error" role="alert">{{ errorMessage }}</p>

          <button class="auth-submit" type="submit" :disabled="submitting">
            <span>{{ submitting ? "登录中…" : "登录" }}</span><ArrowRight :size="17" />
          </button>
        </form>

        <p class="auth-switch">还没有账号？ <RouterLink to="/register">创建账号</RouterLink></p>
      </div>
    </section>
  </main>
</template>

