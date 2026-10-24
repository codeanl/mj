import { http } from "./http";
export async function getGenerationCapabilities() {
    const response = await http.get("/generations/capabilities");
    return response.data.data;
}
export async function createImageGeneration(input) {
    const response = await http.post("/generations/images", input);
    return response.data.data;
}
export async function getGenerationTask(taskId) {
    const response = await http.get(`/generations/${encodeURIComponent(taskId)}`);
    return response.data.data;
}
