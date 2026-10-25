<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from "vue"
import { ElButton, ElInput, ElInputNumber, ElMessage } from "element-plus"
import "element-plus/dist/index.css"
import { LoaderCircle, Plus, RotateCcw, Save } from "@lucide/vue"

import * as pointApi from "@/services/points"

const MultiplierPanel = defineComponent({
  props: { title: { type: String, required: true }, values: { type: Object as () => Record<string, number>, required: true }, labels: { type: Object as () => Record<string, string>, required: true } },
  emits: ["change"],
  setup(props, { emit }) {
    return () => h("div", { class: "points-multiplier-panel" }, [h("strong", props.title), h("div", Object.keys(props.labels).map((key) => h("label", [h("span", props.labels[key]), h(ElInputNumber, { modelValue: props.values[key] ?? 1, min: 0, max: 1000000, precision: 2, "onUpdate:modelValue": (value: number | undefined) => emit("change", key, value) })])))])
  },
})

const capabilities: Array<{ value: pointApi.ModelCapability; label: string }> = [
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
]
const loading = ref(true)
const saving = ref(false)
const config = ref<pointApi.PointRuleConfig | null>(null)
const activeCapability = ref<pointApi.ModelCapability>("image")
const customModel = ref("")

const groupedCounts = computed(() => Object.fromEntries(capabilities.map((capability) => [capability.value, config.value?.models.filter((model) => model.capability === capability.value).length || 0])) as Record<pointApi.ModelCapability, number>)
const visibleModels = computed(() => config.value?.models.filter((model) => model.capability === activeCapability.value) || [])
const configuredCount = computed(() => config.value?.rules.length || 0)

onMounted(() => void loadRules())

async function loadRules() {
  loading.value = true
  try {
    config.value = await pointApi.getPointRules()
  } catch (error) {
    ElMessage.error(messageOf(error, "积分规则加载失败"))
  } finally {
    loading.value = false
  }
}

function modelCost(modelId: string) {
  return config.value?.rules.find((rule) => rule.modelId.toLowerCase() === modelId.toLowerCase())?.cost ?? config.value?.settings.defaultModelCost ?? 1
}

function setModelCost(modelId: string, value: number | undefined) {
  if (!config.value || value === undefined) return
  const existing = config.value.rules.find((rule) => rule.modelId.toLowerCase() === modelId.toLowerCase())
  if (existing) existing.cost = value
  else config.value.rules.push({ modelId, cost: value })
}

function resetModelCost(modelId: string) {
  if (!config.value) return
  config.value.rules = config.value.rules.filter((rule) => rule.modelId.toLowerCase() !== modelId.toLowerCase())
}

function addCustomModel() {
  if (!config.value) return
  const modelId = customModel.value.trim()
  if (!modelId) return ElMessage.warning("请输入模型 ID")
  if (!config.value.models.some((model) => model.modelId.toLowerCase() === modelId.toLowerCase())) config.value.models.push({ modelId, displayName: modelId, capability: activeCapability.value })
  setModelCost(modelId, config.value.settings.defaultModelCost)
  customModel.value = ""
}

async function saveRules() {
  if (!config.value) return
  saving.value = true
  try {
    config.value = await pointApi.savePointRules(config.value)
    ElMessage.success("积分规则已保存")
  } catch (error) {
    ElMessage.error(messageOf(error, "积分规则保存失败"))
  } finally {
    saving.value = false
  }
}

function updateMultiplier(group: "imageQualityMultipliers" | "videoQualityMultipliers" | "videoSecondsMultipliers", key: string, value: number | undefined) {
  if (!config.value || value === undefined) return
  config.value.settings[group][key] = value
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
</script>

<template>
  <section class="points-workspace">
    <div v-if="loading" class="points-loading"><LoaderCircle class="spin" :size="22" />正在加载积分规则</div>
    <template v-else-if="config">
      <div class="points-metrics">
        <div><span>新用户初始积分</span><strong>{{ config.settings.initialPoints }}</strong></div>
        <div><span>默认模型成本</span><strong>{{ config.settings.defaultModelCost }}</strong></div>
        <div><span>已配置模型</span><strong>{{ configuredCount }}</strong></div>
        <div><span>渠道模型</span><strong>{{ config.models.length }}</strong></div>
      </div>

      <div class="points-actions"><span>规则保存后立即用于新生成任务，运行中的任务沿用创建时成本。</span><ElButton type="primary" :loading="saving" @click="saveRules"><Save :size="15" />保存规则</ElButton></div>

      <section class="points-section">
        <div class="points-section-heading"><div><strong>基础积分</strong><span>新用户注册时获得初始积分；未单独配置的模型使用默认成本。</span></div></div>
        <div class="points-base-grid">
          <label><span>新用户初始积分</span><ElInputNumber v-model="config.settings.initialPoints" :min="0" :max="1000000" :precision="2" /></label>
          <label><span>其他模型默认成本</span><ElInputNumber v-model="config.settings.defaultModelCost" :min="0" :max="1000000" :precision="2" /></label>
        </div>
      </section>

      <section class="points-section">
        <div class="points-section-heading"><div><strong>模型基础扣费</strong><span>每次调用先应用模型成本，再乘以生成参数倍率。</span></div><div class="points-custom-model"><ElInput v-model="customModel" placeholder="手工模型 ID" @keyup.enter="addCustomModel" /><ElButton @click="addCustomModel"><Plus :size="14" />添加</ElButton></div></div>
        <div class="points-capability-tabs">
          <button v-for="capability in capabilities" :key="capability.value" type="button" :class="{ 'is-active': activeCapability === capability.value }" @click="activeCapability = capability.value">{{ capability.label }} {{ groupedCounts[capability.value] }}</button>
        </div>
        <div v-if="visibleModels.length" class="points-model-grid">
          <div v-for="model in visibleModels" :key="model.modelId"><span><strong>{{ model.displayName }}</strong><small>{{ model.modelId }}</small></span><ElInputNumber :model-value="modelCost(model.modelId)" :min="0" :max="1000000" :precision="2" @update:model-value="setModelCost(model.modelId, $event)" /><button type="button" title="恢复默认成本" :disabled="!config.rules.some((rule) => rule.modelId.toLowerCase() === model.modelId.toLowerCase())" @click="resetModelCost(model.modelId)"><RotateCcw :size="14" /></button></div>
        </div>
        <div v-else class="points-empty">当前没有{{ capabilities.find((item) => item.value === activeCapability)?.label }}模型，请先在模型渠道中配置。</div>
      </section>

      <section class="points-section">
        <div class="points-section-heading"><div><strong>生成参数倍率</strong><span>最终扣费 = 模型成本 × 参数倍率；未命中的参数按 1 倍处理。</span></div></div>
        <div class="points-multiplier-grid">
          <MultiplierPanel title="图片清晰度" :values="config.settings.imageQualityMultipliers" :labels="{ '1K': '1K', '2K': '2K' }" @change="(key, value) => updateMultiplier('imageQualityMultipliers', key, value)" />
          <MultiplierPanel title="视频清晰度" :values="config.settings.videoQualityMultipliers" :labels="{ '480': '480p', '720': '720p', '1080': '1080p' }" @change="(key, value) => updateMultiplier('videoQualityMultipliers', key, value)" />
          <MultiplierPanel title="视频秒数" :values="config.settings.videoSecondsMultipliers" :labels="{ '5': '5 秒', '10': '10 秒' }" @change="(key, value) => updateMultiplier('videoSecondsMultipliers', key, value)" />
        </div>
      </section>
    </template>
  </section>
</template>
