<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { AlertTriangle, Clock3, Coins, Database, Gauge, LoaderCircle, RefreshCcw, Sparkles, UsersRound } from "@lucide/vue"

import * as dashboardApi from "@/services/dashboard"

const data = ref<dashboardApi.DashboardData | null>(null)
const loading = ref(true)
const error = ref("")
const maxTrend = computed(() => Math.max(1, ...(data.value?.trend.map((item) => item.total) || [1])))

onMounted(() => void loadDashboard())

async function loadDashboard() {
  loading.value = true
  error.value = ""
  try {
    data.value = await dashboardApi.getDashboard()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "管理总览加载失败"
  } finally {
    loading.value = false
  }
}

function accountLabel(value: number) { return `ID：${String(value).padStart(4, "0")}` }
function formatNumber(value: number) { return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) }
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}
function formatDate(value: string, dateOnly = false) {
  return new Intl.DateTimeFormat("zh-CN", dateOnly ? { month: "2-digit", day: "2-digit" } : { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}
function actionLabel(value: string) {
  return ({ "user.create": "创建用户", "user.update": "更新用户", "user.password_reset": "重置密码", "points.adjust": "调整积分", "points.rules_update": "修改积分规则", "channel.create": "创建渠道", "channel.update": "更新渠道", "channel.delete": "删除渠道", "generation.retry": "重试任务", "generation.cancel": "取消任务", "generation.refund": "补退积分" } as Record<string, string>)[value] || value
}
</script>

<template>
  <section class="dashboard-workspace">
    <div v-if="loading" class="admin-state"><LoaderCircle class="spin" :size="22" />正在加载管理总览</div>
    <div v-else-if="error" class="admin-state is-error"><AlertTriangle :size="24" /><strong>{{ error }}</strong><button type="button" @click="loadDashboard"><RefreshCcw :size="16" />重新加载</button></div>
    <template v-else-if="data">
      <div class="dashboard-metrics">
        <article><span><UsersRound :size="17" />用户</span><strong>{{ formatNumber(data.summary.usersTotal) }}</strong><small>今日新增 {{ formatNumber(data.summary.usersToday) }}</small></article>
        <article><span><Sparkles :size="17" />今日生成</span><strong>{{ formatNumber(data.summary.tasksToday) }}</strong><small>{{ data.summary.succeededToday }} 成功 · {{ data.summary.failedToday }} 失败</small></article>
        <article><span><Gauge :size="17" />今日成功率</span><strong>{{ data.summary.successRate.toFixed(1) }}%</strong><small>{{ data.summary.activeTasks }} 个任务处理中</small></article>
        <article><span><Coins :size="17" />今日积分消耗</span><strong>{{ formatNumber(data.summary.pointsSpentToday) }}</strong><small>按未退款任务统计</small></article>
        <article><span><Clock3 :size="17" />待人工确认</span><strong>{{ data.summary.needsReview }}</strong><small>需要检查上游或接管</small></article>
        <article><span><Database :size="17" />素材存储</span><strong>{{ formatBytes(data.summary.storageBytes) }}</strong><small>{{ data.summary.enabledChannelCount }} 个启用渠道 · 平均 {{ data.summary.averageLatencyMs }}ms</small></article>
      </div>

      <div class="dashboard-grid">
        <section class="dashboard-section dashboard-trend">
          <header><div><strong>近 7 天生成趋势</strong><span>成功、失败和总任务量</span></div></header>
          <div class="dashboard-chart" aria-label="近 7 天生成趋势图">
            <div v-for="item in data.trend" :key="item.date" class="dashboard-chart__item">
              <div class="dashboard-chart__bars"><i class="is-total" :style="{ height: `${Math.max(4, item.total / maxTrend * 100)}%` }" /><i class="is-success" :style="{ height: `${Math.max(2, item.succeeded / maxTrend * 100)}%` }" /></div>
              <strong>{{ item.total }}</strong><span>{{ formatDate(item.date, true) }}</span>
            </div>
          </div>
        </section>

        <section class="dashboard-section">
          <header><div><strong>运行告警</strong><span>{{ data.summary.unhealthyChannels }} 个渠道异常</span></div></header>
          <div v-if="data.alerts.length" class="dashboard-feed"><article v-for="alert in data.alerts" :key="`${alert.type}-${alert.targetId}`"><i :class="alert.type" /><span><strong>{{ alert.title }}</strong><small>{{ alert.detail || "暂无详细原因" }}</small></span><time>{{ formatDate(alert.createdAt) }}</time></article></div>
          <div v-else class="dashboard-empty">当前没有运行告警</div>
        </section>

        <section class="dashboard-section dashboard-audit-preview">
          <header><div><strong>最近管理操作</strong><span>敏感变更均记录请求与操作者</span></div><RouterLink to="/audit">查看全部</RouterLink></header>
          <div v-if="data.recentAudit.length" class="dashboard-feed"><article v-for="item in data.recentAudit" :key="item.id"><i class="audit" /><span><strong>{{ actionLabel(item.action) }}</strong><small>{{ item.actorUsername }} · {{ accountLabel(item.actorAccountId) }} · {{ item.targetType }} {{ item.targetId }}</small></span><time>{{ formatDate(item.createdAt) }}</time></article></div>
          <div v-else class="dashboard-empty">暂无管理操作记录</div>
        </section>
      </div>
    </template>
  </section>
</template>
