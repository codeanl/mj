export const ADMIN_ACCESS_TOKEN_KEY = "nova.admin_access_token";
export async function request(path, init = {}) {
    const token = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
    const headers = new Headers(init.headers);
    if (token)
        headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
    const response = await fetch(`/api/v1${path}`, { ...init, headers });
    const payload = (await response.json().catch(() => ({})));
    if (response.status === 401)
        localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
    if (!response.ok || payload.data === undefined)
        throw new Error(payload.msg || "请求失败，请稍后重试");
    return payload.data;
}
