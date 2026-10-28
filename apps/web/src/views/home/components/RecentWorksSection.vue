<script setup lang="ts">
import { ArrowRight, Clock3, Play } from "@lucide/vue"

import type { Asset } from "@/services/assets"

defineProps<{
  loading: boolean
  works: Asset[]
  previewUrls: Record<string, string>
  limit: number
}>()

const emit = defineEmits<{ open: [work: Asset]; viewAll: [] }>()

function workMeta(work: Asset) {
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
</script>

<template>
  <section class="content-section">
    <div class="section-heading">
      <div><span class="section-heading__icon section-heading__icon--blue"><Clock3 :size="16" /></span><h2>最近创作</h2></div>
      <button type="button" @click="emit('viewAll')">查看全部 <ArrowRight :size="15" /></button>
    </div>
    <div v-if="loading" class="media-grid media-grid--recent" aria-label="正在加载最近创作">
      <span v-for="index in limit" :key="index" class="media-tile media-tile--loading" />
    </div>
    <div v-else-if="works.length" class="media-grid media-grid--recent">
      <button v-for="work in works" :key="work.id" type="button" class="media-tile" :disabled="work.status !== 'ready' || !previewUrls[work.id]" @click="emit('open', work)">
        <img v-if="previewUrls[work.id] && (work.type === 'image' || work.posterUrl)" :src="previewUrls[work.id]" :alt="work.title" loading="lazy" decoding="async" />
        <video v-else-if="previewUrls[work.id]" :src="previewUrls[work.id]" muted playsinline preload="metadata" aria-hidden="true" />
        <span v-else class="media-tile__state">{{ workMeta(work) }}</span>
        <span class="media-tile__overlay" />
        <span class="media-tile__top">{{ work.type === "image" ? "图片" : "视频" }}</span>
        <span v-if="work.type === 'video' && work.status === 'ready'" class="media-tile__play"><Play :size="16" fill="currentColor" /></span>
        <span class="media-tile__caption" :class="{ 'media-tile__caption--full': work.type !== 'video' || work.status !== 'ready' }"><strong>{{ work.title }}</strong><small>{{ workMeta(work) }}</small></span>
      </button>
    </div>
    <div v-else class="recent-empty">完成第一次图片生成后，作品会出现在这里</div>
  </section>
</template>
