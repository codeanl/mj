<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { useIntervalFn } from "@vueuse/core"

import AssetPreviewDialog from "@/components/AssetPreviewDialog.vue"
import * as assetApi from "@/services/assets"
import { apiErrorMessage } from "@/services/http"
import { notification } from "@/services/notifications"
import { useAuthStore } from "@/stores/auth"
import CreationComposer from "./home/components/CreationComposer.vue"
import HeroBackdrop from "./home/components/HeroBackdrop.vue"
import RecentWorksSection from "./home/components/RecentWorksSection.vue"

type CreationComposerExpose = {
  useSameParameters: (asset: assetApi.Asset, notify?: boolean) => Promise<void>
}

const authStore = useAuthStore()
const router = useRouter()
const composer = ref<CreationComposerExpose | null>(null)
const recentWorkLimit = 6
const recentLoading = ref(true)
const recentRefreshing = ref(false)
const recentWorks = ref<assetApi.Asset[]>([])
const recentPreviewUrls = ref<Record<string, string>>({})
const recentPreviewSignatures = ref<Record<string, string>>({})
const selectedRecent = ref<assetApi.Asset | null>(null)
const recentDetailUrl = ref("")
let recentDetailObjectUrl = ""
let recentLoadSequence = 0

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

async function loadRecentWorks(options: { silent?: boolean } = {}) {
  const sequence = ++recentLoadSequence
  if (options.silent) recentRefreshing.value = true
  else recentLoading.value = true
  try {
    const page = await assetApi.listAssets({ page: 1, pageSize: recentWorkLimit, source: "generated" })
    if (sequence !== recentLoadSequence) return
    const nextWorks = page.items.slice(0, recentWorkLimit)
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
    const thumbnailURL = work.type === "image" ? `${work.url}${work.url.includes("?") ? "&" : "?"}thumbnail=1` : work.posterUrl || work.url
    try {
      const blob = await assetApi.getAssetContent(thumbnailURL)
      return { id: work.id, url: URL.createObjectURL(blob), signature, created: true }
    } catch {
      if (work.type === "image") {
        try {
          const original = await assetApi.getAssetContent(work.url)
          return { id: work.id, url: URL.createObjectURL(original), signature, created: true }
        } catch {
          // Leave this card in its fallback state.
        }
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

function handleCreated(pendingAssets: assetApi.Asset[]) {
  const pendingIDs = new Set(pendingAssets.map((asset) => asset.id))
  recentWorks.value = [...pendingAssets, ...recentWorks.value.filter((work) => !pendingIDs.has(work.id))].slice(0, recentWorkLimit)
  void loadRecentWorks({ silent: true })
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
  if (work.type === "audio") return
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

async function useSameParameters(asset: assetApi.Asset) {
  closeRecent()
  await composer.value?.useSameParameters(asset)
}

onMounted(() => void loadRecentWorks())
onBeforeUnmount(() => {
  pauseRecentRefresh()
  closeRecent()
  revokeRecentPreviewUrls()
})
</script>

<template>
  <div class="home-page">
    <section class="creation-stage">
      <HeroBackdrop />
      <div class="creation-stage__intro">
        <p>Hello，{{ authStore.user?.username || "创作者" }}</p>
        <h1>把 <em>灵感</em>，变成作品</h1>
        <span class="creation-stage__description">从一句话开始，生成图片与视频作品。</span>
        <i class="creation-stage__accent" />
      </div>
      <CreationComposer ref="composer" @created="handleCreated" />
    </section>

    <div class="home-content">
      <div class="content-columns">
        <RecentWorksSection :loading="recentLoading" :works="recentWorks" :preview-urls="recentPreviewUrls" :limit="recentWorkLimit" @open="openRecent" @view-all="router.push('/assets')" />
      </div>
    </div>

    <AssetPreviewDialog v-if="selectedRecent && recentDetailUrl" :asset="selectedRecent" :media-url="recentDetailUrl" @close="closeRecent" @recreate="useSameParameters" />
  </div>
</template>

<style src="./home/home.css"></style>
