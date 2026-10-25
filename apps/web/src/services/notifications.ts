import { shallowRef } from "vue"

export type NotificationKind = "success" | "error" | "info" | "warning"
export type AppNotification = { id: number; kind: NotificationKind; message: string }

export const activeNotification = shallowRef<AppNotification | null>(null)
let notificationId = 0
let dismissTimer: ReturnType<typeof setTimeout> | undefined

function show(kind: NotificationKind, message: string) {
  if (dismissTimer) clearTimeout(dismissTimer)
  activeNotification.value = { id: ++notificationId, kind, message }
  dismissTimer = setTimeout(dismissNotification, 3000)
}

export function dismissNotification() {
  if (dismissTimer) clearTimeout(dismissTimer)
  dismissTimer = undefined
  activeNotification.value = null
}

export const notification = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
  info: (message: string) => show("info", message),
  warning: (message: string) => show("warning", message),
}
