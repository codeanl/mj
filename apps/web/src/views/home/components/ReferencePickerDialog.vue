<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { FolderOpen, Image, LoaderCircle, Music, Paperclip, Search, Video, X } from "@lucide/vue"

import { useModalDialog } from "@/hooks/use-modal-dialog"
import type { Asset } from "@/services/assets"

const props = defineProps<{
  hint: string
  selectedCount: number
  limit: number
  loading: boolean
  loadingMore: boolean
  assets: Asset[]
  previewUrls: Record<string, string>
  search: string
  hasMore: boolean
}>()

const emit = defineEmits<{
  close: []
  upload: []
  select: [asset: Asset]
  loadMore: []
  search: []
  "update:search": [value: string]
}>()

const panel = ref<HTMLElement | null>(null)
useModalDialog(computed(() => true), panel, () => emit("close"))

function updateSearch(event: Event) {
  emit("update:search", (event.target as HTMLInputElement).value)
  emit("search")
}

function selectAsset(asset: Asset) {
  emit("select", asset)
  void nextTick(() => panel.value?.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus())
}
</script>

<template>
  <div class="reference-picker" @click.self="emit('close')">
    <div ref="panel" class="reference-picker__panel" role="dialog" aria-modal="true" aria-label="选择参考素材" tabindex="-1">
      <header>
        <div><strong>选择参考素材</strong><span>{{ hint }}</span></div>
        <button type="button" title="关闭" aria-label="关闭素材选择" data-dialog-initial-focus @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="reference-picker__toolbar">
        <label class="reference-picker__search"><Search :size="15" /><input :value="search" type="search" placeholder="搜索素材名称" @input="updateSearch" /></label>
        <button type="button" @click="emit('upload')"><Paperclip :size="15" />上传新文件</button>
        <span>已选 {{ selectedCount }}/{{ limit }}</span>
      </div>
      <div v-if="loading" class="reference-picker__state"><LoaderCircle class="spin" :size="22" />正在加载素材</div>
      <div v-else-if="assets.length" class="reference-picker__grid">
        <button v-for="asset in assets" :key="asset.id" type="button" :title="asset.title" @click="selectAsset(asset)">
          <img v-if="previewUrls[asset.id]" :src="previewUrls[asset.id]" :alt="asset.title" />
          <span v-else><Music v-if="asset.type === 'audio'" :size="22" /><Video v-else-if="asset.type === 'video'" :size="22" /><Image v-else :size="22" /></span>
          <small>{{ asset.title }}</small>
        </button>
      </div>
      <div v-else class="reference-picker__state"><FolderOpen :size="24" />{{ search.trim() ? "没有找到可用素材" : "暂无可用素材" }}</div>
      <footer class="reference-picker__footer">
        <button v-if="hasMore" type="button" :disabled="loadingMore" @click="emit('loadMore')"><LoaderCircle v-if="loadingMore" class="spin" :size="15" />{{ loadingMore ? "加载中" : "加载更多" }}</button>
        <button class="reference-picker__done" type="button" @click="emit('close')">完成</button>
      </footer>
    </div>
  </div>
</template>
