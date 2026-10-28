import { ADMIN_ACCESS_TOKEN_KEY, request } from "./http"

export type GenerationStatus = "queued" | "running" | "needs_review" | "succeeded" | "failed" | "cancelled"
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
	upstreamTaskId?: string
	reviewReason?: string
	attempts: Array<{ attemptNo:number; channelId?:string; channelName:string; protocol:string; requestPath:string; status:string; httpStatus?:number; durationMs?:number; errorMessage?:string; createdAt:string; completedAt?:string }>
}

export type GenerationSummary = {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
	needsReview: number
  pointsSpent: number
}

export type GenerationPage = {
  items: AdminGenerationTask[]
  total: number
  page: number
  pageSize: number
  nextCursor?: string
  summary: GenerationSummary
}

export type GenerationActionResult = {
  task: AdminGenerationTask
  pointsRemaining?: number
  refundedPointCost?: number
}

export function listGenerations(input: { page: number; pageSize: number; search?: string; status?: GenerationStatus; type?: GenerationKind; window: "24h" | "7d" | "30d" | "all"; cursor?: string }) {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) })
  if (input.search?.trim()) query.set("search", input.search.trim())
  if (input.status) query.set("status", input.status)
  if (input.type) query.set("type", input.type)
  query.set("window", input.window)
  if (input.cursor) query.set("cursor", input.cursor)
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

export async function getGenerationPreview(taskId: string, thumbnail = false, signal?: AbortSignal) {
  const token = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY)
  const suffix = thumbnail ? "?thumbnail=1" : ""
  const response = await fetch(`/api/v1/admin/generations/${encodeURIComponent(taskId)}/preview${suffix}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal })
  if (!response.ok) throw new Error("任务缩略图加载失败")
  return response.blob()
}

function action(taskId: string, name: "retry" | "cancel" | "refund") {
  return request<GenerationActionResult>(`/admin/generations/${encodeURIComponent(taskId)}/${name}`, { method: "POST" })
}

export function checkGeneration(taskId:string){ return request<AdminGenerationTask>(`/admin/generations/${encodeURIComponent(taskId)}/check`,{method:"POST"}) }
export function reviewGeneration(taskId:string,input:{action:"confirm_failed"|"provide_result";resultUrl?:string;reason?:string}){ return request<AdminGenerationTask>(`/admin/generations/${encodeURIComponent(taskId)}/review`,{method:"POST",body:JSON.stringify(input)}) }
