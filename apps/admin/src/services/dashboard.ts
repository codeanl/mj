import { request } from "./http"

export type DashboardSummary = {
  usersTotal: number
  usersToday: number
  tasksToday: number
  succeededToday: number
  failedToday: number
  successRate: number
  pointsSpentToday: number
  activeTasks: number
  needsReview: number
  storageBytes: number
  averageLatencyMs: number
  unhealthyChannels: number
  enabledChannelCount: number
}

export type DailyMetric = { date: string; total: number; succeeded: number; failed: number; points: number }
export type DashboardAlert = { type: "generation" | "channel"; targetId: string; title: string; detail: string; createdAt: string }
export type AuditItem = { id: string; actorAccountId: number; actorUsername: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; ipAddress: string; userAgent: string; requestId: string; succeeded: boolean; statusCode: number; createdAt: string }
export type DashboardData = { summary: DashboardSummary; trend: DailyMetric[]; alerts: DashboardAlert[]; recentAudit: AuditItem[] }

export function getDashboard() {
  return request<DashboardData>("/admin/dashboard")
}
