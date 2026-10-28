<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { Image, Video } from "@lucide/vue"

import { getGenerationPreview } from "@/services/generations"

const props = defineProps<{ taskId: string; alt: string; kind: "image" | "video" }>()
const root = ref<HTMLElement | null>(null)
const source = ref("")
let observer: IntersectionObserver | undefined
let controller: AbortController | undefined

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer?.disconnect()
    controller = new AbortController()
    void getGenerationPreview(props.taskId, true, controller.signal)
      .then((blob) => {
        source.value = URL.createObjectURL(blob)
      })
      .catch(() => undefined)
  }, { rootMargin: "160px" })
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  controller?.abort()
  if (source.value) URL.revokeObjectURL(source.value)
})
</script>

<template>
  <span ref="root" class="generation-thumbnail">
    <img v-if="source" :src="source" :alt="alt" />
    <component :is="kind === 'image' ? Image : Video" v-else :size="16" aria-hidden="true" />
  </span>
</template>
