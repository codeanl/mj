import { http, type ApiResponse } from "./http"

export type CurrentUser = {
  id: string
  email: string
  username: string
  avatarUrl?: string
  role: "user" | "admin"
  status: "active" | "disabled"
  pointsBalance: number
  createdAt: string
}

export type AuthResult = {
  accessToken: string
  tokenType: "Bearer"
  expiresIn: number
  user: CurrentUser
}

export type RegisterInput = {
  email: string
  username: string
  password: string
}

export type LoginInput = {
  email: string
  password: string
}

export type AccountSession = {
  id: string
  userAgent: string
  ipAddress: string
  expiresAt: string
  lastSeenAt: string
  createdAt: string
  current: boolean
}

export type AccountDeletionRequest = {
  id: string
  status: "pending" | "cancelled" | "completed"
  requestedAt: string
  cancelledAt?: string
}

export async function register(input: RegisterInput) {
  const response = await http.post<ApiResponse<AuthResult>>("/auth/register", input)
  return response.data.data
}

export async function login(input: LoginInput) {
  const response = await http.post<ApiResponse<AuthResult>>("/auth/login", input)
  return response.data.data
}

export async function getCurrentUser() {
  const response = await http.get<ApiResponse<CurrentUser>>("/auth/me")
  return response.data.data
}

export async function logout() {
  await http.post("/auth/logout")
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  await http.patch("/profile/password", input)
}

export async function listSessions() {
  const response = await http.get<ApiResponse<{ items: AccountSession[] }>>("/profile/sessions")
  return response.data.data.items
}

export async function revokeSession(sessionId: string) {
  await http.delete(`/profile/sessions/${encodeURIComponent(sessionId)}`)
}

export async function revokeOtherSessions() {
  await http.post("/profile/sessions/revoke-others")
}

export async function getAccountDeletionRequest() {
  const response = await http.get<ApiResponse<AccountDeletionRequest | null>>("/profile/deletion-request")
  return response.data.data
}

export async function requestAccountDeletion(currentPassword: string) {
  const response = await http.post<ApiResponse<AccountDeletionRequest>>("/profile/deletion-request", { currentPassword })
  return response.data.data
}

export async function cancelAccountDeletion() {
  await http.delete("/profile/deletion-request")
}

export async function updateProfile(input: { username: string }) {
  const response = await http.patch<ApiResponse<CurrentUser>>("/profile", input)
  return response.data.data
}

export async function updateAvatar(file: File) {
  const form = new FormData()
  form.append("file", file)
  const response = await http.put<ApiResponse<CurrentUser>>("/profile/avatar", form)
  return response.data.data
}

export async function removeAvatar() {
  const response = await http.delete<ApiResponse<CurrentUser>>("/profile/avatar")
  return response.data.data
}

export async function getAvatar() {
  const response = await http.get<Blob>("/profile/avatar", { responseType: "blob" })
  return response.data
}
