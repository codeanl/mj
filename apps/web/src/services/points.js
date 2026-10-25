import { http } from "./http";
export function getPointWallet() {
    return http.get("/points").then((response) => response.data.data);
}
