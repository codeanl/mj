import { http, type ApiResponse } from "./http"

export type PublicModel = {
  id: string
  displayName: string
  capability: "image"
}

export async function listImageModels() {
  const response = await http.get<ApiResponse<{ models: PublicModel[] }>>("/models?capability=image")
  return response.data.data.models
}
