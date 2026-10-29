import { ADMIN_ACCESS_TOKEN_KEY, request } from "./http"

export type AdminUser = {
  id: string
  email: string
  username: string
  avatarUrl?: string
  role: "user" | "admin"
  status: "active" | "disabled"
  createdAt: string
}

export type AuthResult = {
  accessToken: string
  tokenType: "Bearer"
  expiresIn: number
  user: AdminUser
}

export function login(email: string, password: string) {
  return request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })
}

export function currentUser() {
  return request<AdminUser>("/auth/me")
}

export function logout() {
  return request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" })
}

export async function getAvatar() {
  const token = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY)
  const response = await fetch("/api/v1/profile/avatar", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) throw new Error("头像不存在")
  return response.blob()
}
