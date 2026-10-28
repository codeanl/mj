import { http, type ApiResponse } from "./http"

export type CdkRedemptionResult = {
  points: number
  balance: number
  redeemedAt: string
}

export async function redeemCdk(code: string) {
  const response = await http.post<ApiResponse<CdkRedemptionResult>>("/cdk/redeem", { code })
  return response.data.data
}
