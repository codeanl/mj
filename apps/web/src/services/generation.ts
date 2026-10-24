import { http, type ApiResponse } from "./http"

export type GenerationTask = {
  taskId: string
  assetId: string
  type: "image" | "video"
  status: "queued" | "running" | "succeeded" | "failed"
  model: string
  prompt: string
  size: string
  width: number
  height: number
  quality: string
  errorMessage?: string
  createdAt: string
}

export type GenerationOption = {
  value: string
  label: string
}

export type ImageSizeOption = GenerationOption & {
  width: number
  height: number
}

export type GenerationCapability = {
  enabled: boolean
  models: GenerationOption[]
  sizes: ImageSizeOption[]
  qualities: GenerationOption[]
}

export type GenerationCapabilities = {
  image: GenerationCapability
  video: GenerationCapability
}

export async function getGenerationCapabilities() {
  const response = await http.get<ApiResponse<GenerationCapabilities>>("/generations/capabilities")
  return response.data.data
}

export async function createImageGeneration(input: { prompt: string; model: string; size: string; quality: string }) {
  const response = await http.post<ApiResponse<GenerationTask>>("/generations/images", input)
  return response.data.data
}

export async function getGenerationTask(taskId: string) {
  const response = await http.get<ApiResponse<GenerationTask>>(`/generations/${encodeURIComponent(taskId)}`)
  return response.data.data
}
