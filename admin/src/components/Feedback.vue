<script setup lang="ts">
defineProps<{
  error?: string;
  loading?: boolean;
  empty?: boolean;
  text?: string;
}>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div v-if="error" class="feedback error-box" role="alert">
    <p>{{ error }}</p>
    <button class="btn" @click="$emit('retry')">重试</button>
  </div>
  <div v-else-if="loading" class="feedback" aria-live="polite">
    <span class="loading-dot" />正在加载…
  </div>
  <div v-else-if="empty" class="feedback">
    <span class="empty-illustration">○</span
    ><strong>{{ text || "暂时没有数据" }}</strong
    ><span>试试调整筛选条件</span>
  </div>
</template>
