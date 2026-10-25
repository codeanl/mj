<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { ElButton, ElDialog, ElDrawer, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect } from "element-plus"
import "element-plus/dist/index.css"
import { Ban, CircleAlert, Clock3, Coins, Eye, Image, LoaderCircle, RefreshCcw, RotateCcw, Search, Video } from "@lucide/vue"

import * as generationApi from "@/services/generations"

const tasks = ref<generationApi.AdminGenerationTask[]>([])
const summary = ref<generationApi.GenerationSummary>({ total: 0, queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, pointsSpent: 0 })
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchDraft = ref("")
const search = ref("")
const statusFilter = ref<generationApi.GenerationStatus | "">("")
const kindFilter = ref<generationApi.GenerationKind | "">("")
const loading = ref(true)
const actingTaskId = ref("")
const detailOpen = ref(false)
const selectedTask = ref<generationApi.AdminGenerationTask | null>(null)
const imagePreviewOpen = ref(false)
const previewTask = ref<generationApi.AdminGenerationTask | null>(null)
const previewUrls = ref<Record<string, string>>({})
const previewSignatures = ref<Record<string, string>>({})
let loadSequence = 0

const successRate = computed(() => summary.value.total ? Math.round(summary.value.succeeded / summary.value.total * 100) : 0)
const previewImageUrl = computed(() => previewTask.value ? previewUrls.value[previewTask.value.taskId] || "" : "")

onMounted(() => void loadTasks())
onBeforeUnmount(() => revokePreviews())

async function loadTasks() {
  const sequence = ++loadSequence
  loading.value = true
  try {
    const result = await generationApi.listGenerations({
      page: page.value, pageSize: pageSize.value, search: search.value,
      status: statusFilter.value || undefined, type: kindFilter.value || undefined,
    })
    if (sequence !== loadSequence) return
	tasks.value = result.items
	total.value = result.total
	summary.value = result.summary
	void loadPreviews(result.items, sequence)
  } catch (error) {
    if (sequence === loadSequence) ElMessage.error(messageOf(error, "任务加载失败"))
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function loadPreviews(items: generationApi.AdminGenerationTask[], sequence: number) {
	const currentUrls = previewUrls.value
	const currentSignatures = previewSignatures.value
	const entries = await Promise.all(items.map(async (task) => {
	  const signature = `${task.status}:${task.assetId}`
	  if (task.status !== "succeeded" || task.type !== "image") return { id: task.taskId, url: "", signature, created: false }
	  if (currentUrls[task.taskId] && currentSignatures[task.taskId] === signature) return { id: task.taskId, url: currentUrls[task.taskId], signature, created: false }
	  try {
		const blob = await generationApi.getGenerationPreview(task.taskId)
		return { id: task.taskId, url: URL.createObjectURL(blob), signature, created: true }
	  } catch {
		return { id: task.taskId, url: "", signature: "", created: false }
	  }
	}))
	if (sequence !== loadSequence) {
	  entries.forEach((entry) => entry.created && entry.url && URL.revokeObjectURL(entry.url))
	  return
	}
	const nextUrls = Object.fromEntries(entries.map((entry) => [entry.id, entry.url]))
	const nextSignatures = Object.fromEntries(entries.map((entry) => [entry.id, entry.signature]))
	Object.entries(currentUrls).forEach(([id, url]) => {
	  if (url && nextUrls[id] !== url) URL.revokeObjectURL(url)
	})
	previewUrls.value = nextUrls
	previewSignatures.value = nextSignatures
}

function revokePreviews() {
	Object.values(previewUrls.value).forEach((url) => url && URL.revokeObjectURL(url))
	previewUrls.value = {}
	previewSignatures.value = {}
}

function submitSearch() {
  search.value = searchDraft.value.trim()
  page.value = 1
  void loadTasks()
}

function applyFilters() {
  page.value = 1
  void loadTasks()
}

async function openDetail(task: generationApi.AdminGenerationTask) {
  selectedTask.value = task
  detailOpen.value = true
  try {
    selectedTask.value = await generationApi.getGeneration(task.taskId)
  } catch (error) {
    ElMessage.error(messageOf(error, "任务详情加载失败"))
  }
}

function openImagePreview(task: generationApi.AdminGenerationTask) {
	if (!previewUrls.value[task.taskId]) return
	previewTask.value = task
	imagePreviewOpen.value = true
}

async function runAction(task: generationApi.AdminGenerationTask, action: "retry" | "cancel" | "refund") {
  const labels = { retry: ["重新排队", "确认重试该失败任务？若此前已退款，将重新扣除本次生成积分。"], cancel: ["取消任务", "确认取消该排队任务并退回已扣积分？"], refund: ["补退积分", "确认向该用户退回本任务消耗的积分？此操作只能执行一次。"] } as const
  try {
    await ElMessageBox.confirm(labels[action][1], labels[action][0], { confirmButtonText: "确认", cancelButtonText: "返回", type: action === "cancel" ? "warning" : "info" })
  } catch {
    return
  }
  actingTaskId.value = task.taskId
  try {
    const result = action === "retry" ? await generationApi.retryGeneration(task.taskId) : action === "cancel" ? await generationApi.cancelGeneration(task.taskId) : await generationApi.refundGeneration(task.taskId)
    selectedTask.value = result.task
    await loadTasks()
    ElMessage.success(labels[action][0] + "成功")
  } catch (error) {
    ElMessage.error(messageOf(error, `${labels[action][0]}失败`))
  } finally {
    actingTaskId.value = ""
  }
}

function accountLabel(value: number) { return `ID：${String(value).padStart(4, "0")}` }
function shortTask(value: string) { return value.slice(0, 8).toUpperCase() }
function formatPoints(value: number) { return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)) : "-" }
function duration(task: generationApi.AdminGenerationTask) {
  if (!task.startedAt) return "-"
  const end = task.completedAt ? new Date(task.completedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(task.startedAt).getTime()) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)}分 ${seconds % 60}秒`
}
function statusLabel(status: generationApi.GenerationStatus) { return ({ queued: "排队中", running: "生成中", succeeded: "已完成", failed: "失败", cancelled: "已取消" })[status] }
function kindLabel(kind: generationApi.GenerationKind) { return kind === "image" ? "图片" : "视频" }
function messageOf(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback }
</script>

<template>
  <section class="generation-workspace">
    <div class="generation-metrics">
      <div><span>全部任务</span><strong>{{ summary.total }}</strong></div>
      <div><span>处理中</span><strong>{{ summary.queued + summary.running }}</strong></div>
      <div><span>成功率</span><strong>{{ successRate }}%</strong></div>
      <div><span>失败 / 取消</span><strong>{{ summary.failed + summary.cancelled }}</strong></div>
      <div><span>实际消耗积分</span><strong>{{ formatPoints(summary.pointsSpent) }}</strong></div>
    </div>

    <div class="generation-toolbar">
      <form class="generation-search" @submit.prevent="submitSearch"><Search :size="16" /><input v-model="searchDraft" placeholder="任务 ID、用户、账号 ID、模型或渠道" /><button type="submit">搜索</button></form>
      <ElSelect v-model="statusFilter" aria-label="状态筛选" placeholder="全部状态" @change="applyFilters"><ElOption label="全部状态" value="" /><ElOption label="排队中" value="queued" /><ElOption label="生成中" value="running" /><ElOption label="已完成" value="succeeded" /><ElOption label="失败" value="failed" /><ElOption label="已取消" value="cancelled" /></ElSelect>
      <ElSelect v-model="kindFilter" aria-label="类型筛选" placeholder="全部类型" @change="applyFilters"><ElOption label="全部类型" value="" /><ElOption label="图片" value="image" /><ElOption label="视频" value="video" /></ElSelect>
      <button class="generation-refresh" type="button" :disabled="loading" @click="loadTasks"><RefreshCcw :class="{ spin: loading }" :size="16" />刷新</button>
    </div>

    <div v-if="loading" class="generation-loading"><LoaderCircle class="spin" :size="22" />正在加载生成任务</div>
    <div v-else-if="tasks.length" class="generation-table-wrap">
      <table class="generation-table">
        <thead><tr><th>任务</th><th>用户</th><th>渠道 / 模型</th><th>参数</th><th>状态</th><th>积分</th><th>时间</th><th>操作</th></tr></thead>
        <tbody><tr v-for="task in tasks" :key="task.taskId">
		  <td><span class="generation-task-id"><button class="generation-task-thumb" type="button" :disabled="!previewUrls[task.taskId]" :title="previewUrls[task.taskId] ? '查看生成图片' : undefined" @click="openImagePreview(task)"><img v-if="previewUrls[task.taskId]" :src="previewUrls[task.taskId]" :alt="task.prompt" /><component :is="task.type === 'image' ? Image : Video" v-else :size="16" /></button><span><strong>{{ shortTask(task.taskId) }}</strong><small>{{ kindLabel(task.type) }} · 重试 {{ task.retryCount }} 次</small></span></span></td>
          <td><span class="generation-user"><strong>{{ task.username }}</strong><small>{{ accountLabel(task.accountId) }} · {{ task.email }}</small></span></td>
          <td><span class="generation-channel"><strong>{{ task.channelName || "渠道已删除" }}</strong><small>{{ task.model }}</small></span></td>
          <td><span>{{ task.size || "-" }} · {{ task.quality || "-" }}</span><small v-if="task.referenceCount">{{ task.referenceCount }} 张参考图</small></td>
          <td><span class="generation-status" :class="`is-${task.status}`">{{ statusLabel(task.status) }}</span></td>
          <td><span class="generation-cost"><Coins :size="13" />{{ formatPoints(task.pointsCost) }}</span><small v-if="task.pointsRefunded">已退款</small></td>
          <td><span>{{ formatDate(task.createdAt) }}</span><small>{{ duration(task) }}</small></td>
          <td><div class="generation-actions"><button type="button" title="查看详情" @click="openDetail(task)"><Eye :size="15" /></button><button v-if="task.status === 'failed' || task.status === 'cancelled'" type="button" title="重试任务" :disabled="actingTaskId === task.taskId" @click="runAction(task, 'retry')"><RotateCcw :size="15" /></button><button v-if="task.status === 'queued'" type="button" title="取消任务" :disabled="actingTaskId === task.taskId" @click="runAction(task, 'cancel')"><Ban :size="15" /></button><button v-if="task.status === 'succeeded' && !task.pointsRefunded && task.pointsCost > 0" type="button" title="补退积分" :disabled="actingTaskId === task.taskId" @click="runAction(task, 'refund')"><Coins :size="15" /></button></div></td>
        </tr></tbody>
      </table>
    </div>

	<div v-if="!loading && tasks.length" class="generation-mobile-list"><article v-for="task in tasks" :key="task.taskId"><div><span class="generation-task-id"><button class="generation-task-thumb" type="button" :disabled="!previewUrls[task.taskId]" :title="previewUrls[task.taskId] ? '查看生成图片' : undefined" @click="openImagePreview(task)"><img v-if="previewUrls[task.taskId]" :src="previewUrls[task.taskId]" :alt="task.prompt" /><component :is="task.type === 'image' ? Image : Video" v-else :size="16" /></button><strong>{{ shortTask(task.taskId) }}</strong></span><span class="generation-status" :class="`is-${task.status}`">{{ statusLabel(task.status) }}</span></div><strong>{{ task.username }} · {{ accountLabel(task.accountId) }}</strong><span>{{ task.channelName || "渠道已删除" }} · {{ task.model }}</span><small>{{ task.size || "-" }} · {{ task.quality || "-" }} · {{ formatPoints(task.pointsCost) }} 积分 · {{ formatDate(task.createdAt) }}</small><button type="button" @click="openDetail(task)"><Eye :size="15" />查看详情</button></article></div>
    <div v-if="!loading && !tasks.length" class="generation-empty"><Clock3 :size="30" /><strong>没有找到生成任务</strong><span>调整搜索或筛选条件后再试。</span></div>
    <footer v-if="total" class="generation-pagination"><span>共 {{ total }} 个任务</span><ElPagination background layout="prev, pager, next" :current-page="page" :page-size="pageSize" :total="total" @current-change="(value: number) => { page = value; loadTasks() }" /><ElSelect :model-value="pageSize" aria-label="每页数量" @change="(value: number) => { pageSize = value; page = 1; loadTasks() }"><ElOption label="20 条/页" :value="20" /><ElOption label="50 条/页" :value="50" /></ElSelect></footer>

	<ElDrawer v-model="detailOpen" title="任务详情" size="min(560px, 100vw)" append-to-body>
      <div v-if="selectedTask" class="generation-detail">
        <div class="generation-detail-head"><span class="generation-status" :class="`is-${selectedTask.status}`">{{ statusLabel(selectedTask.status) }}</span><code>{{ selectedTask.taskId }}</code></div>
        <section><strong>用户</strong><p>{{ selectedTask.username }} · {{ accountLabel(selectedTask.accountId) }}</p><small>{{ selectedTask.email }}</small></section>
        <section><strong>执行配置</strong><dl><div><dt>渠道</dt><dd>{{ selectedTask.channelName || "渠道已删除" }} · {{ selectedTask.channelProtocol || "-" }}</dd></div><div><dt>模型</dt><dd>{{ selectedTask.model }}</dd></div><div><dt>参数</dt><dd>{{ selectedTask.size || "-" }} · {{ selectedTask.quality || "-" }} · {{ selectedTask.width }}×{{ selectedTask.height }}</dd></div><div><dt>参考图</dt><dd>{{ selectedTask.referenceCount }} 张</dd></div></dl></section>
        <section><strong>提示词</strong><p class="generation-prompt">{{ selectedTask.prompt }}</p></section>
        <section><strong>积分与时间</strong><dl><div><dt>任务成本</dt><dd>{{ formatPoints(selectedTask.pointsCost) }} 积分{{ selectedTask.pointsRefunded ? " · 已退款" : "" }}</dd></div><div><dt>创建时间</dt><dd>{{ formatDate(selectedTask.createdAt) }}</dd></div><div><dt>开始时间</dt><dd>{{ formatDate(selectedTask.startedAt) }}</dd></div><div><dt>完成时间</dt><dd>{{ formatDate(selectedTask.completedAt) }}</dd></div><div><dt>执行耗时</dt><dd>{{ duration(selectedTask) }}</dd></div></dl></section>
        <section v-if="selectedTask.errorMessage" class="generation-error"><strong><CircleAlert :size="15" />失败原因</strong><p>{{ selectedTask.errorMessage }}</p></section>
        <div class="generation-detail-actions"><ElButton v-if="selectedTask.status === 'failed' || selectedTask.status === 'cancelled'" type="primary" :loading="actingTaskId === selectedTask.taskId" @click="runAction(selectedTask, 'retry')"><RotateCcw :size="15" />重新排队</ElButton><ElButton v-if="selectedTask.status === 'queued'" type="danger" plain :loading="actingTaskId === selectedTask.taskId" @click="runAction(selectedTask, 'cancel')"><Ban :size="15" />取消任务</ElButton><ElButton v-if="selectedTask.status === 'succeeded' && !selectedTask.pointsRefunded && selectedTask.pointsCost > 0" :loading="actingTaskId === selectedTask.taskId" @click="runAction(selectedTask, 'refund')"><Coins :size="15" />补退积分</ElButton></div>
      </div>
	</ElDrawer>

	<ElDialog v-model="imagePreviewOpen" class="generation-image-preview" :title="previewTask ? `图片预览 · ${shortTask(previewTask.taskId)}` : '图片预览'" width="min(920px, calc(100vw - 28px))" append-to-body destroy-on-close>
	  <div v-if="previewTask && previewImageUrl" class="generation-image-preview__body">
		<img :src="previewImageUrl" :alt="previewTask.prompt" />
		<div><strong>{{ previewTask.username }} · {{ accountLabel(previewTask.accountId) }}</strong><span>{{ previewTask.model }} · {{ previewTask.width }}×{{ previewTask.height }}</span></div>
	  </div>
	</ElDialog>
  </section>
</template>
