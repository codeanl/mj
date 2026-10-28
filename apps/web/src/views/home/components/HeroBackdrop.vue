<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue"

type HeroSlide = { type: "image" | "video"; src: string }

const slides: HeroSlide[] = [
  { type: "video", src: "/hero/hero-video-1.mp4" },
  { type: "video", src: "/hero/hero-video-2.mp4" },
  { type: "video", src: "/hero/hero-video-3.mp4" },
]

const root = ref<HTMLElement | null>(null)
const visible = ref(false)
const activeIndex = ref(0)
const readyIndexes = ref<number[]>([])
const paused = ref(false)
let idleHandle: number | undefined
let rotationTimer: number | undefined
const preloads = new Map<number, Promise<boolean>>()
const videoElements = new Map<number, HTMLVideoElement>()

function preloadSlide(index: number) {
  if (readyIndexes.value.includes(index)) return Promise.resolve(true)
  const existing = preloads.get(index)
  if (existing) return existing
  const pending = new Promise<boolean>((resolve) => {
    const markReady = () => {
      readyIndexes.value = [...readyIndexes.value, index]
      preloads.delete(index)
      resolve(true)
    }
    const markFailed = () => {
      preloads.delete(index)
      resolve(false)
    }
    const slide = slides[index]
    if (slide.type === "image") {
      const image = new window.Image()
      image.onload = markReady
      image.onerror = markFailed
      image.src = slide.src
      return
    }
    const video = document.createElement("video")
    video.preload = "auto"
    video.muted = true
    video.playsInline = true
    video.onloadeddata = markReady
    video.onerror = markFailed
    video.src = slide.src
    video.load()
  })
  preloads.set(index, pending)
  return pending
}

function stopRotation() {
  if (rotationTimer !== undefined) window.clearTimeout(rotationTimer)
  rotationTimer = undefined
}

function scheduleRotation() {
  stopRotation()
  if (paused.value || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  if (slides[activeIndex.value].type === "video") {
    syncPlayback()
    return
  }
  rotationTimer = window.setTimeout(() => void advanceSlide(), 8000)
}

async function advanceSlide() {
  const nextIndex = (activeIndex.value + 1) % slides.length
  if (!(await preloadSlide(nextIndex))) return scheduleRotation()
  activeIndex.value = nextIndex
  await nextTick()
  syncPlayback(true)
  void preloadSlide((nextIndex + 1) % slides.length)
  scheduleRotation()
}

async function selectSlide(index: number) {
  if (index === activeIndex.value || !(await preloadSlide(index))) return
  activeIndex.value = index
  await nextTick()
  syncPlayback(true)
  void preloadSlide((index + 1) % slides.length)
  scheduleRotation()
}

function setVideoRef(element: unknown, index: number) {
  if (element instanceof HTMLVideoElement) {
    videoElements.set(index, element)
    syncPlayback()
  } else {
    videoElements.delete(index)
  }
}

function syncPlayback(restart = false) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  videoElements.forEach((video, index) => {
    const active = index === activeIndex.value
    if (!active || paused.value || document.hidden || reduceMotion) {
      video.pause()
      if (!active) video.currentTime = 0
      return
    }
    if (restart) video.currentTime = 0
    void video.play().catch(() => {})
  })
}

function setPaused(value: boolean) {
  paused.value = value
  if (value) stopRotation()
  syncPlayback()
  if (!value) scheduleRotation()
}

function handleVisibility() {
  if (document.hidden) stopRotation()
  syncPlayback()
  if (!document.hidden) scheduleRotation()
}

const handlePointerEnter = () => setPaused(true)
const handlePointerLeave = () => setPaused(false)

onMounted(() => {
  const reveal = async () => {
    visible.value = true
    if (await preloadSlide(0)) {
      void preloadSlide(1)
      await nextTick()
      syncPlayback(true)
      scheduleRotation()
    }
  }
  if ("requestIdleCallback" in window) idleHandle = window.requestIdleCallback(() => void reveal())
  else requestAnimationFrame(() => void reveal())
  root.value?.parentElement?.addEventListener("mouseenter", handlePointerEnter)
  root.value?.parentElement?.addEventListener("mouseleave", handlePointerLeave)
  document.addEventListener("visibilitychange", handleVisibility)
})

onBeforeUnmount(() => {
  if (idleHandle !== undefined && "cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle)
  stopRotation()
  document.removeEventListener("visibilitychange", handleVisibility)
  root.value?.parentElement?.removeEventListener("mouseenter", handlePointerEnter)
  root.value?.parentElement?.removeEventListener("mouseleave", handlePointerLeave)
})
</script>

<template>
  <div ref="root" class="hero-backdrop">
    <template v-if="visible">
      <template v-for="(slide, index) in slides" :key="slide.src">
        <img v-if="slide.type === 'image' && readyIndexes.includes(index)" class="creation-stage__backdrop" :class="{ 'is-active': activeIndex === index }" :src="slide.src" alt="" decoding="async" />
        <video v-else-if="slide.type === 'video' && readyIndexes.includes(index)" :ref="(element) => setVideoRef(element, index)" class="creation-stage__backdrop" :class="{ 'is-active': activeIndex === index }" :src="slide.src" muted playsinline preload="metadata" aria-hidden="true" @loadeddata="syncPlayback()" @ended="index === activeIndex && advanceSlide()" />
      </template>
      <div class="creation-stage__pagination" aria-label="背景轮播">
        <button v-for="(_, index) in slides" :key="index" type="button" :class="{ 'is-active': activeIndex === index }" :aria-label="`切换到轮播内容 ${index + 1}`" :aria-current="activeIndex === index ? 'true' : undefined" @click="selectSlide(index)" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.hero-backdrop { position: absolute; inset: 0; }
.creation-stage__backdrop { position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 46%; opacity: 0; transition: opacity 900ms ease; will-change: opacity; }
.creation-stage__backdrop.is-active { opacity: 1; }
.creation-stage__pagination { position: absolute; z-index: 5; right: 24px; bottom: 18px; display: flex; align-items: center; gap: 7px; }
.creation-stage__pagination button { width: 7px; height: 7px; border: 1px solid rgb(255 255 255 / 80%); border-radius: 50%; padding: 0; background: rgb(20 30 35 / 36%); box-shadow: 0 1px 5px rgb(0 0 0 / 20%); cursor: pointer; transition: width 160ms ease, border-radius 160ms ease, background-color 160ms ease; }
.creation-stage__pagination button.is-active { width: 20px; border-radius: 5px; background: #fff; }
@media (max-width: 820px) {
  .creation-stage__pagination { right: 14px; bottom: 12px; }
  .creation-stage__backdrop { object-position: center; }
}
@media (prefers-reduced-motion: reduce) {
  .creation-stage__backdrop { transition: none; }
}
</style>
