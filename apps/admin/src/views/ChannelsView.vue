<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { ElButton, ElDialog, ElInput, ElMessage, ElMessageBox, ElOption, ElSelect, ElSwitch } from "element-plus"
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, XCircle } from "@lucide/vue"

import * as channelApi from "@/services/channels"

const channels = ref<channelApi.ModelChannel[]>([])
const loading = ref(true)
const saving = ref(false)
const testingId = ref("")
const syncingId = ref("")
const query = ref("")
const status = ref<"all" | "enabled" | "disabled">("all")
const dialogOpen = ref(false)
const editingId = ref("")
const modelDialogOpen = ref(false)
const editingModelId = ref("")

const channelForm = reactive<channelApi.ChannelInput>({ name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false })
const modelForm = reactive<channelApi.ModelInput>({ modelId: "", displayName: "", capability: "image", enabled: true, sortOrder: 0 })

const editingChannel = computed(() => channels.value.find((channel) => channel.id === editingId.value))
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

onMounted(() => void loadChannels())

async function loadChannels() {
  loading.value = true
  try {
    channels.value = await channelApi.listChannels()
  } catch (error) {
    ElMessage.error(messageOf(error, "渠道加载失败"))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = ""
  Object.assign(channelForm, { name: "", baseUrl: "", protocol: "openai", apiKey: "", enabled: false })
  dialogOpen.value = true
}

function openEdit(channel: channelApi.ModelChannel) {
  editingId.value = channel.id
  Object.assign(channelForm, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, apiKey: "", enabled: channel.enabled })
  dialogOpen.value = true
}

async function saveChannel() {
  if (!channelForm.name.trim() || !channelForm.baseUrl.trim()) return ElMessage.warning("请填写渠道名称和 Base URL")
  if (!editingId.value && !channelForm.apiKey?.trim()) return ElMessage.warning("新渠道必须填写 API Key")
  saving.value = true
  try {
    const saved = editingId.value ? await channelApi.updateChannel(editingId.value, channelForm) : await channelApi.createChannel(channelForm)
    editingId.value = saved.id
    channelForm.apiKey = ""
    await loadChannels()
    ElMessage.success(editingId.value ? "渠道配置已保存" : "渠道已创建")
  } catch (error) {
    ElMessage.error(messageOf(error, "渠道保存失败"))
  } finally {
    saving.value = false
  }
}

async function toggleChannel(channel: channelApi.ModelChannel, enabled: boolean) {
  try {
    await channelApi.updateChannel(channel.id, { name: channel.name, baseUrl: channel.baseUrl, protocol: channel.protocol, enabled })
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
    capability: "image",
    enabled: model?.enabled ?? true,
    sortOrder: model?.sortOrder ?? (editingChannel.value?.models.length || 0),
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
  if (channel.lastTestStatus === "failed") return "连接异常"
  return "已启用"
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
      <div><span>可用图片模型</span><strong>{{ enabledModelCount }}</strong></div>
      <div><span>协议</span><strong>OpenAI</strong></div>
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
            <td><strong>OpenAI 图片</strong><span>{{ channel.baseUrl }}</span></td>
            <td><strong>{{ channel.models.filter((model) => model.enabled).length }} / {{ channel.models.length }}</strong><span>{{ channel.models.map((model) => model.displayName).join("、") || "尚未添加模型" }}</span></td>
            <td><span class="channel-status" :class="{ 'is-enabled': channel.enabled, 'is-error': channel.lastTestStatus === 'failed' }">{{ statusText(channel) }}</span></td>
            <td><span class="channel-test-result"><CheckCircle2 v-if="channel.lastTestStatus === 'success'" :size="14" /><XCircle v-else-if="channel.lastTestStatus === 'failed'" :size="14" /><CircleAlert v-else :size="14" />{{ channel.lastTestMessage || "尚未检测" }}</span></td>
            <td><div class="channel-actions"><button type="button" title="测试连接" @click="testChannel(channel)"><LoaderCircle v-if="testingId === channel.id" class="spin" :size="15" /><CheckCircle2 v-else :size="15" /></button><button type="button" title="同步模型" @click="syncModels(channel)"><LoaderCircle v-if="syncingId === channel.id" class="spin" :size="15" /><RefreshCw v-else :size="15" /></button><button type="button" title="编辑渠道" @click="openEdit(channel)"><Pencil :size="15" /></button><ElSwitch :model-value="channel.enabled" @change="toggleChannel(channel, Boolean($event))" /></div></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!loading && filteredChannels.length" class="channel-mobile-list">
      <article v-for="channel in filteredChannels" :key="channel.id">
        <div class="channel-mobile-head"><button class="channel-name" type="button" @click="openEdit(channel)"><strong>{{ channel.name }}</strong><span><KeyRound :size="12" />{{ channel.apiKeyMasked || "未保存密钥" }}</span></button><span class="channel-status" :class="{ 'is-enabled': channel.enabled, 'is-error': channel.lastTestStatus === 'failed' }">{{ statusText(channel) }}</span></div>
        <dl><div><dt>协议</dt><dd>OpenAI 图片</dd></div><div><dt>模型</dt><dd>{{ channel.models.filter((model) => model.enabled).length }} / {{ channel.models.length }}</dd></div></dl>
        <p>{{ channel.models.map((model) => model.displayName).join("、") || "尚未添加模型" }}</p>
        <div class="channel-mobile-test"><CheckCircle2 v-if="channel.lastTestStatus === 'success'" :size="14" /><XCircle v-else-if="channel.lastTestStatus === 'failed'" :size="14" /><CircleAlert v-else :size="14" /><span>{{ channel.lastTestMessage || "尚未检测" }}</span></div>
        <div class="channel-mobile-actions"><button type="button" @click="testChannel(channel)"><LoaderCircle v-if="testingId === channel.id" class="spin" :size="15" /><CheckCircle2 v-else :size="15" />测试</button><button type="button" @click="syncModels(channel)"><LoaderCircle v-if="syncingId === channel.id" class="spin" :size="15" /><RefreshCw v-else :size="15" />同步</button><button type="button" @click="openEdit(channel)"><Pencil :size="15" />编辑</button><ElSwitch :model-value="channel.enabled" @change="toggleChannel(channel, Boolean($event))" /></div>
      </article>
    </div>
    <div v-if="!loading && !filteredChannels.length" class="channel-empty"><KeyRound :size="28" /><strong>{{ channels.length ? "没有匹配的渠道" : "还没有模型渠道" }}</strong><span>接入 OpenAI 兼容图片渠道后，模型会出现在用户创作端。</span><button v-if="!channels.length" class="channel-primary" type="button" @click="openCreate"><Plus :size="16" />接入第一个渠道</button></div>

    <ElDialog v-model="dialogOpen" :title="editingId ? '编辑模型渠道' : '接入模型渠道'" width="min(720px, calc(100vw - 28px))" destroy-on-close>
      <div class="channel-form-grid">
        <label><span>渠道名称</span><ElInput v-model="channelForm.name" placeholder="例如：生产图片渠道" /></label>
        <label><span>协议</span><ElSelect v-model="channelForm.protocol" disabled><ElOption label="OpenAI 图片生成" value="openai" /></ElSelect></label>
        <label class="channel-form-wide"><span>Base URL</span><ElInput v-model="channelForm.baseUrl" placeholder="https://api.example.com/v1" /></label>
        <label class="channel-form-wide"><span>API Key</span><ElInput v-model="channelForm.apiKey" type="password" show-password :placeholder="editingChannel?.hasApiKey ? `已保存 ${editingChannel.apiKeyMasked}，留空保持不变` : '输入 API Key'" /></label>
        <label class="channel-switch-row"><span><strong>启用渠道</strong><small>只有启用渠道中的启用模型会展示给用户。</small></span><ElSwitch v-model="channelForm.enabled" /></label>
      </div>

      <div v-if="editingChannel" class="channel-models-section">
        <div class="channel-models-heading"><div><strong>图片模型</strong><span>维护用户端可选择的模型 ID、名称和排序。</span></div><div><ElButton :loading="syncingId === editingChannel.id" @click="syncModels(editingChannel)"><RefreshCw :size="14" />同步目录</ElButton><ElButton type="primary" @click="openModel()"><Plus :size="14" />添加模型</ElButton></div></div>
        <div v-if="editingChannel.models.length" class="channel-model-list">
          <div v-for="model in editingChannel.models" :key="model.id"><span><strong>{{ model.displayName }}</strong><small>{{ model.modelId }} · 排序 {{ model.sortOrder }}</small></span><span class="channel-model-ops"><span class="channel-status" :class="{ 'is-enabled': model.enabled }">{{ model.enabled ? "已启用" : "已停用" }}</span><button type="button" aria-label="编辑模型" @click="openModel(model)"><Pencil :size="14" /></button><button type="button" aria-label="删除模型" @click="removeModel(model)"><Trash2 :size="14" /></button></span></div>
        </div>
        <div v-else class="channel-model-empty">尚未添加图片模型，可手动添加或从上游同步。</div>
      </div>

      <template #footer><div class="channel-dialog-footer"><ElButton v-if="editingChannel" type="danger" plain @click="removeChannel(editingChannel)"><Trash2 :size="14" />删除渠道</ElButton><span /><ElButton @click="dialogOpen = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveChannel">保存渠道</ElButton></div></template>
    </ElDialog>

    <ElDialog v-model="modelDialogOpen" :title="editingModelId ? '编辑图片模型' : '添加图片模型'" width="min(520px, calc(100vw - 28px))" append-to-body>
      <div class="channel-form-grid">
        <label><span>模型 ID</span><ElInput v-model="modelForm.modelId" placeholder="gpt-image-2" /></label>
        <label><span>展示名称</span><ElInput v-model="modelForm.displayName" placeholder="留空则使用模型 ID" /></label>
        <label><span>排序</span><ElInput v-model.number="modelForm.sortOrder" type="number" min="0" /></label>
        <label class="channel-switch-row"><span><strong>用户可选</strong><small>关闭后不会出现在图片创作模型列表。</small></span><ElSwitch v-model="modelForm.enabled" /></label>
      </div>
      <template #footer><ElButton @click="modelDialogOpen = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveModel">保存模型</ElButton></template>
    </ElDialog>
  </section>
</template>
