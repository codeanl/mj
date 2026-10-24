import axios from "axios";
export const ACCESS_TOKEN_KEY = "nova.access_token";
export const http = axios.create({
    baseURL: "/api/v1",
    timeout: 15_000,
});
http.interceptors.request.use((config) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token)
        config.headers.Authorization = `Bearer ${token}`;
    return config;
});
http.interceptors.response.use((response) => response, (error) => {
    if (error.response?.status === 401 && !String(error.config?.url || "").includes("/auth/login")) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
    return Promise.reject(error);
});
export function apiErrorMessage(error, fallback = "请求失败，请稍后重试") {
    if (axios.isAxiosError(error)) {
        const message = error.response?.data?.msg;
        if (typeof message === "string" && message.trim())
            return message;
        if (!error.response)
            return "无法连接服务，请检查网络或稍后重试";
    }
    return fallback;
}
