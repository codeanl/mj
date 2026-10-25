<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "@lucide/vue"

import { activeNotification, dismissNotification } from "@/services/notifications"

const icons = { success: CircleCheck, error: CircleAlert, info: Info, warning: TriangleAlert }
</script>

<template>
  <Transition name="app-notice">
    <div v-if="activeNotification" :key="activeNotification.id" class="app-notification" :class="`is-${activeNotification.kind}`" role="status" aria-live="polite">
      <component :is="icons[activeNotification.kind]" :size="17" />
      <span>{{ activeNotification.message }}</span>
      <button type="button" aria-label="关闭提示" @click="dismissNotification"><X :size="15" /></button>
    </div>
  </Transition>
</template>
