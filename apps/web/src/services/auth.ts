import { http, type ApiResponse } from "./http"

export type CurrentUser = {
  id: string
  email: string
  username: string
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
