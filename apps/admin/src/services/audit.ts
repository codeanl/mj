import { request } from "./http"
import type { AuditItem } from "./dashboard"

export type AuditPage = { items: AuditItem[]; total: number; page: number; pageSize: number }

export function listAudit(input: { page: number; pageSize: number; search?: string; action?: string }) {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) })
  if (input.search?.trim()) query.set("search", input.search.trim())
  if (input.action) query.set("action", input.action)
  return request<AuditPage>(`/admin/audit?${query}`)
}
