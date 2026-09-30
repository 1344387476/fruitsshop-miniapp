<script setup lang="ts">
defineProps<{
  name: "order" | "product" | "store" | "arrow" | "plus" | "logout";
}>();
const paths = {
  order: "M7 3h10v18l-3-2-2 2-2-2-3 2V3ZM10 8h4M10 12h4",
  product: "m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4",
  store:
    "M3 10h18L19 4H5l-2 6Zm2 0v10h14V10M9 20v-6h6v6M3 10c0 3 3 3 4 0 0 3 4 3 5 0 1 3 5 3 5 0 1 3 4 3 4 0",
  arrow: "m14 6-6 6 6 6",
  plus: "M12 5v14M5 12h14",
  logout: "M10 4H4v16h6M9 12h12m-4-4 4 4-4 4",
};
</script>
<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>
