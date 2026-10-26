<script setup lang="ts">
import { useAuthStore } from "@/stores/auth"

const authStore = useAuthStore()
</script>

<template>
  <span class="user-avatar" aria-hidden="true">
    <img v-if="authStore.avatarObjectUrl" :src="authStore.avatarObjectUrl" alt="" />
    <span v-else>{{ authStore.userInitial }}</span>
  </span>
</template>
