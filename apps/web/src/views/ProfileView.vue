<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { AlertTriangle, Camera, Check, Gift, KeyRound, LoaderCircle, MonitorSmartphone, ShieldCheck, Trash2, UserRound } from "@lucide/vue"

import UserAvatar from "@/components/UserAvatar.vue"
import { apiErrorMessage } from "@/services/http"
import { notification } from "@/services/notifications"
import { useAuthStore } from "@/stores/auth"
import * as authApi from "@/services/auth"
import { redeemCdk } from "@/services/cdk"

const authStore = useAuthStore()
const username = ref(authStore.user?.username || "")
const avatarInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref("")
const selectedAvatar = ref<File | null>(null)
const savingProfile = ref(false)
const savingAvatar = ref(false)
const removingAvatar = ref(false)
const currentPassword = ref("")
const newPassword = ref("")
const confirmPassword = ref("")
const savingPassword = ref(false)
const sessions = ref<authApi.AccountSession[]>([])
const sessionsLoading = ref(false)
const revokingSessionId = ref("")
const deletionRequest = ref<authApi.AccountDeletionRequest | null>(null)
const deletionPassword = ref("")
const submittingDeletion = ref(false)
const cdkCode = ref("")
const redeemingCdk = ref(false)

const accountRole = computed(() => authStore.user?.role === "admin" ? "管理员" : "创作者")
const accountStatus = computed(() => authStore.user?.status === "active" ? "正常" : "已停用")
const joinedAt = computed(() => authStore.user?.createdAt ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(authStore.user.createdAt)) : "-")
const formattedPoints = computed(() => Number(authStore.user?.pointsBalance || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }))
const membershipDays = computed(() => {
  if (!authStore.user?.createdAt) return "-"
  const elapsed = Date.now() - new Date(authStore.user.createdAt).getTime()
  return `${Math.max(1, Math.floor(elapsed / 86_400_000) + 1)} 天`
})

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

async function savePassword() {
  if (savingPassword.value) return
  if (newPassword.value.length < 8 || newPassword.value.length > 72) {
    notification.warning("新密码需要 8-72 位")
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    notification.warning("两次输入的新密码不一致")
    return
  }
  savingPassword.value = true
  try {
    await authApi.changePassword({ currentPassword: currentPassword.value, newPassword: newPassword.value })
    currentPassword.value = ""
    newPassword.value = ""
    confirmPassword.value = ""
    notification.success("密码已更新，其他设备已退出")
    await loadSessions()
  } catch (error) {
    notification.error(apiErrorMessage(error, "密码修改失败"))
  } finally {
    savingPassword.value = false
  }
}

async function submitCdk() {
  const code = cdkCode.value.trim()
  if (!code || redeemingCdk.value) return
  redeemingCdk.value = true
  try {
    const result = await redeemCdk(code)
    authStore.setPointsBalance(result.balance)
    cdkCode.value = ""
    notification.success(`兑换成功，获得 ${Number(result.points).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 积分`)
  } catch (error) {
    notification.error(apiErrorMessage(error, "CDK 兑换失败"))
  } finally {
    redeemingCdk.value = false
  }
}

async function loadSessions() {
  sessionsLoading.value = true
  try {
    sessions.value = await authApi.listSessions()
  } catch (error) {
    notification.error(apiErrorMessage(error, "登录设备加载失败"))
  } finally {
    sessionsLoading.value = false
  }
}

async function revokeSession(sessionId: string) {
  if (revokingSessionId.value) return
  revokingSessionId.value = sessionId
  try {
    await authApi.revokeSession(sessionId)
    sessions.value = sessions.value.filter((session) => session.id !== sessionId)
    notification.success("设备已退出")
  } catch (error) {
    notification.error(apiErrorMessage(error, "设备注销失败"))
  } finally {
    revokingSessionId.value = ""
  }
}

async function revokeOtherSessions() {
  if (revokingSessionId.value) return
  revokingSessionId.value = "others"
  try {
    await authApi.revokeOtherSessions()
    sessions.value = sessions.value.filter((session) => session.current)
    notification.success("其他设备已全部退出")
  } catch (error) {
    notification.error(apiErrorMessage(error, "其他设备注销失败"))
  } finally {
    revokingSessionId.value = ""
  }
}

async function loadDeletionRequest() {
  try {
    deletionRequest.value = await authApi.getAccountDeletionRequest()
  } catch (error) {
    notification.error(apiErrorMessage(error, "注销申请状态加载失败"))
  }
}

async function requestDeletion() {
  if (!deletionPassword.value || submittingDeletion.value) return
  submittingDeletion.value = true
  try {
    deletionRequest.value = await authApi.requestAccountDeletion(deletionPassword.value)
    deletionPassword.value = ""
    notification.success("账号注销申请已提交")
  } catch (error) {
    notification.error(apiErrorMessage(error, "注销申请提交失败"))
  } finally {
    submittingDeletion.value = false
  }
}

async function cancelDeletion() {
  if (submittingDeletion.value) return
  submittingDeletion.value = true
  try {
    await authApi.cancelAccountDeletion()
    deletionRequest.value = null
    notification.success("账号注销申请已撤销")
  } catch (error) {
    notification.error(apiErrorMessage(error, "注销申请撤销失败"))
  } finally {
    submittingDeletion.value = false
  }
}

function sessionDevice(session: authApi.AccountSession) {
  const agent = session.userAgent.toLowerCase()
  if (agent.includes("electron")) return "Nova Studio Windows 客户端"
  if (agent.includes("iphone") || agent.includes("ipad")) return "iPhone / iPad"
  if (agent.includes("android")) return "Android 设备"
  if (agent.includes("windows")) return "Windows 浏览器"
  if (agent.includes("macintosh")) return "Mac 浏览器"
  return "浏览器设备"
}

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

onBeforeUnmount(() => previewUrl.value && URL.revokeObjectURL(previewUrl.value))
onMounted(() => void Promise.all([loadSessions(), loadDeletionRequest()]))
</script>

<template>
  <section class="profile-page">
    <header class="profile-page__header">
      <h1>个人中心</h1>
    </header>

    <div class="profile-page__body">
      <aside class="profile-overview">
        <div class="profile-avatar-editor">
          <div class="profile-avatar-editor__preview">
            <img v-if="previewUrl" :src="previewUrl" alt="新头像预览" />
            <UserAvatar v-else />
          </div>
          <div class="profile-overview__identity">
            <h2>{{ authStore.user?.username }}</h2>
            <p>{{ authStore.user?.email }}</p>
            <span :class="{ 'is-disabled': accountStatus !== '正常' }">{{ accountStatus }}</span>
          </div>
        </div>
        <p class="profile-overview__hint">头像会用于创作记录和个人身份展示，支持 JPG、PNG 或 WebP。</p>
        <div class="profile-avatar-editor__actions">
          <input ref="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" @change="selectAvatar" />
          <button class="profile-button profile-button--secondary" type="button" @click="chooseAvatar"><Camera :size="16" />选择图片</button>
          <button v-if="selectedAvatar" class="profile-button profile-button--primary" type="button" :disabled="savingAvatar" @click="saveAvatar"><LoaderCircle v-if="savingAvatar" class="spin" :size="16" /><Check v-else :size="16" />保存头像</button>
          <button v-if="authStore.user?.avatarUrl || selectedAvatar" class="profile-button profile-button--danger" type="button" :disabled="removingAvatar" @click="removeAvatar"><LoaderCircle v-if="removingAvatar" class="spin" :size="16" /><Trash2 v-else :size="16" />移除</button>
        </div>

      </aside>

      <div class="profile-details">
        <section class="profile-section">
          <div class="profile-section__heading"><div><h2>个人资料</h2><p>昵称会显示在客户端的个人身份区域</p></div></div>
          <form class="profile-form" @submit.prevent="saveProfile">
            <label><span>昵称</span><div class="profile-input"><UserRound :size="17" /><input v-model="username" minlength="2" maxlength="32" autocomplete="nickname" /></div></label>
            <button class="profile-button profile-button--primary" type="submit" :disabled="savingProfile"><LoaderCircle v-if="savingProfile" class="spin" :size="16" /><Check v-else :size="16" />保存资料</button>
          </form>
        </section>

        <section class="profile-section">
          <div class="profile-section__heading"><div><h2>账号信息</h2><p>以下信息由系统维护，仅用于识别当前账号</p></div></div>
          <dl class="profile-facts">
            <div><dt>登录邮箱</dt><dd>{{ authStore.user?.email }}</dd></div>
            <div><dt>账号身份</dt><dd>{{ accountRole }}</dd></div>
            <div><dt>账号状态</dt><dd>{{ accountStatus }}</dd></div>
            <div><dt>积分余额</dt><dd>{{ formattedPoints }}</dd></div>
            <div><dt>注册时间</dt><dd>{{ joinedAt }}</dd></div>
            <div><dt>加入天数</dt><dd>{{ membershipDays }}</dd></div>
          </dl>
        </section>

        <section class="profile-section profile-section--cdk">
          <div class="profile-section__heading"><div><h2>CDK 兑换</h2><p>输入管理员发放的兑换密钥，积分会立即计入当前账号</p></div><Gift :size="19" /></div>
          <form class="profile-cdk-form" @submit.prevent="submitCdk">
            <label><span>兑换密钥</span><div class="profile-input"><Gift :size="17" /><input v-model="cdkCode" maxlength="40" autocomplete="off" spellcheck="false" placeholder="NOVA-XXXXX-XXXXX-XXXXX" @input="cdkCode = cdkCode.toUpperCase()" /></div></label>
            <button class="profile-button profile-button--primary" type="submit" :disabled="!cdkCode.trim() || redeemingCdk"><LoaderCircle v-if="redeemingCdk" class="spin" :size="16" /><Gift v-else :size="16" />立即兑换</button>
          </form>
        </section>

        <section class="profile-section">
          <div class="profile-section__heading"><div><h2>修改密码</h2><p>修改后会保留当前设备，并让其他设备退出登录</p></div><ShieldCheck :size="19" /></div>
          <form class="profile-password-form" @submit.prevent="savePassword">
            <label><span>当前密码</span><div class="profile-input"><KeyRound :size="17" /><input v-model="currentPassword" type="password" autocomplete="current-password" required /></div></label>
            <label><span>新密码</span><div class="profile-input"><KeyRound :size="17" /><input v-model="newPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" required /></div></label>
            <label><span>确认新密码</span><div class="profile-input"><KeyRound :size="17" /><input v-model="confirmPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" required /></div></label>
            <button class="profile-button profile-button--primary" type="submit" :disabled="savingPassword"><LoaderCircle v-if="savingPassword" class="spin" :size="16" /><Check v-else :size="16" />更新密码</button>
          </form>
        </section>

        <section class="profile-section">
          <div class="profile-section__heading"><div><h2>登录设备</h2><p>查看并管理当前账号仍然有效的登录会话</p></div><button v-if="sessions.filter((session) => !session.current).length" class="profile-button profile-button--secondary" type="button" :disabled="Boolean(revokingSessionId)" @click="revokeOtherSessions">注销其他设备</button></div>
          <div v-if="sessionsLoading" class="profile-security-state"><LoaderCircle class="spin" :size="18" />正在加载登录设备</div>
          <div v-else class="profile-sessions">
            <article v-for="session in sessions" :key="session.id">
              <span class="profile-session__icon"><MonitorSmartphone :size="18" /></span>
              <div><strong>{{ sessionDevice(session) }}</strong><small>{{ session.ipAddress || "未知地址" }} · 最近活动 {{ formatSessionTime(session.lastSeenAt) }}</small></div>
              <em v-if="session.current">当前设备</em>
              <button v-else type="button" :disabled="Boolean(revokingSessionId)" @click="revokeSession(session.id)"><LoaderCircle v-if="revokingSessionId === session.id" class="spin" :size="15" />退出</button>
            </article>
            <p v-if="!sessions.length" class="profile-security-state">没有可用的登录设备记录</p>
          </div>
        </section>

        <section class="profile-section profile-section--danger">
          <div class="profile-section__heading"><div><h2>账号注销</h2><p>提交后账号进入待处理状态，处理前可以随时撤销</p></div><AlertTriangle :size="19" /></div>
          <div v-if="deletionRequest" class="profile-deletion-pending"><div><strong>注销申请处理中</strong><span>提交于 {{ formatSessionTime(deletionRequest.requestedAt) }}</span></div><button class="profile-button profile-button--secondary" type="button" :disabled="submittingDeletion" @click="cancelDeletion">撤销申请</button></div>
          <form v-else class="profile-deletion-form" @submit.prevent="requestDeletion">
            <label><span>当前密码</span><div class="profile-input"><KeyRound :size="17" /><input v-model="deletionPassword" type="password" autocomplete="current-password" required /></div></label>
            <button class="profile-button profile-button--danger" type="submit" :disabled="submittingDeletion"><LoaderCircle v-if="submittingDeletion" class="spin" :size="16" /><Trash2 v-else :size="16" />提交注销申请</button>
          </form>
        </section>
      </div>
    </div>
  </section>
</template>
