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
export async function updateProfile(input) {
    const response = await http.patch("/profile", input);
    return response.data.data;
}
export async function updateAvatar(file) {
    const form = new FormData();
    form.append("file", file);
    const response = await http.put("/profile/avatar", form);
    return response.data.data;
}
export async function removeAvatar() {
    const response = await http.delete("/profile/avatar");
    return response.data.data;
}
export async function getAvatar() {
    const response = await http.get("/profile/avatar", { responseType: "blob" });
    return response.data;
}
