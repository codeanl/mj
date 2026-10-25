import { request } from "./http";
export function listChannels() {
    return request("/admin/channels").then((result) => result.channels);
}
export function listProtocols() {
    return request("/admin/protocols").then((result) => result.protocols);
}
export function createChannel(input) {
    return request("/admin/channels", { method: "POST", body: JSON.stringify(input) }).then((result) => result.channel);
}
export function updateChannel(id, input) {
    return request(`/admin/channels/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }).then((result) => result.channel);
}
export function simulateRoute(input) { const query = new URLSearchParams(input); return request(`/admin/channels/simulate?${query}`); }
export function getChannelStats(window) { return request(`/admin/channels/stats?window=${window}`); }
export function deleteChannel(id) {
    return request(`/admin/channels/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export function testChannel(id) {
    return request(`/admin/channels/${encodeURIComponent(id)}/test`, { method: "POST" });
}
export function syncChannelModels(id) {
    return request(`/admin/channels/${encodeURIComponent(id)}/models/sync`, { method: "POST" });
}
export function createChannelModel(channelId, input) {
    return request(`/admin/channels/${encodeURIComponent(channelId)}/models`, { method: "POST", body: JSON.stringify(input) }).then((result) => result.model);
}
export function updateChannelModel(channelId, id, input) {
    return request(`/admin/channels/${encodeURIComponent(channelId)}/models/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }).then((result) => result.model);
}
export function deleteChannelModel(channelId, id) {
    return request(`/admin/channels/${encodeURIComponent(channelId)}/models/${encodeURIComponent(id)}`, { method: "DELETE" });
}
