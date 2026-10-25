<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { useIntervalFn } from "@vueuse/core"
import {
  ArrowRight,
  Bell,
  ChevronDown,
  Clock3,
  Image,
  LoaderCircle,
  Music,
  Moon,
  Paperclip,
  Play,
  Plus,
  Sparkles,
  Sun,
  Type,
  Video,
  X,
} from "@lucide/vue"
import { useAuthStore } from "@/stores/auth"
import AssetPreviewDialog from "@/components/AssetPreviewDialog.vue"
import * as assetApi from "@/services/assets"
import {
  createImageGeneration,
	createVideoGeneration,
  type GenerationCapabilities,
  type VideoGenerationMode,
  type VideoReferenceRole,
} from "@/services/generation"
import { apiErrorMessage } from "@/services/http"
import { listImageModels, listVideoModels } from "@/services/models"
import { notification } from "@/services/notifications"

const authStore = useAuthStore()
const router = useRouter()
const sameParametersStorageKey = "nova.same-generation-parameters"

const creationTypes = [
  { id: "image", label: "图片生成", icon: Image },
  { id: "video", label: "视频生成", icon: Video },
]

const defaultCapabilities: GenerationCapabilities = {
  image: {
    enabled: true,
    models: [],
    sizes: [
      { value: "1:1", label: "1:1", width: 2048, height: 2048 },
      { value: "16:9", label: "16:9", width: 2048, height: 1152 },
      { value: "9:16", label: "9:16", width: 1152, height: 2048 },
      { value: "4:3", label: "4:3", width: 2048, height: 1536 },
      { value: "3:4", label: "3:4", width: 1536, height: 2048 },
    ],
    qualities: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }],
  },
	video: { enabled: false, models: [], sizes: [{value:"adaptive",label:"自适应",width:0,height:0},{value:"21:9",label:"21:9",width:0,height:0},{value:"16:9",label:"16:9",width:0,height:0},{value:"4:3",label:"4:3",width:0,height:0},{value:"1:1",label:"1:1",width:0,height:0},{value:"3:4",label:"3:4",width:0,height:0},{value:"9:16",label:"9:16",width:0,height:0}], qualities: [{value:"480P",label:"480P"},{value:"768P",label:"768P"},{value:"1080P",label:"1080P"},{value:"2K",label:"2K"},{value:"4K",label:"4K"}], durations:Array.from({length:27},(_,index)=>({value:String(index+4),label:`${index+4}秒`})) },
}

const activeType = ref("image")
const prompt = ref("")
const capabilities = ref<GenerationCapabilities>(defaultCapabilities)
const selectedModel = ref("")
const selectedSize = ref("16:9")
const selectedQuality = ref("2K")
const selectedCount = ref(1)
const selectedDuration=ref(5)
const videoMode = ref<VideoGenerationMode>("text")
const soundEnabled = ref(true)
const watermarkEnabled = ref(false)
const referenceInput = ref<HTMLInputElement | null>(null)
type ReferenceKind = "image" | "video" | "audio"
type ReferenceDraft = { key: string; file: File; previewUrl: string; assetId: string; kind: ReferenceKind; role: VideoReferenceRole | "" }
const references = ref<ReferenceDraft[]>([])
const darkMode = ref(false)
const creating = ref(false)
const modelsLoading = ref(true)
const recentLoading = ref(true)
const recentRefreshing = ref(false)
const recentWorks = ref<assetApi.Asset[]>([])
const recentPreviewUrls = ref<Record<string, string>>({})
const recentPreviewSignatures = ref<Record<string, string>>({})
const selectedRecent = ref<assetApi.Asset | null>(null)
const recentDetailUrl = ref("")
let recentDetailObjectUrl = ""
const showHeroBackdrop = ref(false)
let recentLoadSequence = 0
let heroIdleHandle: number | undefined

const currentCapability = computed(() => capabilities.value[activeType.value as keyof GenerationCapabilities])
const videoModes: Array<{ value: VideoGenerationMode; label: string }> = [
  { value: "text", label: "文生视频" },
  { value: "frames", label: "首尾帧" },
  { value: "reference", label: "全能参考" },
]
const referenceLimit = computed(() => activeType.value === "image" ? 3 : videoMode.value === "frames" ? 2 : videoMode.value === "reference" ? 12 : 0)
const referenceAccept = computed(() => activeType.value === "image" || videoMode.value === "frames"
  ? "image/jpeg,image/png,image/webp"
  : "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/flac")
const referenceHint = computed(() => {
  if (activeType.value === "image") return "最多 3 张图片"
  if (videoMode.value === "frames") return "首帧与尾帧"
  if (videoMode.value === "reference") return "图片、视频或音频"
  return "无需上传素材"
})
const hasGeneratingRecentWorks = computed(() => recentWorks.value.some((work) => work.status === "generating"))
const refreshInterval = Number(import.meta.env.VITE_GENERATION_REFRESH_INTERVAL_MS || 3000)

const { pause: pauseRecentRefresh, resume: resumeRecentRefresh } = useIntervalFn(
  () => {
    if (!recentLoading.value && !recentRefreshing.value && hasGeneratingRecentWorks.value) void loadRecentWorks({ silent: true })
  },
  Number.isFinite(refreshInterval) && refreshInterval > 0 ? refreshInterval : 3000,
  { immediate: false },
)

watch(hasGeneratingRecentWorks, (hasGenerating) => (hasGenerating ? resumeRecentRefresh() : pauseRecentRefresh()), { immediate: true })

const promptPlaceholder = computed(() => {
  const labels: Record<string, string> = {
    image: "描述你希望生成的画面、风格与构图…",
    video: "描述视频内容、镜头运动与节奏…",
  }
  return labels[activeType.value]
})

function selectCreationType(id: string) {
  if (activeType.value !== id) clearReferencePreviews()
  activeType.value = id
  applyCapabilityDefaults()
}

function selectVideoMode(mode: VideoGenerationMode) {
  if (videoMode.value === mode) return
  clearReferencePreviews()
  videoMode.value = mode
}

function changeVideoMode(event: Event) {
  selectVideoMode((event.target as HTMLSelectElement).value as VideoGenerationMode)
}

async function startCreation() {
  if (!prompt.value.trim() && (activeType.value === "image" || videoMode.value === "text")) {
    notification.info("先写下你的创作想法")
    return
  }
  if (activeType.value === "video" && videoMode.value !== "text" && references.value.length === 0) {
    notification.info(videoMode.value === "frames" ? "请添加首帧或尾帧" : "请添加参考素材")
    return
  }
  if (activeType.value === "video" && videoMode.value === "reference" && references.value.every((reference) => reference.kind === "audio")) {
    notification.info("参考音频需要同时添加至少一张图片或一个视频")
    return
  }
  if (!selectedModel.value) {
    notification.warning(`当前没有可用的${activeType.value === "video" ? "视频" : "图片"}模型，请联系管理员配置模型渠道`)
    return
  }
  if (creating.value) return
  creating.value = true
  try {
    const submittedPrompt = prompt.value.trim()
	await Promise.all(references.value.map(async (reference) => {
	  if (reference.assetId) return
	  const uploaded = await assetApi.uploadAsset(reference.file, "创作参考素材")
	  reference.assetId = uploaded.id
	}))
	const referenceAssetIds = references.value.map((reference) => reference.assetId)
	const videoReferences = references.value.map((reference) => ({ assetId: reference.assetId, role: reference.role as VideoReferenceRole }))
	const batch = activeType.value==="video" ? await createVideoGeneration({prompt:submittedPrompt,model:selectedModel.value,size:selectedSize.value,quality:selectedQuality.value,durationSeconds:selectedDuration.value,soundEnabled:soundEnabled.value,watermarkEnabled:watermarkEnabled.value,mode:videoMode.value,...(videoReferences.length?{references:videoReferences}:{})}) : await createImageGeneration({
      prompt: submittedPrompt,
      model: selectedModel.value,
      size: selectedSize.value,
      quality: selectedQuality.value,
      count: selectedCount.value,
	  ...(referenceAssetIds.length ? { referenceAssetIds } : {}),
	})
    const pendingAssets: assetApi.Asset[] = batch.tasks.map((task) => ({
	  id: task.assetId, type: activeType.value as "image"|"video", source: "generated", status: "generating",
      title: submittedPrompt.slice(0, 80) || (videoMode.value === "frames" ? "首尾帧视频" : "全能参考视频"), url: "", downloadUrl: "", sizeBytes: 0,
      width: task.width, height: task.height, createdAt: task.createdAt,
    }))
    const pendingIDs = new Set(pendingAssets.map((asset) => asset.id))
    recentWorks.value = [
      ...pendingAssets,
      ...recentWorks.value.filter((work) => !pendingIDs.has(work.id)),
    ].slice(0, 8)
    authStore.setPointsBalance(batch.pointsRemaining)
	notification.success(activeType.value==="video"?"视频生成任务已创建":`${batch.tasks.length} 张图片生成任务已创建`)
    await loadRecentWorks({ silent: true })
  } catch (error) {
    notification.error(apiErrorMessage(error, activeType.value === "video" ? "视频生成任务创建失败" : "图片生成任务创建失败"))
  } finally {
    creating.value = false
  }
}

function chooseReference() {
  if (referenceLimit.value > 0) referenceInput.value?.click()
}

function selectReference(event: Event) {
  const input = event.target as HTMLInputElement
	const files = Array.from(input.files || [])
  input.value = ""
	if (!files.length) return
	const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"])
	const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"])
	const audioTypes = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac"])
	let rejected = false
	for (const file of files) {
	  if (references.value.length >= referenceLimit.value) {
		rejected = true
		break
	  }
	  const kind: ReferenceKind | "" = imageTypes.has(file.type) ? "image" : videoTypes.has(file.type) ? "video" : audioTypes.has(file.type) ? "audio" : ""
	  if (!kind || ((activeType.value === "image" || videoMode.value === "frames") && kind !== "image")) {
		rejected = true
		continue
	  }
	  if (videoMode.value === "reference" && references.value.filter((reference) => reference.kind === kind).length >= ({ image: 9, video: 3, audio: 3 }[kind])) {
		rejected = true
		continue
	  }
	  const key = `${file.name}:${file.size}:${file.lastModified}`
	  if (references.value.some((reference) => reference.key === key)) continue
	  const role: VideoReferenceRole | "" = activeType.value === "image" ? "" : videoMode.value === "frames" ? (references.value.some((reference) => reference.role === "first_frame") ? "last_frame" : "first_frame") : kind === "image" ? "reference_image" : kind === "video" ? "reference_video" : "reference_audio"
	  references.value.push({ key, file, previewUrl: URL.createObjectURL(file), assetId: "", kind, role })
  }
	if (rejected) notification.warning(activeType.value === "image" ? "最多添加 3 张 JPG、PNG 或 WebP 参考图" : videoMode.value === "frames" ? "首尾帧只能添加最多 2 张图片" : "全能参考最多 9 张图片、3 个视频、3 个音频，总计 12 个")
}

function clearReferencePreviews() {
	references.value.forEach((reference) => URL.revokeObjectURL(reference.previewUrl))
	references.value = []
}

function removeReference(key: string) {
	const reference = references.value.find((item) => item.key === key)
	if (reference) URL.revokeObjectURL(reference.previewUrl)
	references.value = references.value.filter((item) => item.key !== key)
}

function applyCapabilityDefaults() {
  const capability = currentCapability.value
  selectedModel.value = capability?.models[0]?.value || ""
  selectedSize.value = capability?.sizes[0]?.value || ""
	selectedQuality.value = capability?.qualities[0]?.value || ""
	selectedDuration.value=Number(capability?.durations?.[0]?.value||5)
}

async function loadRecentWorks(options: { silent?: boolean } = {}) {
  const sequence = ++recentLoadSequence
  if (options.silent) recentRefreshing.value = true
  else recentLoading.value = true
  try {
    const page = await assetApi.listAssets({ page: 1, pageSize: 8, source: "generated" })
    if (sequence !== recentLoadSequence) return
    const nextWorks = page.items.slice(0, 8)
    const refunded = nextWorks.some((work) => work.status === "failed" && recentWorks.value.find((current) => current.id === work.id)?.status === "generating")
    recentWorks.value = nextWorks
    if (refunded) void authStore.refreshPointsBalance()
    void loadRecentPreviewUrls(nextWorks, sequence)
  } catch (error) {
    if (sequence === recentLoadSequence && !options.silent) notification.error(apiErrorMessage(error, "最近创作加载失败"))
  } finally {
    if (sequence === recentLoadSequence) {
      recentLoading.value = false
      recentRefreshing.value = false
    }
  }
}

async function loadRecentPreviewUrls(works: assetApi.Asset[], sequence: number) {
  const existingUrls = recentPreviewUrls.value
  const existingSignatures = recentPreviewSignatures.value
  const entries = await Promise.all(works.map(async (work) => {
    const signature = `${work.status}:${work.url}:${work.sizeBytes}`
    if (work.status !== "ready" || !work.url) return { id: work.id, url: "", signature, created: false }
    if (existingUrls[work.id] && existingSignatures[work.id] === signature) return { id: work.id, url: existingUrls[work.id], signature, created: false }
    const thumbnailURL = work.type === "image" ? `${work.url}${work.url.includes("?") ? "&" : "?"}thumbnail=1` : work.url
    try {
      const blob = await assetApi.getAssetContent(thumbnailURL)
      return { id: work.id, url: URL.createObjectURL(blob), signature, created: true }
    } catch {
      if (work.type === "image") {
        try {
          const original = await assetApi.getAssetContent(work.url)
          return { id: work.id, url: URL.createObjectURL(original), signature, created: true }
        } catch { /* leave this card in its fallback state */ }
      }
      return { id: work.id, url: "", signature: "", created: false }
    }
  }))
  if (sequence !== recentLoadSequence) {
    entries.forEach((entry) => entry.created && entry.url && URL.revokeObjectURL(entry.url))
    return
  }
  const nextUrls = Object.fromEntries(entries.map((entry) => [entry.id, entry.url]))
  Object.entries(existingUrls).forEach(([id, url]) => {
    if (url && nextUrls[id] !== url) URL.revokeObjectURL(url)
  })
  recentPreviewUrls.value = nextUrls
  recentPreviewSignatures.value = Object.fromEntries(entries.map((entry) => [entry.id, entry.signature]))
}

async function loadModels() {
  modelsLoading.value = true
  try {
	  const [images,videos] = await Promise.all([listImageModels(),listVideoModels()])
	  capabilities.value.image.models = images.map((model) => ({ value: model.id, label: model.displayName }))
	  capabilities.value.video.models = videos.map((model) => ({ value: model.id, label: model.displayName }));capabilities.value.video.enabled=videos.length>0
	  const current=activeType.value==="video"?videos:images;if (!current.some((model) => model.id === selectedModel.value)) selectedModel.value = current[0]?.id || ""
  } catch (error) {
    capabilities.value.image.models = []
    selectedModel.value = ""
    notification.error(apiErrorMessage(error, "图片模型加载失败"))
  } finally {
    modelsLoading.value = false
  }
}

function revokeRecentPreviewUrls() {
  Object.values(recentPreviewUrls.value).forEach((url) => url && URL.revokeObjectURL(url))
  recentPreviewUrls.value = {}
  recentPreviewSignatures.value = {}
}

async function openRecent(work: assetApi.Asset) {
  if (work.status !== "ready" || !recentPreviewUrls.value[work.id]) return
  closeRecent()
  selectedRecent.value = work
  recentDetailUrl.value = recentPreviewUrls.value[work.id]
  if (work.type !== "image") return
  try {
    const original = await assetApi.getAssetContent(work.url)
    const objectUrl = URL.createObjectURL(original)
    if (selectedRecent.value?.id !== work.id) {
      URL.revokeObjectURL(objectUrl)
      return
    }
    recentDetailObjectUrl = objectUrl
    recentDetailUrl.value = objectUrl
  } catch {
    // Keep the authenticated thumbnail visible if the original cannot be loaded.
  }
}

function closeRecent() {
  if (recentDetailObjectUrl) URL.revokeObjectURL(recentDetailObjectUrl)
  recentDetailObjectUrl = ""
  recentDetailUrl.value = ""
  selectedRecent.value = null
}

function useSameParameters(asset: assetApi.Asset, notify = true) {
  const task = asset.generation
  if (!task || (asset.type !== "image" && asset.type !== "video")) return
  clearReferencePreviews()
  activeType.value = asset.type
  prompt.value = task.prompt
  const capability = capabilities.value[asset.type]
  selectedModel.value = capability.models.some((option) => option.value === task.model) ? task.model : capability.models[0]?.value || ""
  selectedSize.value = capability.sizes.some((option) => option.value === task.ratio) ? task.ratio : capability.sizes[0]?.value || ""
  selectedQuality.value = capability.qualities.some((option) => option.value === task.quality) ? task.quality : capability.qualities[0]?.value || ""
  selectedCount.value = 1
  if (asset.type === "video") {
    selectedDuration.value = task.requestedDurationSeconds || 5
    soundEnabled.value = task.soundEnabled
    watermarkEnabled.value = task.watermarkEnabled
    videoMode.value = task.videoMode === "frames" || task.videoMode === "reference" ? task.videoMode : "text"
  }
  closeRecent()
  document.querySelector<HTMLElement>(".page-scroll")?.scrollTo({ top: 0, behavior: "smooth" })
  if (notify) notification.success("同款参数已回填，可继续修改后生成")
}

function restoreSameParameters() {
  const raw = sessionStorage.getItem(sameParametersStorageKey)
  if (!raw) return
  sessionStorage.removeItem(sameParametersStorageKey)
  try {
    useSameParameters(JSON.parse(raw) as assetApi.Asset)
  } catch {
    notification.warning("同款参数恢复失败")
  }
}

function recentMeta(work: assetApi.Asset) {
  if (work.status === "generating") return "生成中"
	if (work.status === "failed") return "生成失败"
	if (work.status === "needs_review") return "等待确认"
  if (work.type === "video" && work.durationSeconds !== undefined) {
    const minutes = Math.floor(work.durationSeconds / 60)
    const seconds = Math.floor(work.durationSeconds % 60)
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }
  return work.width > 0 && work.height > 0 ? `${work.width}×${work.height}` : "已完成"
}

onMounted(async () => {
	await Promise.all([loadModels(), loadRecentWorks()])
	restoreSameParameters()
  if ("requestIdleCallback" in window) heroIdleHandle = window.requestIdleCallback(() => (showHeroBackdrop.value = true))
  else requestAnimationFrame(() => (showHeroBackdrop.value = true))
})
onBeforeUnmount(() => {
  if (heroIdleHandle !== undefined && "cancelIdleCallback" in window) window.cancelIdleCallback(heroIdleHandle)
	pauseRecentRefresh()
	clearReferencePreviews()
  closeRecent()
  revokeRecentPreviewUrls()
})
</script>

<template>
  <div class="home-page" :class="{ 'home-page--dark': darkMode }">
    <section class="creation-stage">
      <img v-if="showHeroBackdrop" class="creation-stage__backdrop" src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2200&q=82" alt="" loading="lazy" decoding="async" fetchpriority="low" />
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

        <div class="composer__body" :class="{ 'composer__body--reference': activeType === 'video' && videoMode === 'reference' }">
		  <div class="reference-slot" :class="{ 'reference-slot--selected': references.length }">
			<input ref="referenceInput" class="reference-slot__input" type="file" :accept="referenceAccept" multiple @change="selectReference" />
			<div v-if="activeType === 'video' && videoMode === 'text'" class="reference-slot__pick reference-slot__pick--static">
			  <Type :size="21" /><strong>文生视频</strong><span>{{ referenceHint }}</span>
			</div>
			<button v-else-if="!references.length" class="reference-slot__pick" type="button" aria-label="添加参考素材" @click="chooseReference">
			  <Paperclip :size="21" /><strong>添加参考</strong><span>{{ referenceHint }}</span>
			</button>
			<div v-else class="reference-slot__grid">
			  <div v-for="reference in references" :key="reference.key" class="reference-slot__thumb">
				<img v-if="reference.kind === 'image'" :src="reference.previewUrl" :alt="reference.file.name" />
				<video v-else-if="reference.kind === 'video'" :src="reference.previewUrl" muted preload="metadata" aria-hidden="true" />
				<span v-else class="reference-slot__audio"><Music :size="17" /><small>{{ reference.file.name }}</small></span>
				<em v-if="videoMode === 'frames'" class="reference-slot__role">{{ reference.role === 'first_frame' ? '首帧' : '尾帧' }}</em>
				<button type="button" aria-label="移除参考素材" title="移除参考素材" @click="removeReference(reference.key)"><X :size="12" /></button>
			  </div>
			  <button v-if="references.length < referenceLimit" class="reference-slot__add" type="button" aria-label="继续添加参考素材" @click="chooseReference"><Plus :size="18" /><span>{{ references.length }}/{{ referenceLimit }}</span></button>
			</div>
		  </div>
          <div class="composer__input-wrap">
            <textarea v-model="prompt" :placeholder="promptPlaceholder" rows="3" maxlength="1000" />
            <div class="composer__options">
              <div class="composer__selects">
                <label class="compact-select"><select v-model="selectedModel" aria-label="模型" :disabled="modelsLoading || !currentCapability?.models.length"><option v-if="modelsLoading" value="">加载模型</option><option v-else-if="!currentCapability?.models.length" value="">暂无模型</option><option v-for="option in currentCapability?.models || []" :key="option.value" :value="option.value">{{ option.label }}</option></select><ChevronDown :size="14" /></label>
				<label v-if="activeType === 'video'" class="compact-select compact-select--mode"><select :value="videoMode" aria-label="视频生成模式" @change="changeVideoMode"><option v-for="mode in videoModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option></select><ChevronDown :size="14" /></label>
                <label class="compact-select compact-select--small"><select v-model="selectedSize" aria-label="画面比例" :disabled="!currentCapability?.enabled"><option v-for="option in currentCapability?.sizes || []" :key="option.value" :value="option.value">{{ option.label }}</option></select><ChevronDown :size="14" /></label>
				<label class="compact-select compact-select--small"><select v-model="selectedQuality" aria-label="分辨率" :disabled="!currentCapability?.enabled"><option v-for="option in currentCapability?.qualities || []" :key="option.value" :value="option.value">{{ option.label }}</option></select><ChevronDown :size="14" /></label>
				<label v-if="activeType === 'image'" class="compact-select compact-select--count"><select v-model.number="selectedCount" aria-label="生成张数" :disabled="!currentCapability?.enabled"><option v-for="count in 4" :key="count" :value="count">{{ count }}张</option></select><ChevronDown :size="14" /></label>
				<label v-else class="compact-select compact-select--count"><select v-model.number="selectedDuration" aria-label="视频时长" :disabled="!currentCapability?.enabled"><option v-for="option in currentCapability?.durations || []" :key="option.value" :value="Number(option.value)">{{ option.label }}</option></select><ChevronDown :size="14" /></label>
				<label v-if="activeType === 'video'" class="compact-toggle"><input v-model="soundEnabled" type="checkbox" /><span>{{ soundEnabled ? "有声音" : "无声音" }}</span></label>
				<label v-if="activeType === 'video'" class="compact-toggle"><input v-model="watermarkEnabled" type="checkbox" /><span>{{ watermarkEnabled ? "有水印" : "无水印" }}</span></label>
              </div>
              <button class="create-button" type="button" :disabled="creating || modelsLoading || !selectedModel" @click="startCreation">
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
            <span v-for="index in 8" :key="index" class="media-tile media-tile--loading" />
          </div>
          <div v-else-if="recentWorks.length" class="media-grid media-grid--recent">
            <button v-for="work in recentWorks" :key="work.id" type="button" class="media-tile" :disabled="work.status !== 'ready' || !recentPreviewUrls[work.id]" @click="openRecent(work)">
              <img v-if="recentPreviewUrls[work.id] && work.type === 'image'" :src="recentPreviewUrls[work.id]" :alt="work.title" loading="lazy" decoding="async" />
              <video v-else-if="recentPreviewUrls[work.id]" :src="recentPreviewUrls[work.id]" muted playsinline preload="metadata" aria-hidden="true" />
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

    <AssetPreviewDialog v-if="selectedRecent && recentDetailUrl" :asset="selectedRecent" :media-url="recentDetailUrl" @close="closeRecent" @recreate="useSameParameters" />
  </div>
</template>
