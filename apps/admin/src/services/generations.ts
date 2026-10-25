import { ADMIN_ACCESS_TOKEN_KEY, request } from "./http"

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
export type GenerationKind = "image" | "video"

export type AdminGenerationTask = {
  taskId: string
  assetId: string
  type: GenerationKind
  status: GenerationStatus
  model: string
  prompt: string
  size: string
  quality: string
  width: number
  height: number
  referenceCount: number
  pointsCost: number
  pointsRefunded: boolean
  retryCount: number
  errorMessage?: string
  accountId: number
  username: string
  email: string
  channelId?: string
  channelName: string
  channelProtocol: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export type GenerationSummary = {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
  pointsSpent: number
}

export type GenerationPage = {
  items: AdminGenerationTask[]
  total: number
  page: number
  pageSize: number
  summary: GenerationSummary
}

export type GenerationActionResult = {
  task: AdminGenerationTask
  pointsRemaining?: number
  refundedPointCost?: number
}

export function listGenerations(input: { page: number; pageSize: number; search?: string; status?: GenerationStatus; type?: GenerationKind }) {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) })
  if (input.search?.trim()) query.set("search", input.search.trim())
  if (input.status) query.set("status", input.status)
  if (input.type) query.set("type", input.type)
  return request<GenerationPage>(`/admin/generations?${query}`)
}

export function getGeneration(taskId: string) {
  return request<AdminGenerationTask>(`/admin/generations/${encodeURIComponent(taskId)}`)
}

export function retryGeneration(taskId: string) {
  return action(taskId, "retry")
}

export function cancelGeneration(taskId: string) {
  return action(taskId, "cancel")
}

export function refundGeneration(taskId: string) {
  return action(taskId, "refund")
}

export async function getGenerationPreview(taskId: string) {
  const token = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY)
  const response = await fetch(`/api/v1/admin/generations/${encodeURIComponent(taskId)}/preview`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
  if (!response.ok) throw new Error("任务缩略图加载失败")
  return response.blob()
}

function action(taskId: string, name: "retry" | "cancel" | "refund") {
  return request<GenerationActionResult>(`/admin/generations/${encodeURIComponent(taskId)}/${name}`, { method: "POST" })
}
