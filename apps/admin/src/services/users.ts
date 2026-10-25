import { request } from "./http"

export type AdminUserRole = "user" | "admin"
export type AdminUserStatus = "active" | "disabled"

export type AdminUser = {
  accountId: number
  email: string
  username: string
  role: AdminUserRole
  status: AdminUserStatus
  pointsBalance: number
  createdAt: string
  updatedAt: string
  isSelf: boolean
}

export type UserSummary = {
  total: number
  active: number
  admins: number
  disabled: number
  totalPoints: number
}

export type UserPage = {
  items: AdminUser[]
  total: number
  page: number
  pageSize: number
  summary: UserSummary
}

export type UserInput = {
  email: string
  username: string
  role: AdminUserRole
  status: AdminUserStatus
}

export function listUsers(input: { page: number; pageSize: number; search?: string; role?: AdminUserRole; status?: AdminUserStatus }) {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) })
  if (input.search?.trim()) query.set("search", input.search.trim())
  if (input.role) query.set("role", input.role)
  if (input.status) query.set("status", input.status)
  return request<UserPage>(`/admin/users?${query}`)
}

export function createUser(input: UserInput & { password: string }) {
  return request<{ user: AdminUser }>("/admin/users", { method: "POST", body: JSON.stringify(input) }).then((result) => result.user)
}

export function updateUser(accountId: number, input: UserInput) {
  return request<{ user: AdminUser }>(`/admin/users/${accountId}`, { method: "PATCH", body: JSON.stringify(input) }).then((result) => result.user)
}

export function resetUserPassword(accountId: number, password: string) {
  return request<{ updated: boolean }>(`/admin/users/${accountId}/password`, { method: "PATCH", body: JSON.stringify({ password }) })
}
