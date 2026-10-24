<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { Construction } from "@lucide/vue"

const route = useRoute()
const title = computed(() => String(route.meta.title || "功能页面"))
const description = computed(() => String(route.meta.description || "该功能将在后续阶段接入。"))
</script>

<template>
  <section class="empty-workspace">
    <div class="empty-workspace__heading">
      <p>NOVA WORKSPACE</p>
      <h1>{{ title }}</h1>
      <span>{{ description }}</span>
    </div>
    <div class="empty-workspace__body">
      <Construction :size="30" />
      <strong>页面骨架已就绪</strong>
      <span>业务内容将在下一阶段按模块接入。</span>
    </div>
  </section>
</template>
