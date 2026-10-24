import { request } from "./http";
export function login(email, password) {
    return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}
export function currentUser() {
    return request("/auth/me");
}
