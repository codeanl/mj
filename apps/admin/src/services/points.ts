import { request } from "./http"

export type ModelCapability = "text" | "image" | "video" | "audio"

export type PointSettings = {
  initialPoints: number
  defaultModelCost: number
  imageQualityMultipliers: Record<string, number>
  videoQualityMultipliers: Record<string, number>
  updatedAt: string
}

export type ModelPointRule = { modelId: string; cost: number }
export type PointModel = { modelId: string; displayName: string; capability: ModelCapability }
export type PointRuleConfig = { settings: PointSettings; rules: ModelPointRule[]; models: PointModel[] }

export function getPointRules() {
  return request<PointRuleConfig>("/admin/points/rules")
}

export function savePointRules(config: PointRuleConfig) {
  return request<PointRuleConfig>("/admin/points/rules", { method: "PUT", body: JSON.stringify(config) })
}

export function adjustUserPoints(accountId: number, amount: number, description: string) {
  return request<{ balance: number }>(`/admin/users/${accountId}/points`, { method: "POST", body: JSON.stringify({ amount, description }) })
}
