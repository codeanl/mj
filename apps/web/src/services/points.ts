import { http, type ApiResponse } from "./http"

export type PointTransaction = {
  id: string
  type: "credit" | "consume" | "refund" | "adjustment"
  amount: number
  balanceAfter: number
  description: string
  model?: string
  createdAt: string
}

export function getPointWallet() {
  return http.get<ApiResponse<{ balance: number; transactions: PointTransaction[] }>>("/points").then((response) => response.data.data)
}
