<script setup lang="ts">
import { onMounted, ref } from "vue"
import { ElButton, ElDialog, ElOption, ElPagination, ElSelect } from "element-plus"
import "element-plus/es/components/button/style/css"
import "element-plus/es/components/dialog/style/css"
import "element-plus/es/components/option/style/css"
import "element-plus/es/components/pagination/style/css"
import "element-plus/es/components/select/style/css"
import { Eye, FileClock, LoaderCircle, Search } from "@lucide/vue"

import * as auditApi from "@/services/audit"
import type { AuditItem } from "@/services/dashboard"

const items = ref<AuditItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchDraft = ref("")
const search = ref("")
const action = ref("")
const loading = ref(true)
const error = ref("")
const selected = ref<AuditItem | null>(null)

onMounted(() => void loadAudit())

async function loadAudit() {
  loading.value = true
  error.value = ""
  try {
    const result = await auditApi.listAudit({ page: page.value, pageSize: pageSize.value, search: search.value, action: action.value })
    items.value = result.items
    total.value = result.total
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "审计日志加载失败"
  } finally {
    loading.value = false
  }
}
function submitSearch() { search.value = searchDraft.value.trim(); page.value = 1; void loadAudit() }
function applyFilter() { page.value = 1; void loadAudit() }
function accountLabel(value: number) { return `ID：${String(value).padStart(4, "0")}` }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)) }
function formatJSON(value: unknown) { return JSON.stringify(value, null, 2) }
function actionLabel(value: string) { return ({ "user.create": "创建用户", "user.update": "更新用户", "user.password_reset": "重置密码", "points.adjust": "调整积分", "points.rules_update": "修改积分规则", "channel.create": "创建渠道", "channel.update": "更新渠道", "channel.delete": "删除渠道", "channel.test": "检测渠道", "channel.models_sync": "同步模型", "channel_model.create": "添加模型", "channel_model.update": "更新模型", "channel_model.delete": "删除模型", "generation.check": "检查任务", "generation.retry": "重试任务", "generation.cancel": "取消任务", "generation.refund": "补退积分" } as Record<string, string>)[value] || value }
</script>

<template>
  <section class="audit-workspace">
    <div class="audit-toolbar"><form class="audit-search" @submit.prevent="submitSearch"><Search :size="16" /><input v-model="searchDraft" placeholder="搜索操作者、目标或动作" /><button type="submit">搜索</button></form><ElSelect v-model="action" aria-label="操作类型" placeholder="全部操作" clearable @change="applyFilter"><ElOption label="用户管理" value="user.update" /><ElOption label="重置密码" value="user.password_reset" /><ElOption label="调整积分" value="points.adjust" /><ElOption label="修改积分规则" value="points.rules_update" /><ElOption label="更新渠道" value="channel.update" /><ElOption label="删除渠道" value="channel.delete" /><ElOption label="任务退款" value="generation.refund" /></ElSelect></div>
    <div v-if="loading" class="admin-state"><LoaderCircle class="spin" :size="22" />正在加载审计日志</div>
    <div v-else-if="error" class="admin-state is-error"><strong>{{ error }}</strong><button type="button" @click="loadAudit">重新加载</button></div>
    <div v-else-if="items.length" class="audit-table-wrap"><table class="audit-table"><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>目标</th><th>请求</th><th>详情</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td>{{ formatDate(item.createdAt) }}</td><td><strong>{{ item.actorUsername }}</strong><small>{{ accountLabel(item.actorAccountId) }}</small></td><td><span class="audit-action" :class="{ 'is-failed': !item.succeeded }">{{ actionLabel(item.action) }} · {{ item.statusCode }}</span></td><td><strong>{{ item.targetType }}</strong><small>{{ item.targetId || "-" }}</small></td><td><span>{{ item.ipAddress || "-" }}</span><small>{{ item.requestId || "-" }}</small></td><td><button type="button" class="audit-detail-button" title="查看审计详情" aria-label="查看审计详情" @click="selected = item"><Eye :size="16" /></button></td></tr></tbody></table></div>
    <div v-else class="admin-state"><FileClock :size="28" /><strong>暂无审计记录</strong></div>
    <footer v-if="total" class="audit-pagination"><span>共 {{ total }} 条记录</span><ElPagination background layout="prev, pager, next" :current-page="page" :page-size="pageSize" :total="total" @current-change="(value: number) => { page = value; loadAudit() }" /><ElSelect :model-value="pageSize" aria-label="每页数量" @change="(value: number) => { pageSize = value; page = 1; loadAudit() }"><ElOption label="20 条/页" :value="20" /><ElOption label="50 条/页" :value="50" /></ElSelect></footer>
    <ElDialog :model-value="Boolean(selected)" title="审计详情" width="min(760px, calc(100vw - 28px))" append-to-body @close="selected = null"><div v-if="selected" class="audit-detail"><dl><div><dt>操作者</dt><dd>{{ selected.actorUsername }} · {{ accountLabel(selected.actorAccountId) }}</dd></div><div><dt>动作</dt><dd>{{ actionLabel(selected.action) }}</dd></div><div><dt>执行结果</dt><dd>{{ selected.succeeded ? "成功" : "失败" }} · HTTP {{ selected.statusCode }}</dd></div><div><dt>目标</dt><dd>{{ selected.targetType }} · {{ selected.targetId || "-" }}</dd></div><div><dt>请求 ID</dt><dd>{{ selected.requestId || "-" }}</dd></div><div><dt>来源</dt><dd>{{ selected.ipAddress || "-" }} · {{ selected.userAgent || "-" }}</dd></div></dl><section><strong>变更前</strong><pre>{{ formatJSON(selected.before) }}</pre></section><section><strong>变更后</strong><pre>{{ formatJSON(selected.after) }}</pre></section></div><template #footer><ElButton @click="selected = null">关闭</ElButton></template></ElDialog>
  </section>
</template>
