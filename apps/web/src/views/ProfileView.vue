<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue"
import { Camera, Check, LoaderCircle, Trash2, UserRound } from "@lucide/vue"

import UserAvatar from "@/components/UserAvatar.vue"
import { apiErrorMessage } from "@/services/http"
import { notification } from "@/services/notifications"
import { useAuthStore } from "@/stores/auth"

const authStore = useAuthStore()
const username = ref(authStore.user?.username || "")
const avatarInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref("")
const selectedAvatar = ref<File | null>(null)
const savingProfile = ref(false)
const savingAvatar = ref(false)
const removingAvatar = ref(false)

const accountRole = computed(() => authStore.user?.role === "admin" ? "管理员" : "创作者")
const joinedAt = computed(() => authStore.user?.createdAt ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(authStore.user.createdAt)) : "-")
const formattedPoints = computed(() => Number(authStore.user?.pointsBalance || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }))

function chooseAvatar() {
  avatarInput.value?.click()
}

function selectAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file) return
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    notification.warning("头像仅支持 JPG、PNG 或 WebP")
    return
  }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  selectedAvatar.value = file
  previewUrl.value = URL.createObjectURL(file)
}

async function saveAvatar() {
  if (!selectedAvatar.value || savingAvatar.value) return
  savingAvatar.value = true
  try {
    await authStore.updateAvatar(selectedAvatar.value)
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ""
    selectedAvatar.value = null
    notification.success("头像已更新")
  } catch (error) {
    notification.error(apiErrorMessage(error, "头像更新失败"))
  } finally {
    savingAvatar.value = false
  }
}

async function removeAvatar() {
  if (removingAvatar.value) return
  removingAvatar.value = true
  try {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ""
    selectedAvatar.value = null
    await authStore.removeAvatar()
    notification.success("头像已移除")
  } catch (error) {
    notification.error(apiErrorMessage(error, "头像移除失败"))
  } finally {
    removingAvatar.value = false
  }
}

async function saveProfile() {
  const value = username.value.trim()
  if (value.length < 2 || value.length > 32) {
    notification.warning("昵称需要 2-32 个字符")
    return
  }
  savingProfile.value = true
  try {
    await authStore.updateProfile(value)
    username.value = authStore.user?.username || value
    notification.success("个人资料已保存")
  } catch (error) {
    notification.error(apiErrorMessage(error, "个人资料保存失败"))
  } finally {
    savingProfile.value = false
  }
}

onBeforeUnmount(() => previewUrl.value && URL.revokeObjectURL(previewUrl.value))
</script>

<template>
  <section class="profile-page">
    <header class="profile-page__header">
      <div><span>ACCOUNT</span><h1>个人中心</h1><p>管理你的公开身份与账号信息</p></div>
    </header>

    <div class="profile-page__body">
      <section class="profile-section profile-section--identity">
        <div class="profile-section__heading"><div><h2>头像</h2><p>用于创作记录和个人身份展示</p></div></div>
        <div class="profile-avatar-editor">
          <div class="profile-avatar-editor__preview">
            <img v-if="previewUrl" :src="previewUrl" alt="新头像预览" />
            <UserAvatar v-else />
          </div>
          <div class="profile-avatar-editor__actions">
            <input ref="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" @change="selectAvatar" />
            <button class="profile-button profile-button--secondary" type="button" @click="chooseAvatar"><Camera :size="16" />选择图片</button>
            <button v-if="selectedAvatar" class="profile-button profile-button--primary" type="button" :disabled="savingAvatar" @click="saveAvatar"><LoaderCircle v-if="savingAvatar" class="spin" :size="16" /><Check v-else :size="16" />保存头像</button>
            <button v-if="authStore.user?.avatarUrl || selectedAvatar" class="profile-button profile-button--danger" type="button" :disabled="removingAvatar" @click="removeAvatar"><LoaderCircle v-if="removingAvatar" class="spin" :size="16" /><Trash2 v-else :size="16" />移除</button>
          </div>
        </div>
      </section>

      <section class="profile-section">
        <div class="profile-section__heading"><div><h2>基本资料</h2><p>昵称会显示在客户端的个人身份区域</p></div></div>
        <form class="profile-form" @submit.prevent="saveProfile">
          <label><span>昵称</span><div class="profile-input"><UserRound :size="17" /><input v-model="username" minlength="2" maxlength="32" autocomplete="nickname" /></div></label>
          <button class="profile-button profile-button--primary" type="submit" :disabled="savingProfile"><LoaderCircle v-if="savingProfile" class="spin" :size="16" /><Check v-else :size="16" />保存资料</button>
        </form>
      </section>

      <section class="profile-section">
        <div class="profile-section__heading"><div><h2>账号信息</h2><p>账号核心信息由系统维护</p></div></div>
        <dl class="profile-facts">
          <div><dt>邮箱</dt><dd>{{ authStore.user?.email }}</dd></div>
          <div><dt>身份</dt><dd>{{ accountRole }}</dd></div>
          <div><dt>积分余额</dt><dd>{{ formattedPoints }}</dd></div>
          <div><dt>注册时间</dt><dd>{{ joinedAt }}</dd></div>
        </dl>
      </section>
    </div>
  </section>
</template>
