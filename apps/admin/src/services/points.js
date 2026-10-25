import { request } from "./http";
export function getPointRules() {
    return request("/admin/points/rules");
}
export function savePointRules(config) {
    return request("/admin/points/rules", { method: "PUT", body: JSON.stringify(config) });
}
export function adjustUserPoints(accountId, amount, description) {
    return request(`/admin/users/${accountId}/points`, { method: "POST", body: JSON.stringify({ amount, description }) });
}
