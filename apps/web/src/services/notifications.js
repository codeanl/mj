import { shallowRef } from "vue";
export const activeNotification = shallowRef(null);
let notificationId = 0;
let dismissTimer;
function show(kind, message) {
    if (dismissTimer)
        clearTimeout(dismissTimer);
    activeNotification.value = { id: ++notificationId, kind, message };
    dismissTimer = setTimeout(dismissNotification, 3000);
}
export function dismissNotification() {
    if (dismissTimer)
        clearTimeout(dismissTimer);
    dismissTimer = undefined;
    activeNotification.value = null;
}
export const notification = {
    success: (message) => show("success", message),
    error: (message) => show("error", message),
    info: (message) => show("info", message),
    warning: (message) => show("warning", message),
};
