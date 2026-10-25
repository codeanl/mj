<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { ElButton, ElDialog, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElSelect, ElSwitch } from "element-plus"
import "element-plus/dist/index.css"
import { ArrowLeft, Check, CheckCircle2, CircleAlert, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, Search, Settings2, Trash2, XCircle } from "@lucide/vue"

import * as channelApi from "@/services/channels"

const channels = ref<channelApi.ModelChannel[]>([])
const protocols = ref<channelApi.ProtocolDefinition[]>([])
const loading = ref(true)
const saving = ref(false)
const testingId = ref("")
const syncingId = ref("")
const query = ref("")
const status = ref<"all" | "enabled" | "disabled">("all")
const simulatorModel=ref("");const simulatorSize=ref("16:9");const simulatorQuality=ref("2K");const simulation=ref<channelApi.RouteSimulation|null>(null);const simulating=ref(false)
const statsWindow=ref<"24h"|"7d">("24h");const runtimeStats=ref<channelApi.RuntimeStats|null>(null)
const dialogOpen = ref(false)
const onboardingStep = ref<0 | 1>(0)
const editingId = ref("")
const modelDialogOpen = ref(false)
const editingModelId = ref("")

const routingDefaults = { priority: 100, weight: 100, maxConcurrency: 4, timeoutSeconds: 300, failureThreshold: 3, cooldownSeconds: 60 }
const channelForm = reactive<channelApi.ChannelInput>({ name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false, advancedConfig: emptyAdvancedConfig(), ...routingDefaults })
const modelForm = reactive<channelApi.ModelInput>({ modelId: "", displayName: "", capability: "image", enabled: true, sortOrder: 0, capabilityConfig: emptyModelCapabilityConfig() })

const editingChannel = computed(() => channels.value.find((channel) => channel.id === editingId.value))
const imageModels=computed(()=>Array.from(new Set(channels.value.flatMap(channel=>channel.models.filter(model=>model.capability==="image"&&model.enabled).map(model=>model.modelId)))))
const filteredChannels = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return channels.value.filter((channel) => {
    if (status.value === "enabled" && !channel.enabled) return false
    if (status.value === "disabled" && channel.enabled) return false
    if (!keyword) return true
    return [channel.name, channel.baseUrl, channel.protocol, ...channel.models.flatMap((model) => [model.modelId, model.displayName])].some((value) => value.toLowerCase().includes(keyword))
  })
})
const enabledCount = computed(() => channels.value.filter((channel) => channel.enabled).length)
const modelCount = computed(() => channels.value.reduce((count, channel) => count + channel.models.length, 0))
const enabledModelCount = computed(() => channels.value.reduce((count, channel) => count + channel.models.filter((model) => model.enabled).length, 0))
const capabilityCounts = computed(() => Object.fromEntries(["text", "image", "video", "audio"].map((capability) => [capability, channels.value.reduce((count, channel) => count + channel.models.filter((model) => model.enabled && model.capability === capability).length, 0)])) as Record<channelApi.ModelCapability, number>)
const selectedProtocol = computed(() => protocols.value.find((protocol) => protocol.id === channelForm.protocol))
const protocolLabels = computed(() => Object.fromEntries(protocols.value.map((protocol) => [protocol.id, protocol.label])) as Record<string, string>)

onMounted(() => void Promise.all([loadChannels(), loadProtocols(),loadStats()]))

async function runSimulation(){if(!simulatorModel.value)return ElMessage.warning("请选择图片模型");simulating.value=true;try{simulation.value=await channelApi.simulateRoute({model:simulatorModel.value,size:simulatorSize.value,quality:simulatorQuality.value})}catch(error){ElMessage.error(messageOf(error,"路由模拟失败"))}finally{simulating.value=false}}
async function loadStats(){try{runtimeStats.value=await channelApi.getChannelStats(statsWindow.value)}catch(error){ElMessage.error(messageOf(error,"渠道统计加载失败"))}}

async function loadProtocols() {
  try {
    protocols.value = await channelApi.listProtocols()
  } catch (error) {
    ElMessage.error(messageOf(error, "协议注册表加载失败"))
  }
}

async function loadChannels() {
  loading.value = true
  try {
	channels.value = await channelApi.listChannels()
	if (!imageModels.value.includes(simulatorModel.value)) simulatorModel.value=imageModels.value[0]||""
  } catch (error) {
    ElMessage.error(messageOf(error, "渠道加载失败"))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = ""
  onboardingStep.value = 0
  Object.assign(channelForm, { name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false, advancedConfig: emptyAdvancedConfig(), ...routingDefaults })
  dialogOpen.value = true
}

function openEdit(channel: channelApi.ModelChannel) {
  editingId.value = channel.id
  onboardingStep.value = 1
  Object.assign(channelForm, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, apiKey: "", enabled: channel.enabled, advancedConfig: cloneData(channel.advancedConfig), priority: channel.priority, weight: channel.weight, maxConcurrency: channel.maxConcurrency, timeoutSeconds: channel.timeoutSeconds, failureThreshold: channel.failureThreshold, cooldownSeconds: channel.cooldownSeconds })
  dialogOpen.value = true
}

function chooseProtocol(protocol: channelApi.ProtocolDefinition) {
  channelForm.protocol = protocol.id
  channelForm.baseUrl = protocol.defaultBaseUrl || ""
  channelForm.advancedConfig = advancedFromProtocol(protocol)
}

function continueOnboarding() {
  const protocol = selectedProtocol.value
  if (!protocol) return ElMessage.warning("请选择协议")
  if (!channelForm.name) channelForm.name = `${protocol.label} 渠道`
  onboardingStep.value = 1
}

async function saveChannel() {
  if (!channelForm.name.trim() || !channelForm.baseUrl.trim()) return ElMessage.warning("请填写渠道名称和 Base URL")
  if (!editingId.value && selectedProtocol.value?.authMode !== "none" && !channelForm.apiKey?.trim()) return ElMessage.warning("当前协议必须填写 API Key")
  saving.value = true
  try {
    const wasEditing = Boolean(editingId.value)
    const saved = editingId.value ? await channelApi.updateChannel(editingId.value, channelForm) : await channelApi.createChannel(channelForm)
    editingId.value = saved.id
    channelForm.apiKey = ""
    await loadChannels()
    ElMessage.success(wasEditing ? "渠道配置已保存" : "渠道已创建")
  } catch (error) {
    ElMessage.error(messageOf(error, "渠道保存失败"))
  } finally {
    saving.value = false
  }
}

async function toggleChannel(channel: channelApi.ModelChannel, enabled: boolean) {
  try {
	await channelApi.updateChannel(channel.id, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, enabled, advancedConfig: channel.advancedConfig, priority: channel.priority, weight: channel.weight, maxConcurrency: channel.maxConcurrency, timeoutSeconds: channel.timeoutSeconds, failureThreshold: channel.failureThreshold, cooldownSeconds: channel.cooldownSeconds })
    await loadChannels()
    ElMessage.success(enabled ? "渠道已启用" : "渠道已停用")
  } catch (error) {
    ElMessage.error(messageOf(error, "渠道状态更新失败"))
  }
}

async function removeChannel(channel: channelApi.ModelChannel) {
  try {
    await ElMessageBox.confirm(`将删除渠道“${channel.name}”及其全部模型配置，继续吗？`, "删除模型渠道", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" })
    await channelApi.deleteChannel(channel.id)
    if (editingId.value === channel.id) dialogOpen.value = false
    await loadChannels()
    ElMessage.success("渠道已删除")
  } catch (error) {
    if (error === "cancel" || error === "close") return
    ElMessage.error(messageOf(error, "渠道删除失败"))
  }
}

async function testChannel(channel: channelApi.ModelChannel) {
  testingId.value = channel.id
  try {
    const result = await channelApi.testChannel(channel.id)
    await loadChannels()
    result.status === "success" ? ElMessage.success(result.message) : ElMessage.error(result.message)
  } catch (error) {
    ElMessage.error(messageOf(error, "渠道测试失败"))
  } finally {
    testingId.value = ""
  }
}

async function syncModels(channel: channelApi.ModelChannel) {
  syncingId.value = channel.id
  try {
    const result = await channelApi.syncChannelModels(channel.id)
    await loadChannels()
    result.status === "success" ? ElMessage.success(result.message) : ElMessage.error(result.message)
  } catch (error) {
    ElMessage.error(messageOf(error, "模型同步失败"))
  } finally {
    syncingId.value = ""
  }
}

function openModel(model?: channelApi.ChannelModel) {
  editingModelId.value = model?.id || ""
  Object.assign(modelForm, {
    modelId: model?.modelId || "",
    displayName: model?.displayName || "",
    capability: model?.capability || "image",
    enabled: model?.enabled ?? true,
    sortOrder: model?.sortOrder ?? (editingChannel.value?.models.length || 0),
    capabilityConfig: model ? { ...emptyModelCapabilityConfig(), ...cloneData(model.capabilityConfig) } : emptyModelCapabilityConfig(),
  })
  modelDialogOpen.value = true
}

async function saveModel() {
  const channel = editingChannel.value
  if (!channel || !modelForm.modelId.trim()) return ElMessage.warning("请填写模型 ID")
  saving.value = true
  try {
    if (editingModelId.value) await channelApi.updateChannelModel(channel.id, editingModelId.value, modelForm)
    else await channelApi.createChannelModel(channel.id, modelForm)
    await loadChannels()
    modelDialogOpen.value = false
    ElMessage.success(editingModelId.value ? "模型已更新" : "模型已添加")
  } catch (error) {
    ElMessage.error(messageOf(error, "模型保存失败"))
  } finally {
    saving.value = false
  }
}

async function removeModel(model: channelApi.ChannelModel) {
  const channel = editingChannel.value
  if (!channel) return
  try {
    await ElMessageBox.confirm(`删除模型“${model.displayName}”？`, "删除模型", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" })
    await channelApi.deleteChannelModel(channel.id, model.id)
    await loadChannels()
    ElMessage.success("模型已删除")
  } catch (error) {
    if (error === "cancel" || error === "close") return
    ElMessage.error(messageOf(error, "模型删除失败"))
  }
}

function statusText(channel: channelApi.ModelChannel) {
	if (!channel.enabled) return "已停用"
	if (channel.cooldownUntil && new Date(channel.cooldownUntil).getTime() > Date.now()) return "冷却中"
	if (channel.consecutiveFailures > 0) return "运行异常"
  if (channel.lastTestStatus === "failed") return "连接异常"
  return "已启用"
}

function capabilityLabel(capability: channelApi.ModelCapability) {
  return { text: "文本", image: "图片", video: "视频", audio: "音频" }[capability]
}

function advancedFromProtocol(protocol: channelApi.ProtocolDefinition): channelApi.AdvancedConfig {
  const primary = protocol.capabilities.length === 1 ? protocol.operations[protocol.capabilities[0]] || {} : {}
  return {
    apiFormat: protocol.apiFormat,
    authMode: protocol.authMode,
    modelCatalogPaths: [...protocol.modelCatalogPaths],
    operationConfigs: cloneData(protocol.operations),
	pollIntervalSeconds: 5,
    ...primary,
  }
}

function emptyAdvancedConfig(): channelApi.AdvancedConfig {
  return { apiFormat: "openai", authMode: "bearer", modelCatalogPaths: [], operationConfigs: {}, pollIntervalSeconds: 5 }
}

function emptyModelCapabilityConfig(): channelApi.ModelCapabilityConfig {
  return { ratios: ["adaptive","16:9","9:16","1:1"], qualities: ["480P","768P","1080P"], minDuration: 4, maxDuration: 30, modes: ["text","frames","reference"], supportsSound: true, supportsWatermark: true }
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
</script>

<template>
  <section class="channels-workspace">
    <div class="channel-metrics">
      <div><span>启用渠道</span><strong>{{ enabledCount }}/{{ channels.length }}</strong></div>
      <div><span>渠道模型</span><strong>{{ modelCount }}</strong></div>
      <div><span>可用模型</span><strong>{{ enabledModelCount }}</strong></div>
      <div><span>能力分布</span><strong class="channel-capability-metric">文 {{ capabilityCounts.text }} · 图 {{ capabilityCounts.image }} · 视 {{ capabilityCounts.video }} · 音 {{ capabilityCounts.audio }}</strong></div>
	</div>
	<div class="channel-observability">
	  <section><div class="channel-observability__head"><div><strong>路由模拟器</strong><span>仅读取当前配置，不调用上游、不扣积分。</span></div><ElButton :loading="simulating" @click="runSimulation">模拟路由</ElButton></div><div class="channel-simulator-form"><ElSelect v-model="simulatorModel" placeholder="选择图片模型"><ElOption v-for="model in imageModels" :key="model" :label="model" :value="model" /></ElSelect><ElSelect v-model="simulatorSize"><ElOption label="1:1" value="1:1" /><ElOption label="16:9" value="16:9" /><ElOption label="9:16" value="9:16" /></ElSelect><ElSelect v-model="simulatorQuality"><ElOption label="1K" value="1K" /><ElOption label="2K" value="2K" /></ElSelect></div><div v-if="simulation" class="channel-route-list"><article v-for="(candidate,index) in simulation.candidates" :key="candidate.channelId" :class="{ 'is-selected': candidate.selected }"><b>{{ index+1 }}</b><span><strong>{{ candidate.channelName }}</strong><small>优先级 {{ candidate.priority }} · 权重 {{ candidate.weight }} · 并发 {{ candidate.activeRequests }}/{{ candidate.maxConcurrency }}</small></span><em>{{ candidate.selected ? '本次选择' : candidate.reason }}<small v-if="candidate.failoverTo">失败后 → {{ candidate.failoverTo }}</small></em></article></div>
	  </section>
	  <section><div class="channel-observability__head"><div><strong>渠道运行统计</strong><span>验证成功率、流量权重和自动切换。</span></div><div class="channel-window"><button :class="{active:statsWindow==='24h'}" @click="statsWindow='24h';loadStats()">24 小时</button><button :class="{active:statsWindow==='7d'}" @click="statsWindow='7d';loadStats()">7 天</button></div></div><div v-if="runtimeStats" class="channel-stats-summary"><div><span>请求数</span><strong>{{ runtimeStats.requests }}</strong></div><div><span>成功率</span><strong>{{ runtimeStats.successRate.toFixed(1) }}%</strong></div><div><span>平均耗时</span><strong>{{ Math.round(runtimeStats.averageLatencyMs) }} ms</strong></div><div><span>自动切换</span><strong>{{ runtimeStats.autoSwitches }}</strong></div><div><span>并发峰值</span><strong>{{ runtimeStats.peakConcurrency }}</strong></div></div><div v-if="runtimeStats?.routes.length" class="channel-traffic-list"><div v-for="route in runtimeStats.routes" :key="`${route.model}:${route.channelId}`"><span><strong>{{ route.channelName }}</strong><small>{{ route.model }} · {{ route.requests }} 次 · {{ Math.round(route.averageLatencyMs) }}ms</small></span><b>{{ route.trafficShare.toFixed(1) }}%</b></div></div><div v-if="runtimeStats && Object.keys(runtimeStats.httpErrors).length" class="channel-http-errors">HTTP 错误：<span v-for="(count,statusCode) in runtimeStats.httpErrors" :key="statusCode">{{ statusCode }} × {{ count }}</span></div>
	  </section>
	</div>

	<div class="channel-toolbar">
      <label class="channel-search"><Search :size="16" /><input v-model="query" placeholder="搜索渠道、地址或模型" /></label>
      <select v-model="status" aria-label="渠道状态筛选"><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option></select>
      <button class="channel-primary" type="button" @click="openCreate"><Plus :size="16" />接入渠道</button>
    </div>

    <div v-if="loading" class="channel-loading"><LoaderCircle class="spin" :size="22" />正在加载模型渠道</div>
    <div v-else-if="filteredChannels.length" class="channel-table-wrap">
      <table class="channel-table">
        <thead><tr><th>渠道</th><th>协议与地址</th><th>模型</th><th>状态</th><th>最近检测</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="channel in filteredChannels" :key="channel.id">
            <td><button class="channel-name" type="button" @click="openEdit(channel)"><strong>{{ channel.name }}</strong><span><KeyRound :size="12" />{{ channel.apiKeyMasked || "未保存密钥" }}</span></button></td>
            <td><strong>{{ protocolLabels[channel.protocol] || channel.protocol }}</strong><span>{{ channel.baseUrl }}</span></td>
            <td><strong>{{ channel.models.filter((model) => model.enabled).length }} / {{ channel.models.length }}</strong><span>{{ channel.models.map((model) => `${capabilityLabel(model.capability)}·${model.displayName}`).join("、") || "尚未添加模型" }}</span></td>
            <td><span class="channel-status" :class="{ 'is-enabled': channel.enabled && !channel.consecutiveFailures && !channel.cooldownUntil, 'is-error': channel.lastTestStatus === 'failed' || channel.consecutiveFailures > 0 }">{{ statusText(channel) }}</span></td>
            <td><span class="channel-test-result"><CheckCircle2 v-if="channel.lastTestStatus === 'success'" :size="14" /><XCircle v-else-if="channel.lastTestStatus === 'failed'" :size="14" /><CircleAlert v-else :size="14" />{{ channel.lastRuntimeAt ? `${channel.lastLatencyMs ?? '-'} ms · ${channel.lastRuntimeError || '运行正常'}` : channel.lastTestMessage || "尚未检测" }}</span></td>
            <td><div class="channel-actions"><button type="button" title="测试连接" @click="testChannel(channel)"><LoaderCircle v-if="testingId === channel.id" class="spin" :size="15" /><CheckCircle2 v-else :size="15" /></button><button type="button" title="同步模型" @click="syncModels(channel)"><LoaderCircle v-if="syncingId === channel.id" class="spin" :size="15" /><RefreshCw v-else :size="15" /></button><button type="button" title="编辑渠道" @click="openEdit(channel)"><Pencil :size="15" /></button><ElSwitch :model-value="channel.enabled" @change="toggleChannel(channel, Boolean($event))" /></div></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!loading && filteredChannels.length" class="channel-mobile-list">
      <article v-for="channel in filteredChannels" :key="channel.id">
        <div class="channel-mobile-head"><button class="channel-name" type="button" @click="openEdit(channel)"><strong>{{ channel.name }}</strong><span><KeyRound :size="12" />{{ channel.apiKeyMasked || "未保存密钥" }}</span></button><span class="channel-status" :class="{ 'is-enabled': channel.enabled && !channel.consecutiveFailures && !channel.cooldownUntil, 'is-error': channel.lastTestStatus === 'failed' || channel.consecutiveFailures > 0 }">{{ statusText(channel) }}</span></div>
        <dl><div><dt>协议</dt><dd>{{ protocolLabels[channel.protocol] || channel.protocol }}</dd></div><div><dt>模型</dt><dd>{{ channel.models.filter((model) => model.enabled).length }} / {{ channel.models.length }}</dd></div></dl>
        <p>{{ channel.models.map((model) => `${capabilityLabel(model.capability)}·${model.displayName}`).join("、") || "尚未添加模型" }}</p>
        <div class="channel-mobile-test"><CheckCircle2 v-if="channel.lastTestStatus === 'success'" :size="14" /><XCircle v-else-if="channel.lastTestStatus === 'failed'" :size="14" /><CircleAlert v-else :size="14" /><span>{{ channel.lastRuntimeAt ? `${channel.lastLatencyMs ?? '-'} ms · ${channel.lastRuntimeError || '运行正常'}` : channel.lastTestMessage || "尚未检测" }}</span></div>
        <div class="channel-mobile-actions"><button type="button" @click="testChannel(channel)"><LoaderCircle v-if="testingId === channel.id" class="spin" :size="15" /><CheckCircle2 v-else :size="15" />测试</button><button type="button" @click="syncModels(channel)"><LoaderCircle v-if="syncingId === channel.id" class="spin" :size="15" /><RefreshCw v-else :size="15" />同步</button><button type="button" @click="openEdit(channel)"><Pencil :size="15" />编辑</button><ElSwitch :model-value="channel.enabled" @change="toggleChannel(channel, Boolean($event))" /></div>
      </article>
    </div>
    <div v-if="!loading && !filteredChannels.length" class="channel-empty"><KeyRound :size="28" /><strong>{{ channels.length ? "没有匹配的渠道" : "还没有模型渠道" }}</strong><span>接入 OpenAI 兼容图片渠道后，模型会出现在用户创作端。</span><button v-if="!channels.length" class="channel-primary" type="button" @click="openCreate"><Plus :size="16" />接入第一个渠道</button></div>

    <ElDialog v-model="dialogOpen" :title="editingId ? '编辑模型渠道' : onboardingStep === 0 ? '选择渠道协议' : '接入模型渠道'" width="min(760px, calc(100vw - 28px))" destroy-on-close>
      <div v-if="onboardingStep === 0" class="protocol-grid">
        <button v-for="protocol in protocols" :key="protocol.id" type="button" :class="{ 'is-selected': channelForm.protocol === protocol.id }" @click="chooseProtocol(protocol)">
          <span><strong>{{ protocol.label }}</strong><Check v-if="channelForm.protocol === protocol.id" :size="16" /></span>
          <p>{{ protocol.description }}</p>
          <span class="protocol-capabilities"><em v-for="capability in protocol.capabilities" :key="capability">{{ capabilityLabel(capability) }}</em></span>
        </button>
      </div>
      <div v-else class="channel-form-grid">
        <label><span>渠道名称</span><ElInput v-model="channelForm.name" placeholder="例如：生产主渠道" /></label>
        <label><span>协议</span><ElSelect v-model="channelForm.protocol" disabled><ElOption :label="selectedProtocol?.label || channelForm.protocol" :value="channelForm.protocol" /></ElSelect></label>
        <label class="channel-form-wide"><span>Base URL</span><ElInput v-model="channelForm.baseUrl" placeholder="https://api.example.com/v1" /></label>
        <label class="channel-form-wide"><span>API Key</span><ElInput v-model="channelForm.apiKey" type="password" show-password :placeholder="editingChannel?.hasApiKey ? `已保存 ${editingChannel.apiKeyMasked}，留空保持不变` : '输入 API Key'" /></label>
        <label class="channel-switch-row"><span><strong>启用渠道</strong><small>只有启用渠道中的启用模型会展示给用户。</small></span><ElSwitch v-model="channelForm.enabled" /></label>
        <details class="channel-advanced channel-form-wide">
          <summary><Settings2 :size="15" />高级设置</summary>
          <div class="channel-advanced-grid">
			<label><span>路由优先级</span><ElInputNumber v-model="channelForm.priority" :min="1" :max="10000" /></label>
			<label><span>流量权重</span><ElInputNumber v-model="channelForm.weight" :min="1" :max="10000" /></label>
			<label><span>最大并发</span><ElInputNumber v-model="channelForm.maxConcurrency" :min="1" :max="1000" /></label>
			<label><span>请求超时（秒）</span><ElInputNumber v-model="channelForm.timeoutSeconds" :min="1" :max="3600" /></label>
			<label><span>任务查询间隔（秒）</span><ElInputNumber v-model="channelForm.advancedConfig.pollIntervalSeconds" :min="1" :max="3600" /></label>
			<label><span>失败熔断阈值</span><ElInputNumber v-model="channelForm.failureThreshold" :min="1" :max="100" /></label>
			<label><span>冷却时间（秒）</span><ElInputNumber v-model="channelForm.cooldownSeconds" :min="1" :max="86400" /></label>
            <label><span>API 格式</span><ElSelect v-model="channelForm.advancedConfig.apiFormat" :disabled="selectedProtocol?.strict"><ElOption label="OpenAI" value="openai" /><ElOption label="Gemini" value="gemini" /></ElSelect></label>
            <label><span>鉴权方式</span><ElSelect v-model="channelForm.advancedConfig.authMode" :disabled="selectedProtocol?.strict"><ElOption label="Bearer Token" value="bearer" /><ElOption label="x-api-key" value="x-api-key" /><ElOption label="自定义 Header" value="custom-header" /><ElOption label="无需鉴权" value="none" /></ElSelect></label>
            <label v-if="channelForm.advancedConfig.authMode === 'custom-header'"><span>鉴权 Header</span><ElInput v-model="channelForm.advancedConfig.authHeader" placeholder="x-api-key" /></label>
            <label v-if="channelForm.advancedConfig.authMode === 'custom-header'"><span>鉴权前缀</span><ElInput v-model="channelForm.advancedConfig.authPrefix" placeholder="可留空" /></label>
            <label class="channel-form-wide"><span>模型目录路径</span><ElInput :model-value="channelForm.advancedConfig.modelCatalogPaths.join(', ')" :disabled="selectedProtocol?.strict" placeholder="/v1/models" @update:model-value="channelForm.advancedConfig.modelCatalogPaths = String($event).split(',').map((item) => item.trim()).filter(Boolean)" /></label>
            <div v-if="selectedProtocol?.strict" class="channel-protocol-operations channel-form-wide">
              <section v-for="capability in selectedProtocol.capabilities" :key="capability">
                <strong>{{ capabilityLabel(capability) }}操作</strong>
                <dl><div><dt>创建路径</dt><dd>{{ channelForm.advancedConfig.operationConfigs?.[capability]?.createPath || "未配置" }}</dd></div><div v-if="channelForm.advancedConfig.operationConfigs?.[capability]?.editPath"><dt>编辑路径</dt><dd>{{ channelForm.advancedConfig.operationConfigs?.[capability]?.editPath }}</dd></div><div v-if="channelForm.advancedConfig.operationConfigs?.[capability]?.imageToVideoPath"><dt>图生视频</dt><dd>{{ channelForm.advancedConfig.operationConfigs?.[capability]?.imageToVideoPath }}</dd></div><div v-if="channelForm.advancedConfig.operationConfigs?.[capability]?.queryPath"><dt>查询路径</dt><dd>{{ channelForm.advancedConfig.operationConfigs?.[capability]?.queryPath }}</dd></div><div><dt>结果字段</dt><dd>{{ channelForm.advancedConfig.operationConfigs?.[capability]?.resultField || "未配置" }}</dd></div></dl>
              </section>
            </div>
            <template v-else>
              <label><span>创建路径</span><ElInput v-model="channelForm.advancedConfig.createPath" placeholder="/images/generations" /></label>
              <label><span>查询路径</span><ElInput v-model="channelForm.advancedConfig.queryPath" placeholder="/tasks/:task_id" /></label>
              <label><span>取消路径</span><ElInput v-model="channelForm.advancedConfig.cancelPath" placeholder="/tasks/:task_id/cancel" /></label>
              <label><span>取消方式</span><ElSelect v-model="channelForm.advancedConfig.cancelMethod"><ElOption label="POST" value="POST" /><ElOption label="DELETE" value="DELETE" /></ElSelect></label>
              <label class="channel-form-wide"><span>请求模板</span><ElInput v-model="channelForm.advancedConfig.requestTemplate" type="textarea" :rows="3" placeholder='{"model":"{{model}}","prompt":"{{prompt}}"}' /></label>
              <label><span>结果字段</span><ElInput v-model="channelForm.advancedConfig.resultField" placeholder="data[0].url" /></label>
              <label><span>状态字段</span><ElInput v-model="channelForm.advancedConfig.statusField" placeholder="status" /></label>
            </template>
            <label class="channel-form-wide"><span>协议文档 URL</span><ElInput v-model="channelForm.advancedConfig.documentationUrl" placeholder="https://docs.example.com/api" /></label>
          </div>
        </details>
      </div>

      <div v-if="onboardingStep === 1 && editingChannel" class="channel-models-section">
        <div class="channel-models-heading"><div><strong>全部模型</strong><span>统一维护文本、图片、视频与音频模型；用户端按工作台能力筛选。</span></div><div><ElButton :loading="syncingId === editingChannel.id" @click="syncModels(editingChannel)"><RefreshCw :size="14" />同步目录</ElButton><ElButton type="primary" @click="openModel()"><Plus :size="14" />添加模型</ElButton></div></div>
        <div v-if="editingChannel.models.length" class="channel-model-list">
          <div v-for="model in editingChannel.models" :key="model.id"><span><strong>{{ model.displayName }}</strong><small>{{ capabilityLabel(model.capability) }} · {{ model.modelId }} · 排序 {{ model.sortOrder }}</small></span><span class="channel-model-ops"><span class="channel-status" :class="{ 'is-enabled': model.enabled }">{{ model.enabled ? "已启用" : "已停用" }}</span><button type="button" aria-label="编辑模型" @click="openModel(model)"><Pencil :size="14" /></button><button type="button" aria-label="删除模型" @click="removeModel(model)"><Trash2 :size="14" /></button></span></div>
        </div>
        <div v-else class="channel-model-empty">尚未添加图片模型，可手动添加或从上游同步。</div>
      </div>

      <template #footer><div class="channel-dialog-footer"><ElButton v-if="onboardingStep === 1 && !editingId" @click="onboardingStep = 0"><ArrowLeft :size="14" />上一步</ElButton><ElButton v-if="editingChannel" type="danger" plain @click="removeChannel(editingChannel)"><Trash2 :size="14" />删除渠道</ElButton><span /><ElButton @click="dialogOpen = false">取消</ElButton><ElButton v-if="onboardingStep === 0" type="primary" @click="continueOnboarding">下一步</ElButton><ElButton v-else type="primary" :loading="saving" @click="saveChannel">保存渠道</ElButton></div></template>
    </ElDialog>

    <ElDialog v-model="modelDialogOpen" :title="editingModelId ? '编辑模型' : '添加模型'" width="min(560px, calc(100vw - 28px))" append-to-body>
      <div class="channel-form-grid">
        <label><span>模型 ID</span><ElInput v-model="modelForm.modelId" placeholder="gpt-image-2" /></label>
        <label><span>展示名称</span><ElInput v-model="modelForm.displayName" placeholder="留空则使用模型 ID" /></label>
        <label><span>模型能力</span><ElSelect v-model="modelForm.capability"><ElOption label="文本" value="text" /><ElOption label="图片" value="image" /><ElOption label="视频" value="video" /><ElOption label="音频" value="audio" /></ElSelect></label>
        <label><span>排序</span><ElInput v-model.number="modelForm.sortOrder" type="number" min="0" /></label>
		<template v-if="modelForm.capability === 'video'">
		  <label class="channel-form-wide"><span>支持比例</span><ElSelect v-model="modelForm.capabilityConfig.ratios" multiple collapse-tags><ElOption v-for="value in ['adaptive','21:9','16:9','4:3','1:1','3:4','9:16']" :key="value" :label="value === 'adaptive' ? '自适应' : value" :value="value" /></ElSelect></label>
		  <label class="channel-form-wide"><span>支持清晰度</span><ElSelect v-model="modelForm.capabilityConfig.qualities" multiple collapse-tags><ElOption v-for="value in ['480P','768P','1080P','2K','4K']" :key="value" :label="value" :value="value" /></ElSelect></label>
		  <label><span>最短时长（秒）</span><ElInputNumber v-model="modelForm.capabilityConfig.minDuration" :min="1" :max="3600" /></label>
		  <label><span>最长时长（秒）</span><ElInputNumber v-model="modelForm.capabilityConfig.maxDuration" :min="1" :max="3600" /></label>
		  <label class="channel-form-wide"><span>生成模式</span><ElSelect v-model="modelForm.capabilityConfig.modes" multiple><ElOption label="文生视频" value="text" /><ElOption label="首尾帧" value="frames" /><ElOption label="全能参考" value="reference" /></ElSelect></label>
		  <label class="channel-switch-row"><span><strong>支持声音</strong><small>允许客户端开启或关闭生成声音。</small></span><ElSwitch v-model="modelForm.capabilityConfig.supportsSound" /></label>
		  <label class="channel-switch-row"><span><strong>支持水印</strong><small>允许客户端选择是否添加水印。</small></span><ElSwitch v-model="modelForm.capabilityConfig.supportsWatermark" /></label>
		</template>
        <label class="channel-switch-row"><span><strong>启用模型</strong><small>启用后会进入对应能力工作台的模型目录。</small></span><ElSwitch v-model="modelForm.enabled" /></label>
      </div>
      <template #footer><ElButton @click="modelDialogOpen = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveModel">保存模型</ElButton></template>
    </ElDialog>
  </section>
</template>
