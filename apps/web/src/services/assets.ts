import axios from "axios"

import { http, type ApiResponse } from "./http"

export type AssetType = "image" | "video"
export type AssetSource = "generated" | "uploaded"
export type AssetStatus = "generating" | "ready" | "failed"

export type Asset = {
  id: string
  type: AssetType
  source: AssetSource
  status: AssetStatus
  title: string
  url: string
  downloadUrl: string
  sizeBytes: number
  width: number
  height: number
  durationSeconds?: number
  createdAt: string
  errorMessage?: string
}

export type AssetPage = {
  items: Asset[]
  total: number
  page: number
  pageSize: number
}

export async function listAssets(params: { page: number; pageSize: number; type?: AssetType; source?: AssetSource; search?: string }) {
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
