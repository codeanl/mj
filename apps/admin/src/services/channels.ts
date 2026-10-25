import { request } from "./http"

export type ChannelModel = {
  id: string
  channelId: string
  modelId: string
  displayName: string
  capability: ModelCapability
  enabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ModelChannel = {
  id: string
  name: string
  baseUrl: string
  protocol: ChannelProtocol
  advancedConfig: AdvancedConfig
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
  protocol: ChannelProtocol
  apiKey?: string
  clearApiKey?: boolean
  enabled: boolean
  advancedConfig: AdvancedConfig
}

export type ModelInput = {
  modelId: string
  displayName: string
  capability: ModelCapability
  enabled: boolean
  sortOrder: number
}

export type ModelCapability = "text" | "image" | "video" | "audio"
export type ChannelProtocol = "auto" | "openai" | "yumeng" | "gemini" | "sub2api" | "newapi" | "vozeb-recommended" | "globalaiopc" | "seedance" | "stable-diffusion" | "volcengine-video" | "seedance-special" | "custom" | "compatible"
export type AuthMode = "none" | "bearer" | "x-api-key" | "custom-header"

export type OperationConfig = {
  createPath?: string
  editPath?: string
  imageToVideoPath?: string
  queryPath?: string
  cancelPath?: string
  cancelMethod?: string
  requestTemplate?: string
  resultField?: string
  statusField?: string
  durationRange?: string
  referenceRule?: string
  supportsReferenceImage?: boolean
  supportsReferenceVideo?: boolean
  supportsReferenceAudio?: boolean
}

export type AdvancedConfig = OperationConfig & {
  apiFormat: "openai" | "gemini"
  authMode: AuthMode
  authHeader?: string
  authPrefix?: string
  documentationUrl?: string
  modelCatalogPaths: string[]
  operationConfigs?: Partial<Record<ModelCapability, OperationConfig>>
}

export type ProtocolDefinition = {
  id: ChannelProtocol
  label: string
  description: string
  apiFormat: "openai" | "gemini"
  authMode: AuthMode
  defaultBaseUrl?: string
  modelCatalogPaths: string[]
  capabilities: ModelCapability[]
  operations: Partial<Record<ModelCapability, OperationConfig>>
  builtInModels?: Array<{ id: string; label: string; capability: ModelCapability }>
  strict: boolean
  advanced: boolean
}

export type ConnectionResult = {
  status: "success" | "failed"
  message: string
  discoveredModels: string[]
}

export function listChannels() {
  return request<{ channels: ModelChannel[] }>("/admin/channels").then((result) => result.channels)
}

export function listProtocols() {
  return request<{ protocols: ProtocolDefinition[] }>("/admin/protocols").then((result) => result.protocols)
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
