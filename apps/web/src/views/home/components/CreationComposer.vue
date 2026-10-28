<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useDebounceFn } from "@vueuse/core"
import { ArrowRight, ChevronDown, Image, LoaderCircle, Music, Paperclip, Plus, RefreshCcw, Sparkles, Type, Video, X } from "@lucide/vue"

import ReferencePickerDialog from "./ReferencePickerDialog.vue"
import * as assetApi from "@/services/assets"
import { createImageGeneration, createVideoGeneration, type GenerationCapabilities, type VideoGenerationMode, type VideoReferenceRole } from "@/services/generation"
import { apiErrorMessage } from "@/services/http"
import { listImageModels, listVideoModels, type PublicModel } from "@/services/models"
import { notification } from "@/services/notifications"
import { useAuthStore } from "@/stores/auth"

const emit = defineEmits<{ created: [assets: assetApi.Asset[]] }>()
const authStore = useAuthStore()
const sameParametersStorageKey = "nova.same-generation-parameters"
const creationDraftStorageKey = computed(() => `nova.creation-draft:${authStore.user?.id || "anonymous"}`)

const creationTypes = [
  { id: "image", label: "图片生成", icon: Image },
  { id: "video", label: "视频生成", icon: Video },
] as const

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
  video: {
    enabled: false,
    models: [],
    sizes: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].map((value) => ({ value, label: value === "adaptive" ? "自适应" : value, width: 0, height: 0 })),
    qualities: ["480P", "768P", "1080P", "2K", "4K"].map((value) => ({ value, label: value })),
    durations: Array.from({ length: 27 }, (_, index) => ({ value: String(index + 4), label: `${index + 4}秒` })),
  },
}

type ReferenceKind = "image" | "video" | "audio"
type ReferenceDraft = { key: string; file?: File; name: string; previewUrl: string; previewIsImage: boolean; assetId: string; kind: ReferenceKind; role: VideoReferenceRole | "" }
type CreationDraft = {
  prompt: string
  activeType: "image" | "video"
  model: string
  size: string
  quality: string
  count: number
  duration: number
  videoMode: VideoGenerationMode
  soundEnabled: boolean
  watermarkEnabled: boolean
}

const activeType = ref<"image" | "video">("image")
const prompt = ref("")
const capabilities = ref<GenerationCapabilities>(defaultCapabilities)
const videoCatalog = ref<PublicModel[]>([])
const selectedModel = ref("")
const selectedSize = ref("16:9")
const selectedQuality = ref("2K")
const selectedCount = ref(1)
const selectedDuration = ref(5)
const videoMode = ref<VideoGenerationMode>("text")
const soundEnabled = ref(true)
const watermarkEnabled = ref(false)
const referenceInput = ref<HTMLInputElement | null>(null)
const referenceTrigger = ref<HTMLButtonElement | null>(null)
const references = ref<ReferenceDraft[]>([])
const referencePickerOpen = ref(false)
const referencePickerLoading = ref(false)
const referencePickerLoadingMore = ref(false)
const referencePickerAssets = ref<assetApi.Asset[]>([])
const referencePickerUrls = ref<Record<string, string>>({})
const referencePickerSearch = ref("")
const referencePickerPage = ref(0)
const referencePickerTotal = ref(0)
const referencePickerLoadedCount = ref(0)
const creating = ref(false)
const draftRestored = ref(false)
const pendingRequestId = ref("")
const pendingRequestSignature = ref("")
const imageModelsLoading = ref(true)
const videoModelsLoading = ref(true)
const imageModelsFailed = ref(false)
const videoModelsFailed = ref(false)
let referencePickerLoadSequence = 0

const currentCapability = computed(() => capabilities.value[activeType.value])
const modelsLoading = computed(() => activeType.value === "video" ? videoModelsLoading.value : imageModelsLoading.value)
const currentModelsFailed = computed(() => activeType.value === "video" ? videoModelsFailed.value : imageModelsFailed.value)
const selectedVideoProfile = computed(() => videoCatalog.value.find((model) => model.id === selectedModel.value)?.capabilityConfig)
const videoModes: Array<{ value: VideoGenerationMode; label: string }> = [
  { value: "text", label: "文生视频" },
  { value: "frames", label: "首尾帧" },
  { value: "reference", label: "全能参考" },
  { value: "extend", label: "视频延长" },
  { value: "lip_sync", label: "对口型" },
  { value: "edit", label: "视频编辑" },
  { value: "motion_transfer", label: "动作迁移" },
]
const availableVideoModes = computed(() => {
  const allowed = selectedVideoProfile.value?.modes
  return !allowed?.length ? videoModes.slice(0, 3) : videoModes.filter((mode) => allowed.includes(mode.value))
})
const referenceLimit = computed(() => activeType.value === "image" ? 3 : videoMode.value === "frames" ? 2 : videoMode.value === "reference" ? 12 : videoMode.value === "text" ? 0 : 12)
const referencePickerType = computed<assetApi.AssetType | undefined>(() => {
  if (activeType.value === "image" || videoMode.value === "frames") return "image"
  if (videoMode.value === "extend" || videoMode.value === "edit") return "video"
  return undefined
})
const referencePickerHasMore = computed(() => referencePickerLoadedCount.value < referencePickerTotal.value)
const referenceAccept = computed(() => activeType.value === "image" || videoMode.value === "frames"
  ? "image/jpeg,image/png,image/webp"
  : "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/flac")
const referenceHint = computed(() => {
  if (activeType.value === "image") return "最多 3 张图片"
  if (videoMode.value === "frames") return "首帧与尾帧"
  if (videoMode.value === "reference") return "图片、视频或音频"
  if (videoMode.value === "extend") return "选择需要延长的视频"
  if (videoMode.value === "lip_sync") return "选择视频和音频"
  if (videoMode.value === "edit") return "选择需要编辑的视频"
  if (videoMode.value === "motion_transfer") return "选择人物图片和动作视频"
  return "无需上传素材"
})
const promptPlaceholder = computed(() => activeType.value === "image" ? "描述你希望生成的画面、风格与构图…" : "描述视频内容、镜头运动与节奏…")

watch(selectedVideoProfile, (profile) => {
  if (!profile || activeType.value !== "video") return
  const ratios = profile.ratios || []
  const qualities = profile.qualities || []
  capabilities.value.video.sizes = ratios.map((value) => ({ value, label: value === "adaptive" ? "自适应" : value, width: 0, height: 0 }))
  capabilities.value.video.qualities = qualities.map((value) => ({ value, label: value }))
  const min = profile.minDuration || 4
  const max = profile.maxDuration || 30
  capabilities.value.video.durations = Array.from({ length: max - min + 1 }, (_, index) => ({ value: String(min + index), label: `${min + index}秒` }))
  if (!ratios.includes(selectedSize.value)) selectedSize.value = ratios[0] || ""
  if (!qualities.includes(selectedQuality.value)) selectedQuality.value = qualities[0] || ""
  if (selectedDuration.value < min || selectedDuration.value > max) selectedDuration.value = min
  if (!availableVideoModes.value.some((mode) => mode.value === videoMode.value)) selectVideoMode(availableVideoModes.value[0]?.value || "text")
  if (!profile.supportsSound) soundEnabled.value = false
  if (!profile.supportsWatermark) watermarkEnabled.value = false
}, { immediate: true })

const saveCreationDraft = useDebounceFn(persistCreationDraft, 250)
watch([prompt, activeType, selectedModel, selectedSize, selectedQuality, selectedCount, selectedDuration, videoMode, soundEnabled, watermarkEnabled], () => {
  if (draftRestored.value) void saveCreationDraft()
})

function selectCreationType(id: "image" | "video") {
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
  if (activeType.value === "video" && videoMode.value === "frames") {
    const firstFrame = references.value.find((reference) => reference.role === "first_frame")
    const lastFrame = references.value.find((reference) => reference.role === "last_frame")
    if (!firstFrame || !lastFrame || firstFrame.key === lastFrame.key) {
      notification.info("请分别添加不同的首帧和尾帧")
      return
    }
  } else if (activeType.value === "video" && videoMode.value !== "text" && references.value.length === 0) {
    notification.info("请添加参考素材")
    return
  }
  if (activeType.value === "video" && videoMode.value === "reference" && references.value.every((reference) => reference.kind === "audio")) {
    notification.info("参考音频需要同时添加至少一张图片或一个视频")
    return
  }
  if (activeType.value === "video" && videoMode.value === "lip_sync" && (!references.value.some((item) => item.kind === "video") || !references.value.some((item) => item.kind === "audio"))) {
    notification.info("对口型需要同时选择视频和音频")
    return
  }
  if (activeType.value === "video" && ["extend", "edit"].includes(videoMode.value) && !references.value.some((item) => item.kind === "video")) {
    notification.info("请选择一个视频素材")
    return
  }
  if (activeType.value === "video" && videoMode.value === "motion_transfer" && (!references.value.some((item) => item.kind === "video") || !references.value.some((item) => item.kind === "image"))) {
    notification.info("动作迁移需要人物图片和动作视频")
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
      if (!reference.file) throw new Error("参考素材文件不存在")
      const uploaded = await assetApi.uploadAsset(reference.file, "创作参考素材")
      reference.assetId = uploaded.id
    }))
    const referenceAssetIds = references.value.map((reference) => reference.assetId)
    const videoReferences = references.value.map((reference) => ({ assetId: reference.assetId, role: reference.role as VideoReferenceRole }))
    const requestSignature = JSON.stringify({ type: activeType.value, prompt: submittedPrompt, model: selectedModel.value, size: selectedSize.value, quality: selectedQuality.value, count: selectedCount.value, duration: selectedDuration.value, sound: soundEnabled.value, watermark: watermarkEnabled.value, mode: videoMode.value, references: activeType.value === "video" ? videoReferences : referenceAssetIds })
    if (!pendingRequestId.value || pendingRequestSignature.value !== requestSignature) {
      pendingRequestId.value = crypto.randomUUID()
      pendingRequestSignature.value = requestSignature
    }
    const requestId = pendingRequestId.value
    const batch = activeType.value === "video"
      ? await createVideoGeneration({ requestId, prompt: submittedPrompt, model: selectedModel.value, size: selectedSize.value, quality: selectedQuality.value, durationSeconds: selectedDuration.value, soundEnabled: soundEnabled.value, watermarkEnabled: watermarkEnabled.value, mode: videoMode.value, ...(videoReferences.length ? { references: videoReferences } : {}) })
      : await createImageGeneration({ requestId, prompt: submittedPrompt, model: selectedModel.value, size: selectedSize.value, quality: selectedQuality.value, count: selectedCount.value, ...(referenceAssetIds.length ? { referenceAssetIds } : {}) })
    const pendingAssets: assetApi.Asset[] = batch.tasks.map((task) => ({
      id: task.assetId,
      type: activeType.value,
      source: "generated",
      status: "generating",
      title: submittedPrompt.slice(0, 80) || (videoMode.value === "frames" ? "首尾帧视频" : "全能参考视频"),
      url: "",
      downloadUrl: "",
      sizeBytes: 0,
      width: task.width,
      height: task.height,
      createdAt: task.createdAt,
    }))
    authStore.setPointsBalance(batch.pointsRemaining)
    pendingRequestId.value = ""
    pendingRequestSignature.value = ""
    emit("created", pendingAssets)
    notification.success(activeType.value === "video" ? "视频生成任务已创建" : `${batch.tasks.length} 张图片生成任务已创建`)
  } catch (error) {
    notification.error(apiErrorMessage(error, activeType.value === "video" ? "视频生成任务创建失败" : "图片生成任务创建失败"))
  } finally {
    creating.value = false
  }
}

function openReferencePicker() {
  if (referenceLimit.value <= 0) return
  referencePickerOpen.value = true
  referencePickerSearch.value = ""
  void loadReferencePickerAssets()
}

const searchReferencePicker = useDebounceFn(() => {
  if (referencePickerOpen.value) void loadReferencePickerAssets()
}, 300)

function chooseReference() {
  closeReferencePicker()
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
    references.value.push({ key, file, name: file.name, previewUrl: URL.createObjectURL(file), previewIsImage: kind === "image", assetId: "", kind, role: roleForReference(kind) })
  }
  if (rejected) notification.warning(activeType.value === "image" ? "最多添加 3 张 JPG、PNG 或 WebP 参考图" : videoMode.value === "frames" ? "首尾帧只能添加最多 2 张图片" : "全能参考最多 9 张图片、3 个视频、3 个音频，总计 12 个")
}

function clearReferencePreviews() {
  references.value.forEach((reference) => reference.previewUrl && URL.revokeObjectURL(reference.previewUrl))
  references.value = []
}

function removeReference(key: string) {
  const reference = references.value.find((item) => item.key === key)
  if (reference?.previewUrl) URL.revokeObjectURL(reference.previewUrl)
  references.value = references.value.filter((item) => item.key !== key)
}

function roleForReference(kind: ReferenceKind): VideoReferenceRole | "" {
  if (activeType.value === "image") return ""
  if (videoMode.value === "frames") return references.value.some((reference) => reference.role === "first_frame") ? "last_frame" : "first_frame"
  return kind === "image" ? "reference_image" : kind === "video" ? "reference_video" : "reference_audio"
}

function referenceKindAllowed(kind: ReferenceKind) {
  if ((activeType.value === "image" || videoMode.value === "frames") && kind !== "image") return false
  if (["extend", "edit"].includes(videoMode.value) && kind !== "video") return false
  if (videoMode.value === "lip_sync" && kind === "image") return false
  if (videoMode.value === "motion_transfer" && kind === "audio") return false
  const maximum = { image: videoMode.value === "reference" ? 9 : referenceLimit.value, video: 3, audio: 3 }[kind]
  return references.value.filter((reference) => reference.kind === kind).length < maximum && references.value.length < referenceLimit.value
}

async function loadReferencePickerAssets(options: { append?: boolean } = {}) {
  if (options.append && (referencePickerLoading.value || referencePickerLoadingMore.value || !referencePickerHasMore.value)) return
  const sequence = ++referencePickerLoadSequence
  const targetPage = options.append ? referencePickerPage.value + 1 : 1
  if (options.append) referencePickerLoadingMore.value = true
  else {
    referencePickerLoading.value = true
    referencePickerPage.value = 0
    referencePickerTotal.value = 0
    referencePickerLoadedCount.value = 0
    referencePickerAssets.value = []
    revokeReferencePickerUrls()
  }
  try {
    const page = await assetApi.listAssets({ page: targetPage, pageSize: 12, type: referencePickerType.value, status: "ready", search: referencePickerSearch.value.trim() || undefined })
    if (sequence !== referencePickerLoadSequence || !referencePickerOpen.value) return
    const nextAssets = page.items.filter((asset) => !references.value.some((reference) => reference.assetId === asset.id) && referenceKindAllowed(asset.type))
    const entries = await Promise.all(nextAssets.map(async (asset) => {
      if (asset.type === "audio") return [asset.id, ""] as const
      const source = asset.type === "image" ? `${asset.url}${asset.url.includes("?") ? "&" : "?"}thumbnail=1` : asset.posterUrl
      if (!source) return [asset.id, ""] as const
      try {
        const blob = await assetApi.getAssetContent(source)
        return [asset.id, URL.createObjectURL(blob)] as const
      } catch {
        return [asset.id, ""] as const
      }
    }))
    if (sequence !== referencePickerLoadSequence || !referencePickerOpen.value) {
      entries.forEach(([, url]) => url && URL.revokeObjectURL(url))
      return
    }
    const existingIDs = new Set(referencePickerAssets.value.map((asset) => asset.id))
    referencePickerAssets.value = options.append ? [...referencePickerAssets.value, ...nextAssets.filter((asset) => !existingIDs.has(asset.id))] : nextAssets
    referencePickerUrls.value = options.append ? { ...referencePickerUrls.value, ...Object.fromEntries(entries) } : Object.fromEntries(entries)
    referencePickerPage.value = targetPage
    referencePickerTotal.value = page.total
    referencePickerLoadedCount.value = options.append ? referencePickerLoadedCount.value + page.items.length : page.items.length
  } catch (error) {
    if (sequence === referencePickerLoadSequence && referencePickerOpen.value) notification.error(apiErrorMessage(error, "素材库加载失败"))
  } finally {
    if (sequence === referencePickerLoadSequence) {
      referencePickerLoading.value = false
      referencePickerLoadingMore.value = false
    }
  }
}

function selectExistingReference(asset: assetApi.Asset) {
  if (!referenceKindAllowed(asset.type)) return
  const previewUrl = referencePickerUrls.value[asset.id] || ""
  delete referencePickerUrls.value[asset.id]
  references.value.push({ key: `asset:${asset.id}`, name: asset.title, previewUrl, previewIsImage: asset.type !== "audio", assetId: asset.id, kind: asset.type, role: roleForReference(asset.type) })
  referencePickerAssets.value = referencePickerAssets.value.filter((item) => item.id !== asset.id && referenceKindAllowed(item.type))
  if (references.value.length >= referenceLimit.value) closeReferencePicker()
}

function revokeReferencePickerUrls() {
  Object.values(referencePickerUrls.value).forEach((url) => url && URL.revokeObjectURL(url))
  referencePickerUrls.value = {}
}

function closeReferencePicker() {
  const restoreFocus = referencePickerOpen.value
  referencePickerLoadSequence++
  referencePickerOpen.value = false
  referencePickerLoading.value = false
  referencePickerLoadingMore.value = false
  revokeReferencePickerUrls()
  if (restoreFocus) void nextTick(() => referenceTrigger.value?.focus())
}

function applyCapabilityDefaults() {
  const capability = currentCapability.value
  selectedModel.value = capability?.models[0]?.value || ""
  selectedSize.value = capability?.sizes[0]?.value || ""
  selectedQuality.value = capability?.qualities[0]?.value || ""
  selectedDuration.value = Number(capability?.durations?.[0]?.value || 5)
}

function persistCreationDraft() {
  if (!draftRestored.value) return
  const draft: CreationDraft = {
    prompt: prompt.value,
    activeType: activeType.value,
    model: selectedModel.value,
    size: selectedSize.value,
    quality: selectedQuality.value,
    count: selectedCount.value,
    duration: selectedDuration.value,
    videoMode: videoMode.value,
    soundEnabled: soundEnabled.value,
    watermarkEnabled: watermarkEnabled.value,
  }
  localStorage.setItem(creationDraftStorageKey.value, JSON.stringify(draft))
}

async function restoreCreationDraft() {
  const raw = localStorage.getItem(creationDraftStorageKey.value)
  if (!raw) return
  try {
    const draft = JSON.parse(raw) as Partial<CreationDraft>
    activeType.value = draft.activeType === "video" ? "video" : "image"
    const capability = capabilities.value[activeType.value]
    selectedModel.value = capability.models.some((option) => option.value === draft.model) ? draft.model || "" : capability.models[0]?.value || ""
    await nextTick()
    selectedSize.value = capability.sizes.some((option) => option.value === draft.size) ? draft.size || "" : capability.sizes[0]?.value || ""
    selectedQuality.value = capability.qualities.some((option) => option.value === draft.quality) ? draft.quality || "" : capability.qualities[0]?.value || ""
    selectedCount.value = Number.isInteger(draft.count) && Number(draft.count) >= 1 && Number(draft.count) <= 4 ? Number(draft.count) : 1
    const durations = capability.durations || []
    selectedDuration.value = durations.some((option) => Number(option.value) === Number(draft.duration)) ? Number(draft.duration) : Number(durations[0]?.value || 5)
    videoMode.value = availableVideoModes.value.some((mode) => mode.value === draft.videoMode) ? draft.videoMode || "text" : availableVideoModes.value[0]?.value || "text"
    prompt.value = typeof draft.prompt === "string" ? draft.prompt : ""
    soundEnabled.value = draft.soundEnabled !== false && selectedVideoProfile.value?.supportsSound !== false
    watermarkEnabled.value = draft.watermarkEnabled === true && selectedVideoProfile.value?.supportsWatermark !== false
  } catch {
    localStorage.removeItem(creationDraftStorageKey.value)
  }
}

async function loadImageModels() {
  imageModelsLoading.value = true
  imageModelsFailed.value = false
  try {
    const images = await listImageModels()
    capabilities.value.image.models = images.map((model) => ({ value: model.id, label: model.displayName }))
    if (activeType.value === "image" && !images.some((model) => model.id === selectedModel.value)) selectedModel.value = images[0]?.id || ""
  } catch (error) {
    capabilities.value.image.models = []
    imageModelsFailed.value = true
    if (activeType.value === "image") selectedModel.value = ""
    notification.error(`图片模型加载失败：${apiErrorMessage(error, "请稍后重试")}`)
  } finally {
    imageModelsLoading.value = false
  }
}

async function loadVideoModels() {
  videoModelsLoading.value = true
  videoModelsFailed.value = false
  try {
    const videos = await listVideoModels()
    videoCatalog.value = videos
    capabilities.value.video.models = videos.map((model) => ({ value: model.id, label: model.displayName }))
    capabilities.value.video.enabled = videos.length > 0
    if (activeType.value === "video" && !videos.some((model) => model.id === selectedModel.value)) selectedModel.value = videos[0]?.id || ""
  } catch (error) {
    videoCatalog.value = []
    capabilities.value.video.models = []
    capabilities.value.video.enabled = false
    videoModelsFailed.value = true
    if (activeType.value === "video") selectedModel.value = ""
    notification.error(`视频模型加载失败：${apiErrorMessage(error, "请稍后重试")}`)
  } finally {
    videoModelsLoading.value = false
  }
}

function retryCurrentModels() {
  if (activeType.value === "video") void loadVideoModels()
  else void loadImageModels()
}

async function useSameParameters(asset: assetApi.Asset, notify = true) {
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
    videoMode.value = availableVideoModes.value.some((mode) => mode.value === task.videoMode) ? task.videoMode as VideoGenerationMode : "text"
  }
  references.value = await Promise.all((task.references || []).map(async (reference) => {
    let previewUrl = ""
    if (reference.type === "image") {
      try {
        const separator = reference.url.includes("?") ? "&" : "?"
        previewUrl = URL.createObjectURL(await assetApi.getAssetContent(`${reference.url}${separator}thumbnail=1`))
      } catch {
        // Keep the icon fallback when a thumbnail is temporarily unavailable.
      }
    }
    return { key: `asset:${reference.assetId}`, name: reference.title, previewUrl, previewIsImage: reference.type === "image", assetId: reference.assetId, kind: reference.type, role: (asset.type === "image" ? "" : reference.role) as VideoReferenceRole | "" }
  }))
  document.querySelector<HTMLElement>(".page-scroll")?.scrollTo({ top: 0, behavior: "smooth" })
  if (notify) notification.success("同款参数已回填，可继续修改后生成")
}

async function restoreSameParameters() {
  const raw = sessionStorage.getItem(sameParametersStorageKey)
  if (!raw) return
  sessionStorage.removeItem(sameParametersStorageKey)
  try {
    await useSameParameters(JSON.parse(raw) as assetApi.Asset)
  } catch {
    notification.warning("同款参数恢复失败")
  }
}

onMounted(async () => {
  await Promise.allSettled([loadImageModels(), loadVideoModels()])
  await restoreCreationDraft()
  draftRestored.value = true
  await restoreSameParameters()
})

onBeforeUnmount(() => {
  persistCreationDraft()
  closeReferencePicker()
  clearReferencePreviews()
})

defineExpose({ useSameParameters })
</script>

<template>
  <div class="composer" aria-label="AI 创作输入区">
    <div class="composer__tabs" role="tablist" aria-label="创作类型">
      <button v-for="type in creationTypes" :key="type.id" type="button" role="tab" :aria-selected="activeType === type.id" :class="{ 'composer__tab--active': activeType === type.id }" @click="selectCreationType(type.id)">
        <component :is="type.icon" :size="17" /><span>{{ type.label }}</span>
      </button>
    </div>

    <div class="composer__body" :class="{ 'composer__body--reference': activeType === 'video' && videoMode === 'reference' }">
      <div class="reference-slot" :class="{ 'reference-slot--selected': references.length }">
        <input ref="referenceInput" class="reference-slot__input" type="file" :accept="referenceAccept" multiple @change="selectReference" />
        <div v-if="activeType === 'video' && videoMode === 'text'" class="reference-slot__pick reference-slot__pick--static"><Type :size="21" /><strong>文生视频</strong><span>{{ referenceHint }}</span></div>
        <button v-else-if="!references.length" ref="referenceTrigger" class="reference-slot__pick" type="button" aria-label="添加参考素材" @click="openReferencePicker"><Paperclip :size="21" /><strong>添加参考</strong><span>{{ referenceHint }}</span></button>
        <div v-else class="reference-slot__grid">
          <div v-for="reference in references" :key="reference.key" class="reference-slot__thumb">
            <img v-if="reference.previewIsImage && reference.previewUrl" :src="reference.previewUrl" :alt="reference.name" />
            <video v-else-if="reference.kind === 'video' && reference.previewUrl" :src="reference.previewUrl" muted preload="metadata" aria-hidden="true" />
            <span v-else class="reference-slot__audio"><Music v-if="reference.kind === 'audio'" :size="17" /><Video v-else-if="reference.kind === 'video'" :size="17" /><Image v-else :size="17" /><small>{{ reference.name }}</small></span>
            <em v-if="videoMode === 'frames'" class="reference-slot__role">{{ reference.role === 'first_frame' ? '首帧' : '尾帧' }}</em>
            <button type="button" aria-label="移除参考素材" title="移除参考素材" @click="removeReference(reference.key)"><X :size="12" /></button>
          </div>
          <button v-if="references.length < referenceLimit" ref="referenceTrigger" class="reference-slot__add" type="button" aria-label="继续添加参考素材" @click="openReferencePicker"><Plus :size="18" /><span>{{ references.length }}/{{ referenceLimit }}</span></button>
        </div>
      </div>
      <div class="composer__input-wrap">
        <textarea v-model="prompt" :placeholder="promptPlaceholder" rows="3" maxlength="1000" />
        <div class="composer__options">
          <div class="composer__selects">
            <label class="compact-select"><select v-model="selectedModel" aria-label="模型" :disabled="modelsLoading || !currentCapability?.models.length"><option v-if="modelsLoading" value="">加载模型</option><option v-else-if="currentModelsFailed" value="">加载失败</option><option v-else-if="!currentCapability?.models.length" value="">暂无模型</option><option v-for="option in currentCapability?.models || []" :key="option.value" :value="option.value">{{ option.label }}</option></select><ChevronDown :size="14" /></label>
            <button v-if="currentModelsFailed" class="model-retry" type="button" :disabled="modelsLoading" title="重新加载模型" aria-label="重新加载模型" @click="retryCurrentModels"><RefreshCcw :class="{ spin: modelsLoading }" :size="14" /></button>
            <label v-if="activeType === 'video'" class="compact-select compact-select--mode"><select :value="videoMode" aria-label="视频生成模式" @change="changeVideoMode"><option v-for="mode in availableVideoModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option></select><ChevronDown :size="14" /></label>
            <label class="compact-select compact-select--small"><select v-model="selectedSize" aria-label="画面比例" :disabled="!currentCapability?.enabled"><option v-for="option in currentCapability?.sizes || []" :key="option.value" :value="option.value">{{ option.label }}</option></select><ChevronDown :size="14" /></label>
            <label class="compact-select compact-select--small"><select v-model="selectedQuality" aria-label="分辨率" :disabled="!currentCapability?.enabled"><option v-for="option in currentCapability?.qualities || []" :key="option.value" :value="option.value">{{ option.label }}</option></select><ChevronDown :size="14" /></label>
            <label v-if="activeType === 'image'" class="compact-select compact-select--count"><select v-model.number="selectedCount" aria-label="生成张数" :disabled="!currentCapability?.enabled"><option v-for="count in 4" :key="count" :value="count">{{ count }}张</option></select><ChevronDown :size="14" /></label>
            <label v-else class="compact-select compact-select--count"><select v-model.number="selectedDuration" aria-label="视频时长" :disabled="!currentCapability?.enabled"><option v-for="option in currentCapability?.durations || []" :key="option.value" :value="Number(option.value)">{{ option.label }}</option></select><ChevronDown :size="14" /></label>
            <label v-if="activeType === 'video'" class="compact-toggle" :class="{ 'is-disabled': selectedVideoProfile?.supportsSound === false }"><input v-model="soundEnabled" type="checkbox" :disabled="selectedVideoProfile?.supportsSound === false" /><span>{{ soundEnabled ? "有声音" : "无声音" }}</span></label>
            <label v-if="activeType === 'video'" class="compact-toggle" :class="{ 'is-disabled': selectedVideoProfile?.supportsWatermark === false }"><input v-model="watermarkEnabled" type="checkbox" :disabled="selectedVideoProfile?.supportsWatermark === false" /><span>{{ watermarkEnabled ? "有水印" : "无水印" }}</span></label>
          </div>
          <button class="create-button" type="button" aria-label="开始生成" :disabled="creating || modelsLoading || !selectedModel" @click="startCreation"><LoaderCircle v-if="creating" class="spin" :size="18" /><Sparkles v-else :size="18" /><span>{{ creating ? "提交中" : "开始生成" }}</span><ArrowRight :size="17" /></button>
        </div>
      </div>
    </div>
  </div>

  <ReferencePickerDialog
    v-if="referencePickerOpen"
    :hint="referenceHint"
    :selected-count="references.length"
    :limit="referenceLimit"
    :loading="referencePickerLoading"
    :loading-more="referencePickerLoadingMore"
    :assets="referencePickerAssets"
    :preview-urls="referencePickerUrls"
    :search="referencePickerSearch"
    :has-more="referencePickerHasMore"
    @close="closeReferencePicker"
    @upload="chooseReference"
    @select="selectExistingReference"
    @load-more="loadReferencePickerAssets({ append: true })"
    @search="searchReferencePicker()"
    @update:search="referencePickerSearch = $event"
  />
</template>
