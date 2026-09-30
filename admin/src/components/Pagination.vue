<script setup lang="ts">
defineProps<{ page: number; pages: number; total: number }>();
defineEmits<{ change: [page: number] }>();
</script>
<template>
  <div class="pagination">
    <span>共 {{ total }} 条 · 每页 20 条</span>
    <div>
      <button
        class="btn small"
        :disabled="page <= 1"
        @click="$emit('change', page - 1)"
      >
        上一页</button
      ><span>{{ page }} / {{ pages }}</span
      ><button
        class="btn small"
        :disabled="page >= pages"
        @click="$emit('change', page + 1)"
      >
        下一页
      </button>
    </div>
  </div>
</template>
