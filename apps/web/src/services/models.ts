import { http, type ApiResponse } from "./http"

export type PublicModel = {
  id: string
  displayName: string
	capability: "image" | "video"
	capabilityConfig?: { ratios?: string[]; qualities?: string[]; minDuration?: number; maxDuration?: number; modes?: string[]; supportsSound?: boolean; supportsWatermark?: boolean }
}

export async function listVideoModels() {
	const response = await http.get<ApiResponse<{ models: PublicModel[] }>>("/models?capability=video")
	return response.data.data.models
}

export async function listImageModels() {
  const response = await http.get<ApiResponse<{ models: PublicModel[] }>>("/models?capability=image")
  return response.data.data.models
}
