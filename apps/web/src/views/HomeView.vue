<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { ElMessage } from "element-plus"
import {
  ArrowRight,
  Bell,
  Clock3,
  Image,
  LoaderCircle,
  Moon,
  Paperclip,
  Play,
  Sparkles,
  Sun,
  Video,
} from "@lucide/vue"
import { useAuthStore } from "@/stores/auth"
import * as assetApi from "@/services/assets"
import {
  createImageGeneration,
  type GenerationCapabilities,
} from "@/services/generation"
import { apiErrorMessage } from "@/services/http"

const authStore = useAuthStore()
const router = useRouter()

const creationTypes = [
  { id: "image", label: "图片生成", icon: Image },
  { id: "video", label: "视频生成", icon: Video },
]

const defaultCapabilities: GenerationCapabilities = {
  image: {
    enabled: true,
    models: [{ value: "gpt-image-2", label: "gpt-image-2" }],
    sizes: [
      { value: "1:1", label: "1:1", width: 2048, height: 2048 },
      { value: "16:9", label: "16:9", width: 2048, height: 1152 },
      { value: "9:16", label: "9:16", width: 1152, height: 2048 },
      { value: "4:3", label: "4:3", width: 2048, height: 1536 },
      { value: "3:4", label: "3:4", width: 1536, height: 2048 },
    ],
    qualities: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }],
  },
  video: { enabled: false, models: [], sizes: [], qualities: [] },
}

const activeType = ref("image")
const prompt = ref("")
const capabilities = ref<GenerationCapabilities>(defaultCapabilities)
const selectedModel = ref("gpt-image-2")
const selectedSize = ref("16:9")
const selectedQuality = ref("2K")
const darkMode = ref(false)
const creating = ref(false)
const recentLoading = ref(true)
const recentWorks = ref<assetApi.Asset[]>([])
const recentPreviewUrls = ref<Record<string, string>>({})

const currentCapability = computed(() => capabilities.value[activeType.value as keyof GenerationCapabilities])

const promptPlaceholder = computed(() => {
  const labels: Record<string, string> = {
    image: "描述你希望生成的画面、风格与构图…",
    video: "描述视频内容、镜头运动与节奏…",
  }
  return labels[activeType.value]
})

function selectCreationType(id: string) {
  activeType.value = id
  applyCapabilityDefaults()
}

async function startCreation() {
  if (!prompt.value.trim()) {
    ElMessage.info("先写下你的创作想法")
    return
  }
  if (activeType.value === "video") {
    ElMessage.info("当前后端暂未配置视频生成渠道")
    return
  }
  if (creating.value) return
  creating.value = true
  try {
    const task = await createImageGeneration({
      prompt: prompt.value.trim(),
      model: selectedModel.value,
      size: selectedSize.value,
      quality: selectedQuality.value,
    })
    ElMessage.success(`生成任务已创建：${task.taskId.slice(0, 8)}`)
    await router.push("/assets")
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "图片生成任务创建失败"))
  } finally {
    creating.value = false
  }
}

function openPlaceholder(label: string) {
  ElMessage.info(`${label} 页面将在下一阶段接入`)
}

function applyCapabilityDefaults() {
  const capability = currentCapability.value
  selectedModel.value = capability?.models[0]?.value || ""
  selectedSize.value = capability?.sizes[0]?.value || ""
  selectedQuality.value = capability?.qualities[0]?.value || ""
}

async function loadRecentWorks() {
  recentLoading.value = true
  try {
    const page = await assetApi.listAssets({ page: 1, pageSize: 8, source: "generated" })
    recentWorks.value = page.items.slice(0, 4)
    const entries = await Promise.all(
      recentWorks.value.map(async (work) => {
        if (work.status !== "ready" || !work.url) return [work.id, ""] as const
        try {
          const blob = await assetApi.getAssetContent(work.url)
          return [work.id, URL.createObjectURL(blob)] as const
        } catch {
          return [work.id, ""] as const
        }
      }),
    )
    revokeRecentPreviewUrls()
    recentPreviewUrls.value = Object.fromEntries(entries)
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "最近创作加载失败"))
  } finally {
    recentLoading.value = false
  }
}

function revokeRecentPreviewUrls() {
  Object.values(recentPreviewUrls.value).forEach((url) => url && URL.revokeObjectURL(url))
  recentPreviewUrls.value = {}
}

function recentMeta(work: assetApi.Asset) {
  if (work.status === "generating") return "生成中"
  if (work.status === "failed") return "生成失败"
  if (work.type === "video" && work.durationSeconds !== undefined) {
    const minutes = Math.floor(work.durationSeconds / 60)
    const seconds = Math.floor(work.durationSeconds % 60)
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }
  return work.width > 0 && work.height > 0 ? `${work.width}×${work.height}` : "已完成"
}

onMounted(() => {
  void loadRecentWorks()
})
onBeforeUnmount(revokeRecentPreviewUrls)
</script>

<template>
  <div class="home-page" :class="{ 'home-page--dark': darkMode }">
    <section class="creation-stage">
      <div class="creation-stage__toolbar">
        <button class="round-action" type="button" aria-label="通知">
          <Bell :size="18" />
          <span class="round-action__dot" />
        </button>
        <button class="round-action" type="button" :aria-label="darkMode ? '切换浅色模式' : '切换深色模式'" @click="darkMode = !darkMode">
          <Sun v-if="darkMode" :size="19" />
          <Moon v-else :size="19" />
        </button>
        <span class="header-avatar">{{ authStore.userInitial }}</span>
      </div>

      <div class="creation-stage__intro">
        <p>NOVA CREATIVE ENGINE</p>
        <h1>把灵感变成作品</h1>
        <span>从一句话开始，组织图片、视频、声音与故事。</span>
      </div>

      <div class="composer" aria-label="AI 创作输入区">
        <div class="composer__tabs" role="tablist" aria-label="创作类型">
          <button
            v-for="type in creationTypes"
            :key="type.id"
            type="button"
            role="tab"
            :aria-selected="activeType === type.id"
            :class="{ 'composer__tab--active': activeType === type.id }"
            @click="selectCreationType(type.id)"
          >
            <component :is="type.icon" :size="17" />
            <span>{{ type.label }}</span>
          </button>
        </div>

        <div class="composer__body">
          <button class="reference-slot" type="button" @click="openPlaceholder('参考素材')">
            <Paperclip :size="21" />
            <strong>添加参考</strong>
            <span>图片或视频</span>
          </button>
          <div class="composer__input-wrap">
            <textarea v-model="prompt" :placeholder="promptPlaceholder" rows="3" maxlength="1000" />
            <div class="composer__options">
              <div class="composer__selects">
                <el-select v-model="selectedModel" class="compact-select" aria-label="模型" disabled>
                  <el-option v-for="option in currentCapability?.models || []" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
                <el-select v-model="selectedSize" class="compact-select compact-select--small" aria-label="画面比例" :disabled="!currentCapability?.enabled">
                  <el-option v-for="option in currentCapability?.sizes || []" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
                <el-select v-model="selectedQuality" class="compact-select compact-select--small" aria-label="分辨率" :disabled="!currentCapability?.enabled">
                  <el-option v-for="option in currentCapability?.qualities || []" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </div>
              <button class="create-button" type="button" :disabled="creating" @click="startCreation">
                <LoaderCircle v-if="creating" class="spin" :size="18" />
                <Sparkles v-else :size="18" />
                <span>{{ creating ? "提交中" : "开始生成" }}</span>
                <ArrowRight :size="17" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="home-content">
      <div class="content-columns">
        <section class="content-section">
          <div class="section-heading">
            <div>
              <span class="section-heading__icon section-heading__icon--blue"><Clock3 :size="16" /></span>
              <h2>最近创作</h2>
            </div>
            <button type="button" @click="router.push('/assets')">查看全部 <ArrowRight :size="15" /></button>
          </div>
          <div v-if="recentLoading" class="media-grid media-grid--recent" aria-label="正在加载最近创作">
            <span v-for="index in 4" :key="index" class="media-tile media-tile--loading" />
          </div>
          <div v-else-if="recentWorks.length" class="media-grid media-grid--recent">
            <button v-for="work in recentWorks" :key="work.id" type="button" class="media-tile" @click="router.push('/assets')">
              <img v-if="recentPreviewUrls[work.id]" :src="recentPreviewUrls[work.id]" :alt="work.title" />
              <span v-else class="media-tile__state">{{ recentMeta(work) }}</span>
              <span class="media-tile__overlay" />
              <span class="media-tile__top">{{ work.type === "image" ? "图片" : "视频" }}</span>
              <span v-if="work.type === 'video' && work.status === 'ready'" class="media-tile__play"><Play :size="16" fill="currentColor" /></span>
              <span class="media-tile__caption" :class="{ 'media-tile__caption--full': work.type !== 'video' || work.status !== 'ready' }"><strong>{{ work.title }}</strong><small>{{ recentMeta(work) }}</small></span>
            </button>
          </div>
          <div v-else class="recent-empty">完成第一次图片生成后，作品会出现在这里</div>
        </section>

      </div>
    </div>
  </div>
</template>
