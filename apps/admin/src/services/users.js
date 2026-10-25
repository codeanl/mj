import { request } from "./http";
export function listUsers(input) {
    const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
    if (input.search?.trim())
        query.set("search", input.search.trim());
    if (input.role)
        query.set("role", input.role);
    if (input.status)
        query.set("status", input.status);
    return request(`/admin/users?${query}`);
}
export function createUser(input) {
    return request("/admin/users", { method: "POST", body: JSON.stringify(input) }).then((result) => result.user);
}
export function updateUser(accountId, input) {
    return request(`/admin/users/${accountId}`, { method: "PATCH", body: JSON.stringify(input) }).then((result) => result.user);
}
export function resetUserPassword(accountId, password) {
    return request(`/admin/users/${accountId}/password`, { method: "PATCH", body: JSON.stringify({ password }) });
}
