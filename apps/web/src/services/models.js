import { http } from "./http";
export async function listImageModels() {
    const response = await http.get("/models?capability=image");
    return response.data.data.models;
}
