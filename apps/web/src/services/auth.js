import { http } from "./http";
export async function register(input) {
    const response = await http.post("/auth/register", input);
    return response.data.data;
}
export async function login(input) {
    const response = await http.post("/auth/login", input);
    return response.data.data;
}
export async function getCurrentUser() {
    const response = await http.get("/auth/me");
    return response.data.data;
}
