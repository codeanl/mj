<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useIntervalFn } from "@vueuse/core"
import { Ban, CircleAlert, Clock3, Image, ListChecks, LoaderCircle, RefreshCcw, RotateCcw, Video } from "@lucide/vue"

import * as assetApi from "@/services/assets"
import { apiErrorMessage } from "@/services/http"
import { notification } from "@/services/notifications"
import { cancelGenerationTask, checkGenerationTask, retryGenerationTask } from "@/services/generation"
import { generationStatusGuide, generationStatusInfo } from "@/lib/generation-status"
import { useAuthStore } from "@/stores/auth"

type TaskFilter = "all" | assetApi.AssetStatus

const authStore = useAuthStore()
const tasks = ref<assetApi.Asset[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const filter = ref<TaskFilter>("all")
const loading = ref(false)
const refreshing = ref(false)
const actingTaskId = ref("")
let loadSequence = 0

const filters: Array<{ value: TaskFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "generating", label: "进行中" },
  { value: "needs_review", label: "等待确认" },
  { value: "failed", label: "失败" },
  { value: "ready", label: "已完成" },
]
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const hasActiveTasks = computed(() => tasks.value.some((task) => task.status === "generating" || task.status === "needs_review"))
const refreshInterval = Number(import.meta.env.VITE_GENERATION_REFRESH_INTERVAL_MS || 3000)
const { pause, resume } = useIntervalFn(() => {
  if (!loading.value && !refreshing.value && hasActiveTasks.value) void loadTasks(true)
}, Number.isFinite(refreshInterval) && refreshInterval > 0 ? refreshInterval : 3000, { immediate: false })

watch([filter, page], () => void loadTasks(false), { immediate: true })
watch(hasActiveTasks, (active) => active ? resume() : pause(), { immediate: true })
onBeforeUnmount(pause)

async function loadTasks(silent: boolean) {
  const sequence = ++loadSequence
  if (silent) refreshing.value = true
  else loading.value = true
  try {
    const result = await assetApi.listAssets({ page: page.value, pageSize, source: "generated", status: filter.value === "all" ? undefined : filter.value })
    if (sequence !== loadSequence) return
    tasks.value = result.items
    total.value = result.total
    if (page.value > totalPages.value) page.value = totalPages.value
  } catch (error) {
    if (sequence === loadSequence) notification.error(apiErrorMessage(error, "任务加载失败"))
  } finally {
    if (sequence === loadSequence) { loading.value = false; refreshing.value = false }
  }
}

function taskStatus(task: assetApi.Asset) {
  return task.generation?.status || (task.status === "ready" ? "succeeded" : task.status)
}

function canCancel(task: assetApi.Asset) {
  const status = taskStatus(task)
  return task.generationTaskId && (status === "queued" || (status === "running" && task.generation?.upstreamTaskId))
}

async function runAction(task: assetApi.Asset, action: "retry" | "check" | "cancel") {
  if (!task.generationTaskId || actingTaskId.value) return
  actingTaskId.value = task.generationTaskId
  try {
    const result = action === "retry" ? await retryGenerationTask(task.generationTaskId) : action === "check" ? await checkGenerationTask(task.generationTaskId) : await cancelGenerationTask(task.generationTaskId)
    if (result.pointsRemaining !== undefined) authStore.setPointsBalance(result.pointsRemaining)
    await loadTasks(true)
    notification.success(action === "retry" ? "任务已重新排队" : action === "cancel" ? "任务已取消，积分已退回" : result.status === "succeeded" ? "任务已完成" : "已检查原任务状态")
  } catch (error) {
    notification.error(apiErrorMessage(error, action === "retry" ? "任务重试失败" : action === "cancel" ? "任务取消失败" : "状态检查失败"))
  } finally {
    actingTaskId.value = ""
  }
}

function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "-"
}

function formatPoints(value?: number) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })
}
</script>

<template>
  <section class="tasks-page">
    <header class="tasks-header"><div><p>GENERATION TASKS</p><h1>任务中心</h1><span>统一查看图片与视频任务的执行、计费和恢复状态。</span></div><ListChecks :size="28" /></header>

    <section class="tasks-guide" aria-label="任务状态说明">
      <article v-for="item in generationStatusGuide" :key="item.status"><i :class="`is-${item.tone}`" /><div><strong>{{ item.label }}</strong><span>{{ item.description }}</span><small>{{ item.billing }}</small></div></article>
    </section>

    <div class="tasks-toolbar"><div role="tablist" aria-label="任务筛选"><button v-for="item in filters" :key="item.value" type="button" role="tab" :aria-selected="filter === item.value" :class="{ 'is-active': filter === item.value }" @click="filter = item.value; page = 1">{{ item.label }}</button></div><span v-if="refreshing"><RefreshCcw class="spin" :size="14" />正在同步</span></div>

    <div v-if="loading" class="tasks-state"><LoaderCircle class="spin" :size="22" />正在加载任务</div>
    <div v-else-if="!tasks.length" class="tasks-state"><ListChecks :size="28" /><strong>暂无符合条件的任务</strong></div>
    <div v-else class="tasks-list">
      <article v-for="task in tasks" :key="task.id">
        <span class="tasks-list__icon"><Video v-if="task.type === 'video'" :size="19" /><Image v-else :size="19" /></span>
        <div class="tasks-list__main"><div><strong>{{ task.title }}</strong><em class="task-status" :class="`is-${generationStatusInfo(taskStatus(task)).tone}`">{{ generationStatusInfo(taskStatus(task)).label }}</em></div><p>{{ generationStatusInfo(taskStatus(task)).description }}</p><small>{{ generationStatusInfo(taskStatus(task)).billing }}</small></div>
        <dl><div><dt>模型</dt><dd>{{ task.generation?.model || "-" }}</dd></div><div><dt>参数</dt><dd>{{ task.generation?.ratio || "-" }} · {{ task.generation?.quality || "-" }}<template v-if="task.generation?.requestedDurationSeconds"> · {{ task.generation.requestedDurationSeconds }}秒</template></dd></div><div><dt>积分</dt><dd>{{ formatPoints(task.generation?.pointsCost) }}</dd></div><div><dt>提交时间</dt><dd><Clock3 :size="12" />{{ formatDate(task.generation?.createdAt || task.createdAt) }}</dd></div></dl>
        <div class="tasks-list__actions"><button v-if="taskStatus(task) === 'failed'" type="button" :disabled="Boolean(actingTaskId)" @click="runAction(task, 'retry')"><LoaderCircle v-if="actingTaskId === task.generationTaskId" class="spin" :size="15" /><RotateCcw v-else :size="15" />重试</button><button v-if="taskStatus(task) === 'needs_review'" type="button" :disabled="Boolean(actingTaskId)" @click="runAction(task, 'check')"><LoaderCircle v-if="actingTaskId === task.generationTaskId" class="spin" :size="15" /><CircleAlert v-else :size="15" />检查原任务</button><button v-if="canCancel(task)" type="button" :disabled="Boolean(actingTaskId)" @click="runAction(task, 'cancel')"><LoaderCircle v-if="actingTaskId === task.generationTaskId" class="spin" :size="15" /><Ban v-else :size="15" />取消</button><RouterLink v-if="task.status === 'ready'" to="/assets">查看素材</RouterLink></div>
      </article>
    </div>

    <footer v-if="total" class="tasks-pagination"><span>共 {{ total }} 个任务</span><div><button type="button" :disabled="page <= 1" @click="page--">上一页</button><strong>{{ page }} / {{ totalPages }}</strong><button type="button" :disabled="page >= totalPages" @click="page++">下一页</button></div></footer>
  </section>
</template>
