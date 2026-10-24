import { http } from "./http";
export async function listImageModels() {
    const response = await http.get("/models");
    return response.data.data.models;
}
