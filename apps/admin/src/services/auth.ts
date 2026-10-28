import { request } from "./http"

export type AdminUser = {
  id: string
  email: string
  username: string
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
