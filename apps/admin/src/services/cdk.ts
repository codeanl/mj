import { request } from "./http"

export type CdkRedemption = {
  accountId: number
  username: string
  points: number
  redeemedAt: string
}

export type CdkCode = {
  id: string
  code: string
  codePreview: string
  points: number
  maxRedemptions: number
  redeemedCount: number
  status: "active" | "disabled"
  note: string
  expiresAt?: string
  createdAt: string
  redemptions: CdkRedemption[]
}

export type CdkPage = {
  items: CdkCode[]
  total: number
  page: number
  pageSize: number
  stats: { total: number; redeemed: number; unused: number; expired: number }
}

export type GenerateCdkInput = {
  count: number
  points: number
  maxRedemptions: number
  expiresInDays: number | null
  note: string
}

export function listCdk(input: { page: number; pageSize: number; search: string; filter: string }) {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize), search: input.search, filter: input.filter })
  return request<CdkPage>(`/admin/cdk?${query}`)
}

export function generateCdk(input: GenerateCdkInput) {
  return request<{ items: CdkCode[] }>("/admin/cdk", { method: "POST", body: JSON.stringify(input) }).then((result) => result.items)
}

export function deleteCdk(id: string) {
  return request<{ deleted: number }>(`/admin/cdk/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export function deleteCdkBatch(ids: string[]) {
  return request<{ deleted: number }>("/admin/cdk/batch-delete", { method: "POST", body: JSON.stringify({ ids }) })
}
