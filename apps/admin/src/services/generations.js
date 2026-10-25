import { ADMIN_ACCESS_TOKEN_KEY, request } from "./http";
export function listGenerations(input) {
    const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
    if (input.search?.trim())
        query.set("search", input.search.trim());
    if (input.status)
        query.set("status", input.status);
    if (input.type)
        query.set("type", input.type);
    return request(`/admin/generations?${query}`);
}
export function getGeneration(taskId) {
    return request(`/admin/generations/${encodeURIComponent(taskId)}`);
}
export function retryGeneration(taskId) {
    return action(taskId, "retry");
}
export function cancelGeneration(taskId) {
    return action(taskId, "cancel");
}
export function refundGeneration(taskId) {
    return action(taskId, "refund");
}
export async function getGenerationPreview(taskId) {
    const token = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
    const response = await fetch(`/api/v1/admin/generations/${encodeURIComponent(taskId)}/preview`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!response.ok)
        throw new Error("任务缩略图加载失败");
    return response.blob();
}
function action(taskId, name) {
    return request(`/admin/generations/${encodeURIComponent(taskId)}/${name}`, { method: "POST" });
}
export function checkGeneration(taskId) { return request(`/admin/generations/${encodeURIComponent(taskId)}/check`, { method: "POST" }); }
export function reviewGeneration(taskId, input) { return request(`/admin/generations/${encodeURIComponent(taskId)}/review`, { method: "POST", body: JSON.stringify(input) }); }
