<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { Download, Image, LoaderCircle, Music, Video, X } from "@lucide/vue"

import * as assetApi from "@/services/assets"
import { apiErrorMessage } from "@/services/http"
import { notification } from "@/services/notifications"

const props = defineProps<{ asset: assetApi.Asset; mediaUrl: string }>()
const emit = defineEmits<{ close: []; recreate: [asset: assetApi.Asset] }>()
const downloading = ref(false)
const referencePreviewUrls = ref<Record<string, string>>({})

const generation = computed(() => props.asset.generation)
const typeLabel = computed(() => props.asset.type === "image" ? "图片" : props.asset.type === "video" ? "视频" : "音频")
const sourceLabel = computed(() => props.asset.source === "generated" ? "AI 生成" : "用户上传")
const statusLabel = computed(() => ({ ready: "已完成", generating: "生成中", needs_review: "等待确认", failed: "失败" })[props.asset.status])
const videoModeLabel = computed(() => ({ text: "文生视频", frames: "首尾帧", reference: "全能参考" })[generation.value?.videoMode || ""] || generation.value?.videoMode || "")
const canRecreate = computed(() => Boolean(generation.value && (props.asset.type === "image" || props.asset.type === "video")))

watch(() => props.asset.id, () => void loadReferencePreviews(), { immediate: true })
onBeforeUnmount(revokeReferencePreviews)

const detailRows = computed(() => {
  const task = generation.value
  const rows: Array<[string, string]> = [
    ["素材类型", typeLabel.value],
    ["来源", sourceLabel.value],
    ["状态", statusLabel.value],
    ["文件大小", formatBytes(props.asset.sizeBytes)],
    ["文件名称", props.asset.originalName || ""],
    ["文件格式", props.asset.mimeType || ""],
    ["画面尺寸", props.asset.width > 0 && props.asset.height > 0 ? `${props.asset.width} × ${props.asset.height}` : ""],
    ["媒体时长", props.asset.durationSeconds !== undefined ? formatSeconds(props.asset.durationSeconds) : ""],
    ["创建时间", formatDate(props.asset.createdAt)],
  ]
  if (!task) return rows.filter(([, value]) => value)
  rows.splice(3, 0,
    ["模型", task.model],
    ["任务状态", task.status],
    ["执行器", task.provider],
    ["渠道", task.channelName || "-"],
    ["协议", task.protocol || task.provider],
    ["生成模式", videoModeLabel.value],
    ["画面比例", task.ratio],
    ["清晰度", task.quality],
    ["请求时长", task.requestedDurationSeconds ? `${task.requestedDurationSeconds} 秒` : ""],
    ["声音", props.asset.type === "video" ? (task.soundEnabled ? "有声音" : "无声音") : ""],
    ["水印", props.asset.type === "video" ? (task.watermarkEnabled ? "有水印" : "无水印") : ""],
    ["参考素材", `${task.referenceCount} 个`],
    ["消耗积分", formatNumber(task.pointsCost)],
    ["执行耗时", task.executionDurationMs !== undefined ? formatMilliseconds(task.executionDurationMs) : ""],
    ["重试次数", `${task.retryCount} 次`],
    ["开始时间", task.startedAt ? formatDate(task.startedAt) : ""],
    ["完成时间", task.completedAt ? formatDate(task.completedAt) : ""],
    ["任务 ID", task.taskId],
    ["上游任务 ID", task.upstreamTaskId || ""],
    ["素材 ID", props.asset.id],
  )
  return rows.filter(([, value]) => value !== "")
})

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
}

function formatMilliseconds(milliseconds: number) {
  if (milliseconds < 1000) return `${milliseconds} 毫秒`
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1)} 秒`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)
}

function referenceRoleLabel(role: string) {
  return ({ first_frame: "首帧", last_frame: "尾帧", reference_image: "参考图", reference_video: "参考视频", reference_audio: "参考音频" })[role] || role
}

function revokeReferencePreviews() {
  Object.values(referencePreviewUrls.value).forEach((url) => URL.revokeObjectURL(url))
  referencePreviewUrls.value = {}
}

async function loadReferencePreviews() {
  const assetID = props.asset.id
  revokeReferencePreviews()
  const imageReferences = props.asset.generation?.references?.filter((reference) => reference.type === "image") || []
  const entries = await Promise.all(imageReferences.map(async (reference) => {
    try {
      const separator = reference.url.includes("?") ? "&" : "?"
      const blob = await assetApi.getAssetContent(`${reference.url}${separator}thumbnail=1`)
      return [reference.assetId, URL.createObjectURL(blob)] as const
    } catch {
      return [reference.assetId, ""] as const
    }
  }))
  if (props.asset.id !== assetID) {
    entries.forEach(([, url]) => url && URL.revokeObjectURL(url))
    return
  }
  referencePreviewUrls.value = Object.fromEntries(entries)
}

async function downloadAsset() {
  if (downloading.value) return
  downloading.value = true
  try {
    const blob = await assetApi.getAssetContent(props.asset.downloadUrl)
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = props.asset.originalName || props.asset.title
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    notification.error(apiErrorMessage(error, "素材下载失败"))
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="asset-viewer" role="dialog" aria-modal="true" :aria-label="asset.title" @click.self="emit('close')">
    <div class="asset-viewer__panel">
      <div class="asset-viewer__media">
        <img v-if="asset.type === 'image'" :src="mediaUrl" :alt="asset.title" />
        <video v-else-if="asset.type === 'video'" :src="mediaUrl" controls autoplay />
        <div v-else class="asset-viewer__audio"><Music :size="38" /><audio :src="mediaUrl" controls /></div>
      </div>
      <aside class="asset-viewer__details">
        <div class="asset-viewer__scroll">
          <div class="asset-viewer__eyebrow"><Image v-if="asset.type === 'image'" :size="14" /><Video v-else-if="asset.type === 'video'" :size="14" /><Music v-else :size="14" />{{ typeLabel }} · {{ statusLabel }}</div>
          <h2>{{ asset.title }}</h2>
          <p v-if="generation?.prompt" class="asset-viewer__prompt">{{ generation.prompt }}</p>
          <div v-if="generation?.references?.length" class="asset-viewer__references" aria-label="参考素材">
            <div v-for="reference in generation.references" :key="reference.assetId" :title="`${referenceRoleLabel(reference.role)} · ${reference.title}`">
              <img v-if="reference.type === 'image' && referencePreviewUrls[reference.assetId]" :src="referencePreviewUrls[reference.assetId]" :alt="reference.title" />
              <Video v-else-if="reference.type === 'video'" :size="18" />
              <Music v-else-if="reference.type === 'audio'" :size="18" />
              <Image v-else :size="18" />
              <span>{{ referenceRoleLabel(reference.role) }}</span>
            </div>
          </div>
          <dl>
            <template v-for="([label, value], index) in detailRows" :key="`${label}-${index}`">
              <dt>{{ label }}</dt><dd :class="{ 'is-id': label.includes('ID') }">{{ value }}</dd>
            </template>
          </dl>
        </div>
        <footer class="asset-viewer__actions">
          <button v-if="canRecreate" class="asset-viewer__recreate" type="button" @click="emit('recreate', asset)">用同款参数创作</button>
          <button type="button" title="下载素材" aria-label="下载素材" :disabled="downloading" @click="downloadAsset"><LoaderCircle v-if="downloading" class="spin" :size="18" /><Download v-else :size="18" /></button>
          <button type="button" title="关闭预览" aria-label="关闭预览" @click="emit('close')"><X :size="18" /></button>
        </footer>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.asset-viewer { position: fixed; z-index: 80; inset: 0; display: flex; align-items: center; justify-content: center; padding: 28px; background: rgb(9 12 16 / 76%); backdrop-filter: blur(10px); }
.asset-viewer__panel { position: relative; display: grid; width: min(1180px, 100%); height: clamp(460px, calc(100dvh - 80px), 760px); grid-template-columns: minmax(0, 1fr) 340px; overflow: hidden; border: 1px solid rgb(255 255 255 / 18%); border-radius: 8px; background: #0c1015; box-shadow: 0 30px 80px rgb(0 0 0 / 40%); }
.asset-viewer__media { display: flex; min-width: 0; min-height: 0; align-items: center; justify-content: center; overflow: hidden; background: #070a0e; }
.asset-viewer__media > img,.asset-viewer__media > video { display: block; width: 100%; height: 100%; object-fit: contain; }
.asset-viewer__audio { display: flex; width: min(560px, calc(100% - 48px)); flex-direction: column; align-items: center; gap: 24px; color: #b8c0cc; }
.asset-viewer__audio audio { width: 100%; }
.asset-viewer__details { display: grid; min-width: 0; min-height: 0; grid-template-rows: minmax(0, 1fr) auto; background: #f7f8fa; color: #252c34; }
.asset-viewer__scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 24px 22px 28px; scrollbar-width: none; }
.asset-viewer__scroll::-webkit-scrollbar { display: none; }
.asset-viewer__eyebrow { display: flex; align-items: center; gap: 6px; color: #657080; font-size: 10px; }
.asset-viewer__details h2 { margin: 12px 0 0; overflow-wrap: anywhere; font-size: 17px; line-height: 1.45; }
.asset-viewer__prompt { max-height: 120px; overflow-y: auto; overscroll-behavior: contain; margin: 12px 0 0; border-left: 2px solid #7181eb; padding: 2px 8px 2px 10px; color: #5b6572; font-size: 11px; line-height: 1.65; white-space: pre-wrap; scrollbar-width: none; }
.asset-viewer__prompt::-webkit-scrollbar { display: none; }
.asset-viewer__references { display: grid; max-height: 142px; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; overflow-y: auto; overscroll-behavior: contain; margin-top: 12px; scrollbar-width: none; }
.asset-viewer__references::-webkit-scrollbar { display: none; }
.asset-viewer__references > div { position: relative; display: grid; height: 64px; place-items: center; overflow: hidden; border: 1px solid #dce1e7; border-radius: 5px; background: #e9edf2; color: #717b88; }
.asset-viewer__references img { width: 100%; height: 100%; object-fit: cover; }
.asset-viewer__references span { position: absolute; right: 3px; bottom: 3px; left: 3px; overflow: hidden; border-radius: 3px; padding: 2px 3px; background: rgb(16 20 27 / 68%); color: #fff; font-size: 8px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.asset-viewer__details dl { display: grid; grid-template-columns: 92px minmax(0, 1fr); margin: 20px 0 0; border-top: 1px solid #dfe3e8; }
.asset-viewer__details dt,.asset-viewer__details dd { margin: 0; border-bottom: 1px solid #e4e7eb; padding: 8px 0; font-size: 10px; line-height: 1.45; }
.asset-viewer__details dt { color: #8a929d; }
.asset-viewer__details dd { overflow-wrap: anywhere; color: #343c46; text-align: right; }
.asset-viewer__details dd.is-id { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; }
.asset-viewer__actions { display: flex; min-height: 58px; align-items: center; justify-content: flex-end; gap: 8px; border-top: 1px solid #dfe3e8; padding: 10px 18px; background: #fff; }
.asset-viewer__actions button { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid #d8dde4; border-radius: 8px; background: #fff; color: #4f5965; cursor: pointer; }
.asset-viewer__actions button:hover { border-color: #c6ccd5; background: #f1f3f6; color: #242b33; }
.asset-viewer__actions button:disabled { cursor: wait; opacity: .62; }
.asset-viewer__actions .asset-viewer__recreate { display: inline-flex; width: auto; min-width: 0; flex: 1; padding: 0 14px; border-color: #6f48ea; background: #7048ed; color: #fff; font-size: 11px; font-weight: 600; }
.asset-viewer__actions .asset-viewer__recreate:hover { border-color: #5f3bd2; background: #623ed7; color: #fff; }
@media (max-width: 820px) { .asset-viewer { padding: 14px; } .asset-viewer__panel { display: grid; height: calc(100dvh - 28px); grid-template-columns: 1fr; grid-template-rows: minmax(180px, 52dvh) minmax(0, 1fr); } .asset-viewer__media { min-height: 0; } .asset-viewer__scroll { padding: 20px 18px 24px; } .asset-viewer__prompt { max-height: 96px; } }
</style>
