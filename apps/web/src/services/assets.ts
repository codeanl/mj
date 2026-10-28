import axios from "axios"

import { http, type ApiResponse } from "./http"

export type AssetType = "image" | "video" | "audio"
export type AssetSource = "generated" | "uploaded"
export type AssetStatus = "generating" | "needs_review" | "ready" | "failed"

export type AssetGenerationMetadata = {
  taskId: string
  status: string
  provider: string
  model: string
  prompt: string
  ratio: string
  quality: string
  requestedDurationSeconds?: number
  soundEnabled: boolean
  watermarkEnabled: boolean
  videoMode?: string
  referenceCount: number
  pointsCost: number
  retryCount: number
  channelName?: string
  protocol?: string
  upstreamTaskId?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  executionDurationMs?: number
  references?: Array<{ assetId: string; type: AssetType; role: string; title: string; url: string }>
}

export type Asset = {
  id: string
  type: AssetType
  source: AssetSource
  status: AssetStatus
  title: string
  originalName?: string
  mimeType?: string
  url: string
  downloadUrl: string
  posterUrl?: string
  sizeBytes: number
  width: number
  height: number
  durationSeconds?: number
  createdAt: string
  errorMessage?: string
	generationTaskId?: string
  generation?: AssetGenerationMetadata
}

export type AssetPage = {
  items: Asset[]
  total: number
  page: number
  pageSize: number
}

export type AssetDownloadTicket = {
  url: string
  expiresAt: string
}

export async function listAssets(params: { page: number; pageSize: number; type?: AssetType; source?: AssetSource; status?: AssetStatus; search?: string }) {
  const response = await http.get<ApiResponse<AssetPage>>("/assets", { params })
  return response.data.data
}

export async function uploadAsset(file: File, title = "") {
  const formData = new FormData()
  formData.append("file", file)
  if (title.trim()) formData.append("title", title.trim())
  const response = await http.post<ApiResponse<Asset>>("/assets", formData, { timeout: 0 })
  return response.data.data
}

export async function getAssetContent(url: string) {
  const client = /^https?:\/\//i.test(url) ? axios : http
  const requestURL = client === http && url.startsWith("/api/v1/") ? url.slice("/api/v1".length) : url
  const response = await client.get<Blob>(requestURL, {
    responseType: "blob",
    timeout: 0,
  })
  return response.data
}

export async function createAssetDownloadTicket(assetId: string) {
  const response = await http.post<ApiResponse<AssetDownloadTicket>>(`/assets/${encodeURIComponent(assetId)}/download-ticket`)
  return response.data.data
}

export async function createAssetArchiveTicket(ids: string[]) {
  const response = await http.post<ApiResponse<AssetDownloadTicket>>("/assets/archive-ticket", { ids })
  return response.data.data
}

export async function renameAsset(assetId: string, title: string) {
  const response = await http.patch<ApiResponse<Asset>>(`/assets/${encodeURIComponent(assetId)}`, { title })
  return response.data.data
}

export async function deleteAssets(ids: string[]) {
  const response = await http.post<ApiResponse<{ deleted: number }>>("/assets/batch-delete", { ids })
  return response.data.data
}
