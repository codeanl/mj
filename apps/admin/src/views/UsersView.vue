<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { ElButton, ElDialog, ElInput, ElInputNumber, ElMessage, ElOption, ElPagination, ElSelect } from "element-plus"
import "element-plus/es/components/button/style/css"
import "element-plus/es/components/dialog/style/css"
import "element-plus/es/components/input/style/css"
import "element-plus/es/components/input-number/style/css"
import "element-plus/es/components/message/style/css"
import "element-plus/es/components/option/style/css"
import "element-plus/es/components/pagination/style/css"
import "element-plus/es/components/select/style/css"
import { Coins, KeyRound, LoaderCircle, Pencil, Search, ShieldCheck, UserPlus, UserRound, UsersRound } from "@lucide/vue"

import * as pointApi from "@/services/points"
import * as userApi from "@/services/users"

const users = ref<userApi.AdminUser[]>([])
const summary = ref<userApi.UserSummary>({ total: 0, active: 0, admins: 0, disabled: 0, totalPoints: 0 })
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchDraft = ref("")
const search = ref("")
const roleFilter = ref<userApi.AdminUserRole | "">("")
const statusFilter = ref<userApi.AdminUserStatus | "">("")
const loading = ref(true)
const saving = ref(false)
const editorOpen = ref(false)
const passwordOpen = ref(false)
const pointsOpen = ref(false)
const editingAccountId = ref<number | null>(null)
const passwordAccountId = ref<number | null>(null)
const password = ref("")
const pointsAccountId = ref<number | null>(null)
const pointsAmount = ref<number>(0)
const pointsDescription = ref("")
let loadSequence = 0

const form = reactive<userApi.UserInput & { password: string }>({ email: "", username: "", role: "user", status: "active", password: "" })
const editingUser = computed(() => users.value.find((user) => user.accountId === editingAccountId.value))
const passwordUser = computed(() => users.value.find((user) => user.accountId === passwordAccountId.value))
const pointsUser = computed(() => users.value.find((user) => user.accountId === pointsAccountId.value))

onMounted(() => void loadUsers())

async function loadUsers() {
  const sequence = ++loadSequence
  loading.value = true
  try {
    const result = await userApi.listUsers({ page: page.value, pageSize: pageSize.value, search: search.value, role: roleFilter.value || undefined, status: statusFilter.value || undefined })
    if (sequence !== loadSequence) return
    users.value = result.items
    total.value = result.total
    summary.value = result.summary
  } catch (error) {
    if (sequence === loadSequence) ElMessage.error(messageOf(error, "用户加载失败"))
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

function submitSearch() {
  search.value = searchDraft.value.trim()
  page.value = 1
  void loadUsers()
}

function applyFilters() {
  page.value = 1
  void loadUsers()
}

function changePage(nextPage: number) {
  page.value = nextPage
  void loadUsers()
}

function changePageSize(nextPageSize: number) {
  pageSize.value = nextPageSize
  page.value = 1
  void loadUsers()
}

function openCreate() {
  editingAccountId.value = null
  Object.assign(form, { email: "", username: "", role: "user", status: "active", password: "" })
  editorOpen.value = true
}

function openEdit(user: userApi.AdminUser) {
  editingAccountId.value = user.accountId
  Object.assign(form, { email: user.email, username: user.username, role: user.role, status: user.status, password: "" })
  editorOpen.value = true
}

async function saveUser() {
  if (!form.email.trim() || !form.username.trim()) return ElMessage.warning("请填写邮箱和用户名")
  if (!editingAccountId.value && form.password.length < 8) return ElMessage.warning("初始密码至少 8 位")
  saving.value = true
  try {
    if (editingAccountId.value) await userApi.updateUser(editingAccountId.value, { email: form.email, username: form.username, role: form.role, status: form.status })
    else await userApi.createUser(form)
    editorOpen.value = false
    await loadUsers()
    ElMessage.success(editingAccountId.value ? "用户已更新" : "用户已创建")
  } catch (error) {
    ElMessage.error(messageOf(error, "用户保存失败"))
  } finally {
    saving.value = false
  }
}

function openPassword(user: userApi.AdminUser) {
  passwordAccountId.value = user.accountId
  password.value = ""
  passwordOpen.value = true
}

async function resetPassword() {
  if (!passwordAccountId.value || password.value.length < 8) return ElMessage.warning("新密码至少 8 位")
  saving.value = true
  try {
    await userApi.resetUserPassword(passwordAccountId.value, password.value)
    passwordOpen.value = false
    password.value = ""
    ElMessage.success("用户密码已重置")
  } catch (error) {
    ElMessage.error(messageOf(error, "密码重置失败"))
  } finally {
    saving.value = false
  }
}

function openPoints(user: userApi.AdminUser) {
  pointsAccountId.value = user.accountId
  pointsAmount.value = 0
  pointsDescription.value = ""
  pointsOpen.value = true
}

async function adjustPoints() {
  if (!pointsAccountId.value || !Number.isFinite(pointsAmount.value) || pointsAmount.value === 0) return ElMessage.warning("请输入非零积分调整值")
  if (pointsDescription.value.trim().length < 2) return ElMessage.warning("请填写调整原因")
  saving.value = true
  try {
    await pointApi.adjustUserPoints(pointsAccountId.value, pointsAmount.value, pointsDescription.value.trim())
    pointsOpen.value = false
    await loadUsers()
    ElMessage.success("用户积分已调整")
  } catch (error) {
    ElMessage.error(messageOf(error, "积分调整失败"))
  } finally {
    saving.value = false
  }
}

function accountLabel(accountId: number) {
  return `ID：${String(accountId).padStart(4, "0")}`
}

function roleLabel(role: userApi.AdminUserRole) {
  return role === "admin" ? "管理员" : "普通用户"
}

function statusLabel(status: userApi.AdminUserStatus) {
  return status === "active" ? "正常" : "已停用"
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function formatPoints(value: number) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
</script>

<template>
  <section class="users-workspace">
    <div class="user-metrics">
      <div><span>全部用户</span><strong>{{ summary.total }}</strong></div>
      <div><span>正常账号</span><strong>{{ summary.active }}</strong></div>
      <div><span>管理员</span><strong>{{ summary.admins }}</strong></div>
      <div><span>已停用</span><strong>{{ summary.disabled }}</strong></div>
      <div><span>用户积分总额</span><strong>{{ formatPoints(summary.totalPoints) }}</strong></div>
    </div>

    <div class="user-toolbar">
      <form class="user-search" @submit.prevent="submitSearch"><Search :size="16" /><input v-model="searchDraft" placeholder="搜索邮箱、用户名或账号 ID" /><button type="submit">搜索</button></form>
      <ElSelect v-model="roleFilter" aria-label="角色筛选" placeholder="全部角色" @change="applyFilters"><ElOption label="全部角色" value="" /><ElOption label="普通用户" value="user" /><ElOption label="管理员" value="admin" /></ElSelect>
      <ElSelect v-model="statusFilter" aria-label="状态筛选" placeholder="全部状态" @change="applyFilters"><ElOption label="全部状态" value="" /><ElOption label="正常" value="active" /><ElOption label="已停用" value="disabled" /></ElSelect>
      <button class="user-primary" type="button" @click="openCreate"><UserPlus :size="16" />创建用户</button>
    </div>

    <div v-if="loading" class="user-loading"><LoaderCircle class="spin" :size="22" />正在加载用户</div>
    <div v-else-if="users.length" class="user-table-wrap">
      <table class="user-table">
        <thead><tr><th>用户</th><th>账号 ID</th><th>邮箱</th><th>角色</th><th>状态</th><th>积分</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="user in users" :key="user.accountId">
            <td><span class="user-identity"><i>{{ user.username.charAt(0).toUpperCase() }}</i><span><strong>{{ user.username }}</strong><small v-if="user.isSelf">当前账号</small></span></span></td>
            <td><strong>{{ accountLabel(user.accountId) }}</strong></td>
            <td><span class="user-email">{{ user.email }}</span></td>
            <td><span class="user-role" :class="{ 'is-admin': user.role === 'admin' }"><ShieldCheck v-if="user.role === 'admin'" :size="13" /><UserRound v-else :size="13" />{{ roleLabel(user.role) }}</span></td>
            <td><span class="user-status" :class="{ 'is-disabled': user.status === 'disabled' }">{{ statusLabel(user.status) }}</span></td>
            <td><strong class="user-points"><Coins :size="13" />{{ formatPoints(user.pointsBalance) }}</strong></td>
            <td><span>{{ formatDate(user.createdAt) }}</span></td>
            <td><div class="user-actions"><button type="button" :title="`调整 ${user.username} 积分`" :aria-label="`调整 ${user.username} 积分`" @click="openPoints(user)"><Coins :size="15" /></button><button type="button" :title="`编辑 ${user.username}`" :aria-label="`编辑 ${user.username}`" @click="openEdit(user)"><Pencil :size="15" /></button><button type="button" :title="`重置 ${user.username} 密码`" :aria-label="`重置 ${user.username} 密码`" @click="openPassword(user)"><KeyRound :size="15" /></button></div></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && users.length" class="user-mobile-list">
      <article v-for="user in users" :key="user.accountId">
        <div class="user-mobile-head"><span class="user-identity"><i>{{ user.username.charAt(0).toUpperCase() }}</i><span><strong>{{ user.username }}</strong><small>{{ accountLabel(user.accountId) }}</small></span></span><span class="user-status" :class="{ 'is-disabled': user.status === 'disabled' }">{{ statusLabel(user.status) }}</span></div>
        <p>{{ user.email }}</p>
        <div class="user-mobile-meta"><span>{{ roleLabel(user.role) }}</span><strong><Coins :size="12" />{{ formatPoints(user.pointsBalance) }} 积分</strong><span>{{ formatDate(user.createdAt) }}</span></div>
        <div class="user-mobile-actions"><button type="button" @click="openPoints(user)"><Coins :size="15" />调整积分</button><button type="button" @click="openEdit(user)"><Pencil :size="15" />编辑</button><button type="button" @click="openPassword(user)"><KeyRound :size="15" />重置密码</button></div>
      </article>
    </div>

    <div v-if="!loading && !users.length" class="user-empty"><UsersRound :size="30" /><strong>没有找到用户</strong><span>调整搜索或筛选条件后再试。</span></div>

    <footer class="user-pagination"><span>共 {{ total }} 位用户</span><ElPagination background layout="prev, pager, next" :current-page="page" :page-size="pageSize" :total="total" @current-change="changePage" /><ElSelect :model-value="pageSize" aria-label="每页数量" @change="changePageSize"><ElOption label="20 条/页" :value="20" /><ElOption label="50 条/页" :value="50" /></ElSelect></footer>

    <ElDialog v-model="editorOpen" :title="editingAccountId ? `编辑用户 · ${accountLabel(editingAccountId)}` : '创建用户'" width="min(620px, calc(100vw - 28px))" destroy-on-close>
      <div class="user-form-grid">
        <label><span>用户名</span><ElInput v-model="form.username" maxlength="32" /></label>
        <label><span>邮箱</span><ElInput v-model="form.email" type="email" /></label>
        <label><span>角色</span><ElSelect v-model="form.role" :disabled="editingUser?.isSelf"><ElOption label="普通用户" value="user" /><ElOption label="管理员" value="admin" /></ElSelect></label>
        <label><span>状态</span><ElSelect v-model="form.status" :disabled="editingUser?.isSelf"><ElOption label="正常" value="active" /><ElOption label="已停用" value="disabled" /></ElSelect></label>
        <label v-if="!editingAccountId" class="user-form-wide"><span>初始密码</span><ElInput v-model="form.password" type="password" show-password minlength="8" maxlength="72" placeholder="至少 8 位" /></label>
        <div v-if="editingUser?.isSelf" class="user-self-note user-form-wide"><ShieldCheck :size="16" />当前管理员不能停用自己或移除自己的管理员角色。</div>
      </div>
      <template #footer><ElButton @click="editorOpen = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveUser">保存用户</ElButton></template>
    </ElDialog>

    <ElDialog v-model="passwordOpen" :title="`重置密码 · ${passwordUser ? accountLabel(passwordUser.accountId) : ''}`" width="min(480px, calc(100vw - 28px))" append-to-body>
      <div class="user-password-panel"><KeyRound :size="22" /><div><strong>{{ passwordUser?.username }}</strong><span>设置新的登录密码，保存后旧密码立即失效。</span></div></div>
      <ElInput v-model="password" type="password" show-password minlength="8" maxlength="72" placeholder="输入至少 8 位新密码" @keyup.enter="resetPassword" />
      <template #footer><ElButton @click="passwordOpen = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="resetPassword">确认重置</ElButton></template>
    </ElDialog>

    <ElDialog v-model="pointsOpen" :title="`调整积分 · ${pointsUser ? accountLabel(pointsUser.accountId) : ''}`" width="min(500px, calc(100vw - 28px))" append-to-body>
      <div class="user-points-balance"><Coins :size="22" /><span><small>当前余额</small><strong>{{ formatPoints(pointsUser?.pointsBalance || 0) }} 积分</strong></span></div>
      <div class="user-form-grid">
        <label><span>调整数量</span><ElInputNumber v-model="pointsAmount" :min="-1000000" :max="1000000" :precision="2" placeholder="正数增加，负数扣除" /></label>
        <label class="user-form-wide"><span>调整原因</span><ElInput v-model="pointsDescription" maxlength="200" placeholder="例如：活动赠送 / 人工退款 / 违规扣除" /></label>
      </div>
      <template #footer><ElButton @click="pointsOpen = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="adjustPoints">确认调整</ElButton></template>
    </ElDialog>
  </section>
</template>
