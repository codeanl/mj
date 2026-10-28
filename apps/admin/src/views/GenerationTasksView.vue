<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { ElButton, ElDialog, ElDrawer, ElInput, ElMessage, ElMessageBox, ElOption, ElSelect } from "element-plus"
import "element-plus/es/components/button/style/css"
import "element-plus/es/components/dialog/style/css"
import "element-plus/es/components/drawer/style/css"
import "element-plus/es/components/input/style/css"
import "element-plus/es/components/message/style/css"
import "element-plus/es/components/message-box/style/css"
import "element-plus/es/components/option/style/css"
import "element-plus/es/components/select/style/css"
import { Ban, CircleAlert, Clock3, Coins, Eye, Image, LoaderCircle, RefreshCcw, RotateCcw, Search, Video } from "@lucide/vue"

import GenerationThumbnail from "@/components/GenerationThumbnail.vue"
import * as generationApi from "@/services/generations"

const tasks = ref<generationApi.AdminGenerationTask[]>([])
const summary = ref<generationApi.GenerationSummary>({ total: 0, queued: 0, running: 0, needsReview: 0, succeeded: 0, failed: 0, cancelled: 0, pointsSpent: 0 })
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchDraft = ref("")
const search = ref("")
const statusFilter = ref<generationApi.GenerationStatus | "">("")
const kindFilter = ref<generationApi.GenerationKind | "">("")
const windowFilter = ref<"24h" | "7d" | "30d" | "all">("7d")
const cursorHistory = ref<string[]>([""])
const nextCursor = ref("")
const loading = ref(true)
const actingTaskId = ref("")
const detailOpen = ref(false)
const selectedTask = ref<generationApi.AdminGenerationTask | null>(null)
const imagePreviewOpen = ref(false)
const previewTask = ref<generationApi.AdminGenerationTask | null>(null)
const previewImageUrl = ref("")
const previewLoading = ref(false)
const reviewOpen=ref(false);const reviewAction=ref<"confirm_failed"|"provide_result">("confirm_failed");const reviewValue=ref("")
let loadSequence = 0

const successRate = computed(() => summary.value.total ? Math.round(summary.value.succeeded / summary.value.total * 100) : 0)

onMounted(() => void loadTasks())
onBeforeUnmount(() => revokePreview())
watch(imagePreviewOpen, (open) => { if (!open) revokePreview() })

async function loadTasks() {
  const sequence = ++loadSequence
  loading.value = true
  try {
    const result = await generationApi.listGenerations({
      page: page.value, pageSize: pageSize.value, search: search.value,
      status: statusFilter.value || undefined, type: kindFilter.value || undefined,
      window: windowFilter.value, cursor: cursorHistory.value[page.value - 1],
    })
    if (sequence !== loadSequence) return
	tasks.value = result.items
	total.value = result.total
	summary.value = result.summary
	nextCursor.value = result.nextCursor || ""
  } catch (error) {
    if (sequence === loadSequence) ElMessage.error(messageOf(error, "任务加载失败"))
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

function revokePreview() {
	if (previewImageUrl.value) URL.revokeObjectURL(previewImageUrl.value)
	previewImageUrl.value = ""
}

function submitSearch() {
  search.value = searchDraft.value.trim()
  resetPagination()
  void loadTasks()
}

function applyFilters() {
  resetPagination()
  void loadTasks()
}

function resetPagination() {
  page.value = 1
  cursorHistory.value = [""]
  nextCursor.value = ""
}

function goToPreviousPage() {
  if (page.value <= 1) return
  page.value -= 1
  void loadTasks()
}

function goToNextPage() {
  if (!nextCursor.value) return
  cursorHistory.value[page.value] = nextCursor.value
  page.value += 1
  void loadTasks()
}

function changePageSize(value: number) {
  pageSize.value = value
  resetPagination()
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

async function openImagePreview(task: generationApi.AdminGenerationTask) {
	if (task.status !== "succeeded" || task.type !== "image") return
	revokePreview()
	previewTask.value = task
	imagePreviewOpen.value = true
	previewLoading.value = true
	try {
		previewImageUrl.value = URL.createObjectURL(await generationApi.getGenerationPreview(task.taskId))
	} catch (error) {
		ElMessage.error(messageOf(error, "原图预览加载失败"))
	} finally {
		previewLoading.value = false
	}
}

async function checkReviewTask(task:generationApi.AdminGenerationTask){actingTaskId.value=task.taskId;try{selectedTask.value=await generationApi.checkGeneration(task.taskId);await loadTasks();ElMessage.info(selectedTask.value.status==="succeeded"?"任务已完成":"上游仍在处理中")}catch(error){ElMessage.error(messageOf(error,"状态检查失败"))}finally{actingTaskId.value=""}}
function openReview(task:generationApi.AdminGenerationTask){selectedTask.value=task;reviewAction.value="confirm_failed";reviewValue.value="";reviewOpen.value=true}
async function submitReview(){if(!selectedTask.value)return;actingTaskId.value=selectedTask.value.taskId;try{selectedTask.value=await generationApi.reviewGeneration(selectedTask.value.taskId,reviewAction.value==="provide_result"?{action:"provide_result",resultUrl:reviewValue.value.trim()}:{action:"confirm_failed",reason:reviewValue.value.trim()});reviewOpen.value=false;await loadTasks();ElMessage.success("任务已处理")}catch(error){ElMessage.error(messageOf(error,"任务处理失败"))}finally{actingTaskId.value=""}}

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
function statusLabel(status: generationApi.GenerationStatus) { return ({ queued: "排队中", running: "生成中", needs_review:"待确认", succeeded: "已完成", failed: "失败", cancelled: "已取消" })[status] }
function kindLabel(kind: generationApi.GenerationKind) { return kind === "image" ? "图片" : "视频" }
function messageOf(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback }
</script>

<template>
  <section class="generation-workspace">
    <div class="generation-metrics">
      <div><span>全部任务</span><strong>{{ summary.total }}</strong></div>
	  <div><span>处理中 / 待确认</span><strong>{{ summary.queued + summary.running }} / {{ summary.needsReview }}</strong></div>
      <div><span>成功率</span><strong>{{ successRate }}%</strong></div>
      <div><span>失败 / 取消</span><strong>{{ summary.failed + summary.cancelled }}</strong></div>
      <div><span>实际消耗积分</span><strong>{{ formatPoints(summary.pointsSpent) }}</strong></div>
    </div>

    <div class="generation-toolbar">
      <form class="generation-search" @submit.prevent="submitSearch"><Search :size="16" /><input v-model="searchDraft" placeholder="任务 ID、用户、账号 ID、模型或渠道" /><button type="submit">搜索</button></form>
	  <ElSelect v-model="statusFilter" aria-label="状态筛选" placeholder="全部状态" @change="applyFilters"><ElOption label="全部状态" value="" /><ElOption label="排队中" value="queued" /><ElOption label="生成中" value="running" /><ElOption label="待确认" value="needs_review" /><ElOption label="已完成" value="succeeded" /><ElOption label="失败" value="failed" /><ElOption label="已取消" value="cancelled" /></ElSelect>
      <ElSelect v-model="kindFilter" aria-label="类型筛选" placeholder="全部类型" @change="applyFilters"><ElOption label="全部类型" value="" /><ElOption label="图片" value="image" /><ElOption label="视频" value="video" /></ElSelect>
      <ElSelect v-model="windowFilter" aria-label="时间范围" @change="applyFilters"><ElOption label="最近 24 小时" value="24h" /><ElOption label="最近 7 天" value="7d" /><ElOption label="最近 30 天" value="30d" /><ElOption label="全部时间" value="all" /></ElSelect>
      <button class="generation-refresh" type="button" :disabled="loading" @click="loadTasks"><RefreshCcw :class="{ spin: loading }" :size="16" />刷新</button>
    </div>

    <div v-if="loading" class="generation-loading"><LoaderCircle class="spin" :size="22" />正在加载生成任务</div>
    <div v-else-if="tasks.length" class="generation-table-wrap">
      <table class="generation-table">
        <thead><tr><th>任务</th><th>用户</th><th>渠道 / 模型</th><th>参数</th><th>状态</th><th>积分</th><th>时间</th><th>操作</th></tr></thead>
        <tbody><tr v-for="task in tasks" :key="task.taskId">
          <td><span class="generation-task-id"><button class="generation-task-thumb" type="button" :disabled="task.status !== 'succeeded' || task.type !== 'image'" :title="task.status === 'succeeded' && task.type === 'image' ? '查看生成图片' : undefined" @click="openImagePreview(task)"><GenerationThumbnail v-if="task.status === 'succeeded' && (task.type === 'image' || task.type === 'video')" :task-id="task.taskId" :kind="task.type" :alt="task.prompt" /><component :is="task.type === 'image' ? Image : Video" v-else :size="16" /></button><span><strong>{{ shortTask(task.taskId) }}</strong><small>{{ kindLabel(task.type) }} · 重试 {{ task.retryCount }} 次</small></span></span></td>
          <td><span class="generation-user"><strong>{{ task.username }}</strong><small>{{ accountLabel(task.accountId) }} · {{ task.email }}</small></span></td>
          <td><span class="generation-channel"><strong>{{ task.channelName || "渠道已删除" }}</strong><small>{{ task.model }}</small></span></td>
          <td><span>{{ task.size || "-" }} · {{ task.quality || "-" }}</span><small v-if="task.referenceCount">{{ task.referenceCount }} 张参考图</small></td>
          <td><span class="generation-status" :class="`is-${task.status}`">{{ statusLabel(task.status) }}</span></td>
          <td><span class="generation-cost"><Coins :size="13" />{{ formatPoints(task.pointsCost) }}</span><small v-if="task.pointsRefunded">已退款</small></td>
          <td><span>{{ formatDate(task.createdAt) }}</span><small>{{ duration(task) }}</small></td>
          <td><div class="generation-actions"><button type="button" title="查看详情" @click="openDetail(task)"><Eye :size="15" /></button><button v-if="task.status === 'needs_review' && task.upstreamTaskId" type="button" title="检查上游状态" :disabled="actingTaskId === task.taskId" @click="checkReviewTask(task)"><RefreshCcw :size="15" /></button><button v-if="task.status === 'needs_review'" type="button" title="人工接管" @click="openReview(task)"><CircleAlert :size="15" /></button><button v-if="task.status === 'failed' || task.status === 'cancelled'" type="button" title="重试任务" :disabled="actingTaskId === task.taskId" @click="runAction(task, 'retry')"><RotateCcw :size="15" /></button><button v-if="task.status === 'queued' || (task.status === 'running' && task.upstreamTaskId)" type="button" title="取消任务" :disabled="actingTaskId === task.taskId" @click="runAction(task, 'cancel')"><Ban :size="15" /></button><button v-if="task.status === 'succeeded' && !task.pointsRefunded && task.pointsCost > 0" type="button" title="补退积分" :disabled="actingTaskId === task.taskId" @click="runAction(task, 'refund')"><Coins :size="15" /></button></div></td>
        </tr></tbody>
      </table>
    </div>

	<div v-if="!loading && tasks.length" class="generation-mobile-list"><article v-for="task in tasks" :key="task.taskId"><div><span class="generation-task-id"><button class="generation-task-thumb" type="button" :disabled="task.status !== 'succeeded' || task.type !== 'image'" :title="task.status === 'succeeded' && task.type === 'image' ? '查看生成图片' : undefined" @click="openImagePreview(task)"><GenerationThumbnail v-if="task.status === 'succeeded' && (task.type === 'image' || task.type === 'video')" :task-id="task.taskId" :kind="task.type" :alt="task.prompt" /><component :is="task.type === 'image' ? Image : Video" v-else :size="16" /></button><strong>{{ shortTask(task.taskId) }}</strong></span><span class="generation-status" :class="`is-${task.status}`">{{ statusLabel(task.status) }}</span></div><strong>{{ task.username }} · {{ accountLabel(task.accountId) }}</strong><span>{{ task.channelName || "渠道已删除" }} · {{ task.model }}</span><small>{{ task.size || "-" }} · {{ task.quality || "-" }} · {{ formatPoints(task.pointsCost) }} 积分 · {{ formatDate(task.createdAt) }}</small><button type="button" @click="openDetail(task)"><Eye :size="15" />查看详情</button></article></div>
    <div v-if="!loading && !tasks.length" class="generation-empty"><Clock3 :size="30" /><strong>没有找到生成任务</strong><span>调整搜索或筛选条件后再试。</span></div>
    <footer v-if="total" class="generation-pagination"><span>共 {{ total }} 个任务</span><div class="generation-cursor-pagination"><button type="button" :disabled="page <= 1" @click="goToPreviousPage">上一页</button><strong>第 {{ page }} 页</strong><button type="button" :disabled="!nextCursor" @click="goToNextPage">下一页</button></div><ElSelect :model-value="pageSize" aria-label="每页数量" @change="changePageSize"><ElOption label="20 条/页" :value="20" /><ElOption label="50 条/页" :value="50" /></ElSelect></footer>

	<ElDrawer v-model="detailOpen" title="任务详情" size="min(560px, 100vw)" append-to-body>
      <div v-if="selectedTask" class="generation-detail">
        <div class="generation-detail-head"><span class="generation-status" :class="`is-${selectedTask.status}`">{{ statusLabel(selectedTask.status) }}</span><code>{{ selectedTask.taskId }}</code></div>
        <section><strong>用户</strong><p>{{ selectedTask.username }} · {{ accountLabel(selectedTask.accountId) }}</p><small>{{ selectedTask.email }}</small></section>
        <section><strong>执行配置</strong><dl><div><dt>渠道</dt><dd>{{ selectedTask.channelName || "渠道已删除" }} · {{ selectedTask.channelProtocol || "-" }}</dd></div><div><dt>模型</dt><dd>{{ selectedTask.model }}</dd></div><div><dt>参数</dt><dd>{{ selectedTask.size || "-" }} · {{ selectedTask.quality || "-" }} · {{ selectedTask.width }}×{{ selectedTask.height }}</dd></div><div><dt>参考图</dt><dd>{{ selectedTask.referenceCount }} 张</dd></div></dl></section>
        <section><strong>提示词</strong><p class="generation-prompt">{{ selectedTask.prompt }}</p></section>
        <section><strong>积分与时间</strong><dl><div><dt>任务成本</dt><dd>{{ formatPoints(selectedTask.pointsCost) }} 积分{{ selectedTask.pointsRefunded ? " · 已退款" : "" }}</dd></div><div><dt>创建时间</dt><dd>{{ formatDate(selectedTask.createdAt) }}</dd></div><div><dt>开始时间</dt><dd>{{ formatDate(selectedTask.startedAt) }}</dd></div><div><dt>完成时间</dt><dd>{{ formatDate(selectedTask.completedAt) }}</dd></div><div><dt>执行耗时</dt><dd>{{ duration(selectedTask) }}</dd></div></dl></section>
		<section v-if="selectedTask.errorMessage" class="generation-error"><strong><CircleAlert :size="15" />失败原因</strong><p>{{ selectedTask.errorMessage }}</p></section>
		<section><strong>执行记录</strong><div v-if="selectedTask.attempts?.length" class="generation-attempts"><article v-for="attempt in selectedTask.attempts" :key="attempt.attemptNo"><i :class="`is-${attempt.status}`" /><div><strong>第 {{ attempt.attemptNo }} 次 · {{ attempt.channelName || '渠道已删除' }}</strong><span>{{ attempt.protocol }} · {{ attempt.requestPath || '-' }} · HTTP {{ attempt.httpStatus || '-' }} · {{ attempt.durationMs ?? '-' }}ms</span><small v-if="attempt.errorMessage">{{ attempt.errorMessage }}</small></div></article></div><p v-else>尚无上游执行记录</p></section>
        <div class="generation-detail-actions"><ElButton v-if="selectedTask.status === 'needs_review' && selectedTask.upstreamTaskId" :loading="actingTaskId === selectedTask.taskId" @click="checkReviewTask(selectedTask)"><RefreshCcw :size="15" />检查状态</ElButton><ElButton v-if="selectedTask.status === 'needs_review'" type="warning" @click="openReview(selectedTask)"><CircleAlert :size="15" />人工接管</ElButton><ElButton v-if="selectedTask.status === 'failed' || selectedTask.status === 'cancelled'" type="primary" :loading="actingTaskId === selectedTask.taskId" @click="runAction(selectedTask, 'retry')"><RotateCcw :size="15" />重新排队</ElButton><ElButton v-if="selectedTask.status === 'queued' || (selectedTask.status === 'running' && selectedTask.upstreamTaskId)" type="danger" plain :loading="actingTaskId === selectedTask.taskId" @click="runAction(selectedTask, 'cancel')"><Ban :size="15" />取消任务</ElButton><ElButton v-if="selectedTask.status === 'succeeded' && !selectedTask.pointsRefunded && selectedTask.pointsCost > 0" :loading="actingTaskId === selectedTask.taskId" @click="runAction(selectedTask, 'refund')"><Coins :size="15" />补退积分</ElButton></div>
      </div>
	</ElDrawer>

	<ElDialog v-model="imagePreviewOpen" class="generation-image-preview" :title="previewTask ? `图片预览 · ${shortTask(previewTask.taskId)}` : '图片预览'" width="min(920px, calc(100vw - 28px))" append-to-body destroy-on-close>
	  <div v-if="previewLoading" class="generation-image-preview__body"><LoaderCircle class="spin" :size="24" />正在加载原图</div>
	  <div v-else-if="previewTask && previewImageUrl" class="generation-image-preview__body">
		<img :src="previewImageUrl" :alt="previewTask.prompt" />
		<div><strong>{{ previewTask.username }} · {{ accountLabel(previewTask.accountId) }}</strong><span>{{ previewTask.model }} · {{ previewTask.width }}×{{ previewTask.height }}</span></div>
	  </div>
	</ElDialog>
	<ElDialog v-model="reviewOpen" title="人工接管待确认任务" width="min(560px, calc(100vw - 28px))" append-to-body>
	  <div class="generation-review-form"><ElSelect v-model="reviewAction"><ElOption label="确认失败并退款" value="confirm_failed" /><ElOption label="提供结果地址" value="provide_result" /></ElSelect><ElInput v-model="reviewValue" :placeholder="reviewAction === 'provide_result' ? '输入 HTTPS 图片结果地址' : '填写公开失败原因（可选）'" /></div>
	  <template #footer><ElButton @click="reviewOpen=false">取消</ElButton><ElButton type="primary" :loading="Boolean(actingTaskId)" @click="submitReview">确认处理</ElButton></template>
	</ElDialog>
  </section>
</template>
