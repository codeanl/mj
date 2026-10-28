<script setup lang="ts">
import { ArrowLeft, FileQuestion } from "@lucide/vue"
</script>

<template>
  <section class="admin-empty"><FileQuestion :size="34" /><strong>找不到这个管理页面</strong><span>地址可能已变更，请返回经营总览继续操作。</span><RouterLink class="admin-empty__action" to="/dashboard"><ArrowLeft :size="16" />返回总览</RouterLink></section>
</template>
