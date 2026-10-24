<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useDebounceFn, useIntervalFn } from "@vueuse/core"
import { ElMessage } from "element-plus"
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  Image,
  Images,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Upload,
  Video,
  X,
} from "@lucide/vue"

import * as assetApi from "@/services/assets"
import { apiErrorMessage } from "@/services/http"

type AssetFilter = "all" | assetApi.AssetType

const filters: Array<{ value: AssetFilter; label: string; icon: typeof Images }> = [
  { value: "all", label: "全部", icon: Images },
  { value: "image", label: "图片", icon: Image },
  { value: "video", label: "视频", icon: Video },
]

const assets = ref<assetApi.Asset[]>([])
const total = ref(0)
const activeFilter = ref<AssetFilter>("all")
const searchKeyword = ref("")
const currentPage = ref(1)
const pageSize = ref(8)
const loading = ref(false)
const refreshing = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const previewUrls = ref<Record<string, string>>({})
const previewSignatures = ref<Record<string, string>>({})
const selectedAsset = ref<assetApi.Asset | null>(null)
let loadSequence = 0

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const hasGeneratingAssets = computed(() => assets.value.some((asset) => asset.status === "generating"))
const refreshInterval = Number(import.meta.env.VITE_GENERATION_REFRESH_INTERVAL_MS || 3000)

const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(
  () => {
    if (!loading.value && !refreshing.value && hasGeneratingAssets.value) void loadAssets({ silent: true })
  },
  Number.isFinite(refreshInterval) && refreshInterval > 0 ? refreshInterval : 3000,
  { immediate: false },
)

watch([activeFilter, currentPage, pageSize], () => void loadAssets(), { immediate: true })

const searchAssets = useDebounceFn(() => {
  if (currentPage.value !== 1) currentPage.value = 1
  else void loadAssets()
}, 300)

watch(searchKeyword, () => searchAssets())
watch(hasGeneratingAssets, (hasGenerating) => (hasGenerating ? resumeRefresh() : pauseRefresh()), { immediate: true })
onBeforeUnmount(() => {
  pauseRefresh()
  revokePreviewUrls()
})

async function loadAssets(options: { silent?: boolean } = {}) {
  const sequence = ++loadSequence
  if (options.silent) refreshing.value = true
  else loading.value = true
  try {
    const result = await assetApi.listAssets({
      page: currentPage.value,
      pageSize: pageSize.value,
      type: activeFilter.value === "all" ? undefined : activeFilter.value,
      search: searchKeyword.value.trim() || undefined,
    })
    if (sequence !== loadSequence) return
    assets.value = result.items
    total.value = result.total
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
      return
    }
    await loadPreviewUrls(result.items, sequence)
  } catch (error) {
    if (sequence === loadSequence) ElMessage.error(apiErrorMessage(error, "素材加载失败"))
  } finally {
    if (sequence === loadSequence) {
      loading.value = false
      refreshing.value = false
    }
  }
}

async function loadPreviewUrls(items: assetApi.Asset[], sequence: number) {
  const existingUrls = previewUrls.value
  const existingSignatures = previewSignatures.value
  const entries = await Promise.all(
    items.map(async (asset) => {
      try {
        const signature = `${asset.status}:${asset.url}:${asset.sizeBytes}`
        if (asset.status !== "ready" || !asset.url) return { id: asset.id, url: "", signature, created: false }
        if (existingUrls[asset.id] && existingSignatures[asset.id] === signature) {
          return { id: asset.id, url: existingUrls[asset.id], signature, created: false }
        }
        const blob = await assetApi.getAssetContent(asset.url)
        return { id: asset.id, url: URL.createObjectURL(blob), signature, created: true }
      } catch {
        return { id: asset.id, url: "", signature: "", created: false }
      }
    }),
  )
  if (sequence !== loadSequence) {
    entries.forEach((entry) => entry.created && entry.url && URL.revokeObjectURL(entry.url))
    return
  }
  const nextUrls = Object.fromEntries(entries.map((entry) => [entry.id, entry.url]))
  const nextSignatures = Object.fromEntries(entries.map((entry) => [entry.id, entry.signature]))
  Object.entries(existingUrls).forEach(([id, url]) => {
    if (url && nextUrls[id] !== url) URL.revokeObjectURL(url)
  })
  previewUrls.value = nextUrls
  previewSignatures.value = nextSignatures
}

function revokePreviewUrls() {
  Object.values(previewUrls.value).forEach((url) => url && URL.revokeObjectURL(url))
  previewUrls.value = {}
  previewSignatures.value = {}
}

function selectFilter(filter: AssetFilter) {
  if (activeFilter.value === filter) return
  activeFilter.value = filter
  currentPage.value = 1
}

function chooseAsset() {
  if (!uploading.value) fileInput.value?.click()
}

async function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    await assetApi.uploadAsset(file)
    ElMessage.success("素材上传成功")
    activeFilter.value = "all"
    searchKeyword.value = ""
    if (currentPage.value !== 1) currentPage.value = 1
    else await loadAssets()
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "素材上传失败"))
  } finally {
    uploading.value = false
    input.value = ""
  }
}

function openAsset(asset: assetApi.Asset) {
  if (asset.status !== "ready") return
  if (!previewUrls.value[asset.id]) {
    ElMessage.warning("素材预览暂不可用")
    return
  }
  selectedAsset.value = asset
}

async function downloadAsset(asset: assetApi.Asset) {
  try {
    const blob = await assetApi.getAssetContent(asset.downloadUrl)
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = asset.title
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, "素材下载失败"))
  }
}

function setPage(page: number) {
  if (page >= 1 && page <= totalPages.value && page !== currentPage.value) currentPage.value = page
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDimensions(asset: assetApi.Asset) {
  return asset.width > 0 && asset.height > 0 ? `${asset.width} × ${asset.height}` : formatBytes(asset.sizeBytes)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function formatDuration(seconds?: number) {
  if (seconds === undefined) return ""
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
}

function sourceLabel(source: assetApi.AssetSource) {
  return source === "generated" ? "AI 生成" : "用户上传"
}

function statusLabel(status: assetApi.AssetStatus) {
  if (status === "generating") return "生成中"
  if (status === "failed") return "生成失败"
  return "已完成"
}
</script>

<template>
  <section class="assets-page">
    <header class="assets-header">
      <div>
        <p>NOVA ASSETS</p>
        <h1>我的素材</h1>
        <span>统一管理创作过程中生成和上传的图片、视频。</span>
      </div>
      <button class="assets-upload" type="button" :disabled="uploading" @click="chooseAsset">
        <LoaderCircle v-if="uploading" class="spin" :size="17" />
        <Plus v-else :size="17" />
        <span>{{ uploading ? "上传中" : "上传素材" }}</span>
      </button>
      <input ref="fileInput" class="asset-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" @change="handleFileSelection" />
    </header>

    <div class="assets-toolbar">
      <label class="asset-search">
        <Search :size="16" />
        <input v-model="searchKeyword" type="search" placeholder="搜索素材名称" />
      </label>

      <div class="asset-filters" role="tablist" aria-label="素材类型">
        <button v-for="filter in filters" :key="filter.value" type="button" role="tab" :aria-selected="activeFilter === filter.value" :class="{ 'asset-filter--active': activeFilter === filter.value }" @click="selectFilter(filter.value)">
          <component :is="filter.icon" :size="15" />
          <span>{{ filter.label }}</span>
        </button>
      </div>
    </div>

    <div v-if="loading" class="assets-grid" aria-label="正在加载素材">
      <article v-for="index in pageSize" :key="index" class="asset-card asset-card--loading"><span /><span /></article>
    </div>

    <div v-else-if="assets.length" class="assets-grid">
      <article v-for="asset in assets" :key="asset.id" class="asset-card" :class="`asset-card--${asset.status}`">
        <button class="asset-card__preview" type="button" :disabled="asset.status !== 'ready'" @click="openAsset(asset)">
          <img v-if="asset.status === 'ready' && previewUrls[asset.id] && asset.type === 'image'" :src="previewUrls[asset.id]" :alt="asset.title" />
          <video v-else-if="asset.status === 'ready' && previewUrls[asset.id]" :src="previewUrls[asset.id]" muted preload="metadata" />
          <span v-else-if="asset.status === 'generating'" class="asset-card__generation-state"><LoaderCircle class="spin" :size="25" /><strong>图片生成中</strong><small>任务完成后自动更新</small></span>
          <span v-else-if="asset.status === 'failed'" class="asset-card__generation-state asset-card__generation-state--failed" :title="asset.errorMessage"><CircleAlert :size="25" /><strong>生成失败</strong><small>{{ asset.errorMessage || "请稍后重试" }}</small></span>
          <span v-else class="asset-card__media-loading"><Image v-if="asset.type === 'image'" :size="24" /><Video v-else :size="24" /></span>
          <span class="asset-card__type"><Image v-if="asset.type === 'image'" :size="13" /><Video v-else :size="13" />{{ asset.type === "image" ? "图片" : "视频" }}</span>
          <span v-if="asset.type === 'video' && asset.status === 'ready'" class="asset-card__play"><Play :size="18" fill="currentColor" /></span>
          <span v-if="formatDuration(asset.durationSeconds)" class="asset-card__duration">{{ formatDuration(asset.durationSeconds) }}</span>
        </button>
        <div class="asset-card__meta">
          <div>
            <strong>{{ asset.title }}</strong>
            <span class="asset-card__details"><em :class="`is-${asset.source}`">{{ sourceLabel(asset.source) }}</em><i :class="`is-${asset.status}`">{{ statusLabel(asset.status) }}</i>{{ formatDimensions(asset) }} · {{ formatDate(asset.createdAt) }}</span>
          </div>
          <button type="button" :aria-label="`下载 ${asset.title}`" :disabled="asset.status !== 'ready'" @click="downloadAsset(asset)"><Download :size="16" /></button>
        </div>
      </article>
    </div>

    <div v-else class="assets-empty">
      <span><Upload :size="23" /></span>
      <strong>没有找到素材</strong>
      <p>调整搜索条件，或上传第一份创作素材。</p>
    </div>

    <footer class="assets-pagination">
      <span>共 {{ total }} 项</span>
      <div class="assets-pagination__controls">
        <button type="button" aria-label="上一页" :disabled="currentPage <= 1" @click="setPage(currentPage - 1)"><ChevronLeft :size="17" /></button>
        <button v-for="page in totalPages" :key="page" type="button" :class="{ 'is-current': currentPage === page }" :aria-label="`第 ${page} 页`" @click="setPage(page)">{{ page }}</button>
        <button type="button" aria-label="下一页" :disabled="currentPage >= totalPages" @click="setPage(currentPage + 1)"><ChevronRight :size="17" /></button>
      </div>
      <label class="assets-page-size">
        <select v-model="pageSize" aria-label="每页数量"><option :value="8">8 条/页</option><option :value="12">12 条/页</option></select>
      </label>
    </footer>

    <div v-if="selectedAsset" class="asset-preview-dialog" role="dialog" aria-modal="true" :aria-label="selectedAsset.title" @click.self="selectedAsset = null">
      <div class="asset-preview-dialog__body">
        <button type="button" aria-label="关闭预览" @click="selectedAsset = null"><X :size="19" /></button>
        <img v-if="selectedAsset.type === 'image'" :src="previewUrls[selectedAsset.id]" :alt="selectedAsset.title" />
        <video v-else :src="previewUrls[selectedAsset.id]" controls />
        <div><strong>{{ selectedAsset.title }}</strong><span>{{ formatBytes(selectedAsset.sizeBytes) }} · {{ formatDate(selectedAsset.createdAt) }}</span></div>
      </div>
    </div>
  </section>
</template>
