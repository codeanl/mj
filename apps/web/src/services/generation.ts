import { http, type ApiResponse } from "./http"

export type GenerationTask = {
  taskId: string
  assetId: string
  type: "image" | "video"
	status: "queued" | "running" | "needs_review" | "succeeded" | "failed"
  model: string
  prompt: string
  size: string
  width: number
  height: number
  quality: string
  errorMessage?: string
  pointsCost: number
  pointsRemaining: number
  createdAt: string
}

export type ImageGenerationBatch = {
  tasks: GenerationTask[]
  pointsRemaining: number
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
	durations?: GenerationOption[]
}

export type GenerationCapabilities = {
  image: GenerationCapability
  video: GenerationCapability
}

export async function getGenerationCapabilities() {
  const response = await http.get<ApiResponse<GenerationCapabilities>>("/generations/capabilities")
  return response.data.data
}

export async function createImageGeneration(input: { requestId: string; prompt: string; model: string; size: string; quality: string; count: number; referenceAssetIds?: string[] }) {
	const response = await http.post<ApiResponse<ImageGenerationBatch>>("/generations/images", input)
  return response.data.data
}

export type VideoGenerationMode = "text" | "frames" | "reference"
export type VideoReferenceRole = "first_frame" | "last_frame" | "reference_image" | "reference_video" | "reference_audio"

export async function createVideoGeneration(input:{requestId:string;prompt:string;model:string;size:string;quality:string;durationSeconds:number;soundEnabled:boolean;watermarkEnabled:boolean;mode:VideoGenerationMode;references?:Array<{assetId:string;role:VideoReferenceRole}>}){
	const response=await http.post<ApiResponse<ImageGenerationBatch>>("/generations/videos",input)
	return response.data.data
}

export async function getGenerationTask(taskId: string) {
  const response = await http.get<ApiResponse<GenerationTask>>(`/generations/${encodeURIComponent(taskId)}`)
  return response.data.data
}

export async function retryGenerationTask(taskId: string) {
	const response = await http.post<ApiResponse<{ taskId: string; status: string; pointsRemaining?: number }>>(`/generations/${encodeURIComponent(taskId)}/retry`)
	return response.data.data
}

export async function checkGenerationTask(taskId: string) {
	const response = await http.post<ApiResponse<GenerationTask>>(`/generations/${encodeURIComponent(taskId)}/check`)
	return response.data.data
}

export async function cancelGenerationTask(taskId: string) {
	const response = await http.post<ApiResponse<{ taskId: string; status: string; pointsRemaining?: number }>>(`/generations/${encodeURIComponent(taskId)}/cancel`)
	return response.data.data
}
