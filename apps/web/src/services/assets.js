import axios from "axios";
import { http } from "./http";
export async function listAssets(params) {
    const response = await http.get("/assets", { params });
    return response.data.data;
}
export async function uploadAsset(file, title = "") {
    const formData = new FormData();
    formData.append("file", file);
    if (title.trim())
        formData.append("title", title.trim());
    const response = await http.post("/assets", formData, { timeout: 0 });
    return response.data.data;
}
export async function getAssetContent(url) {
    const client = /^https?:\/\//i.test(url) ? axios : http;
    const requestURL = client === http && url.startsWith("/api/v1/") ? url.slice("/api/v1".length) : url;
    const response = await client.get(requestURL, {
        responseType: "blob",
        timeout: 0,
    });
    return response.data;
}
