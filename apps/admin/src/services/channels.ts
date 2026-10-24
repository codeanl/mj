import { request } from "./http"

export type ChannelModel = {
  id: string
  channelId: string
  modelId: string
  displayName: string
  capability: "image"
  enabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ModelChannel = {
  id: string
  name: string
  baseUrl: string
  protocol: "openai"
  enabled: boolean
  hasApiKey: boolean
  apiKeyMasked: string
  lastTestStatus: "untested" | "success" | "failed"
  lastTestMessage: string
  lastTestedAt?: string
  createdAt: string
  updatedAt: string
  models: ChannelModel[]
}

export type ChannelInput = {
  name: string
  baseUrl: string
  protocol: "openai"
  apiKey?: string
  clearApiKey?: boolean
  enabled: boolean
}

export type ModelInput = {
  modelId: string
  displayName: string
  capability: "image"
  enabled: boolean
  sortOrder: number
}

export type ConnectionResult = {
  status: "success" | "failed"
  message: string
  discoveredModels: string[]
}

export function listChannels() {
  return request<{ channels: ModelChannel[] }>("/admin/channels").then((result) => result.channels)
}

export function createChannel(input: ChannelInput) {
  return request<{ channel: ModelChannel }>("/admin/channels", { method: "POST", body: JSON.stringify(input) }).then((result) => result.channel)
}

export function updateChannel(id: string, input: ChannelInput) {
  return request<{ channel: ModelChannel }>(`/admin/channels/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }).then((result) => result.channel)
}

export function deleteChannel(id: string) {
  return request<{ deleted: boolean }>(`/admin/channels/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export function testChannel(id: string) {
  return request<ConnectionResult>(`/admin/channels/${encodeURIComponent(id)}/test`, { method: "POST" })
}

export function syncChannelModels(id: string) {
  return request<ConnectionResult>(`/admin/channels/${encodeURIComponent(id)}/models/sync`, { method: "POST" })
}

export function createChannelModel(channelId: string, input: ModelInput) {
  return request<{ model: ChannelModel }>(`/admin/channels/${encodeURIComponent(channelId)}/models`, { method: "POST", body: JSON.stringify(input) }).then((result) => result.model)
}

export function updateChannelModel(channelId: string, id: string, input: ModelInput) {
  return request<{ model: ChannelModel }>(`/admin/channels/${encodeURIComponent(channelId)}/models/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }).then((result) => result.model)
}

export function deleteChannelModel(channelId: string, id: string) {
  return request<{ deleted: boolean }>(`/admin/channels/${encodeURIComponent(channelId)}/models/${encodeURIComponent(id)}`, { method: "DELETE" })
}
