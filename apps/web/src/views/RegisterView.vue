<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "@lucide/vue"

import BrandMark from "@/components/BrandMark.vue"
import { apiErrorMessage } from "@/services/http"
import { useAuthStore } from "@/stores/auth"

const router = useRouter()
const auth = useAuthStore()

const username = ref("")
const email = ref("")
const password = ref("")
const confirmPassword = ref("")
const passwordVisible = ref(false)
const submitting = ref(false)
const errorMessage = ref("")

async function submit() {
  if (submitting.value) return
  errorMessage.value = ""
  if (password.value !== confirmPassword.value) {
    errorMessage.value = "两次输入的密码不一致"
    return
  }
  submitting.value = true
  try {
    await auth.register({ email: email.value, username: username.value, password: password.value })
    await router.replace("/")
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "注册失败")
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-visual auth-visual--register" aria-label="Nova Studio">
      <div class="auth-brand auth-brand--light"><BrandMark /><strong>NOVA</strong><span>CREATOR STUDIO</span></div>
      <div class="auth-visual__copy">
        <p>YOUR CREATIVE WORKSPACE</p>
        <h1>从一张画面开始<br />建立你的作品库</h1>
      </div>
      <span class="auth-visual__foot">BUILD · CREATE · ORGANIZE</span>
    </section>

    <section class="auth-panel">
      <div class="auth-panel__inner">
        <div class="auth-brand auth-brand--mobile"><BrandMark /><strong>NOVA</strong></div>
        <p class="auth-eyebrow">CREATE ACCOUNT</p>
        <h2>创建创作账号</h2>
        <span class="auth-subtitle">邮箱将作为唯一登录凭证。</span>

        <form class="auth-form" @submit.prevent="submit">
          <label>
            <span>用户名</span>
            <span class="auth-input"><UserRound :size="17" /><input v-model.trim="username" type="text" autocomplete="username" minlength="2" maxlength="32" placeholder="你的显示名称" required /></span>
          </label>
          <label>
            <span>邮箱</span>
            <span class="auth-input"><Mail :size="17" /><input v-model.trim="email" type="email" autocomplete="email" placeholder="name@example.com" required /></span>
          </label>
          <label>
            <span>密码</span>
            <span class="auth-input">
              <LockKeyhole :size="17" />
              <input v-model="password" :type="passwordVisible ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="72" placeholder="至少 8 位密码" required />
              <button type="button" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" @click="passwordVisible = !passwordVisible">
                <EyeOff v-if="passwordVisible" :size="17" /><Eye v-else :size="17" />
              </button>
            </span>
          </label>
          <label>
            <span>确认密码</span>
            <span class="auth-input"><LockKeyhole :size="17" /><input v-model="confirmPassword" :type="passwordVisible ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="72" placeholder="再次输入密码" required /></span>
          </label>

          <p v-if="errorMessage" class="auth-error" role="alert">{{ errorMessage }}</p>

          <button class="auth-submit" type="submit" :disabled="submitting">
            <span>{{ submitting ? "创建中…" : "创建账号" }}</span><ArrowRight :size="17" />
          </button>
        </form>

        <p class="auth-switch">已有账号？ <RouterLink to="/login">返回登录</RouterLink></p>
      </div>
    </section>
  </main>
</template>

