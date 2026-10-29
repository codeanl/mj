export type GenerationStatusInfo = {
  label: string
  description: string
  billing: string
  tone: "neutral" | "info" | "warning" | "success" | "danger"
}

const statusMap: Record<string, GenerationStatusInfo> = {
  queued: { label: "排队中", description: "任务已创建，正在等待可用渠道执行。", billing: "积分已预扣；取消成功后自动退回。", tone: "neutral" },
  running: { label: "生成中", description: "任务已提交至上游，可离开页面等待完成。", billing: "积分已预扣；明确失败时自动退回。", tone: "info" },
  needs_review: { label: "等待确认", description: "上游提交结果暂不确定，请检查原任务状态。", billing: "不会重复创建或重复扣费。", tone: "warning" },
  succeeded: { label: "已完成", description: "生成结果已保存到素材库。", billing: "积分已结算。", tone: "success" },
  failed: { label: "生成失败", description: "任务已明确失败，可以直接重试。", billing: "本次预扣积分已自动退回；重试会重新计费。", tone: "danger" },
  cancelled: { label: "已取消", description: "任务已取消，不会继续生成。", billing: "本次预扣积分已自动退回。", tone: "neutral" },
}

export function generationStatusInfo(status?: string): GenerationStatusInfo {
  return statusMap[status || ""] || statusMap.queued
}

export const generationStatusGuide = ["queued", "running", "needs_review", "succeeded", "failed", "cancelled"].map((status) => ({ status, ...statusMap[status] }))
