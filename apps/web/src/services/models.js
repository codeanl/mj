import { http } from "./http";
export async function listVideoModels() {
    const response = await http.get("/models?capability=video");
    return response.data.data.models;
}
export async function listImageModels() {
    const response = await http.get("/models?capability=image");
    return response.data.data.models;
}
