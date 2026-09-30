<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import type { ImageRef } from "../types";
import { adminService } from "../admin-service";
import catalog from "../../../miniprogram/assets/fruit-catalog.jpg";

const props = defineProps<{
  image: ImageRef;
  label: string;
  preview?: string;
}>();
const url = ref(""),
  failed = ref(false),
  loading = ref(false);
let ownedUrl = "",
  sequence = 0;
function release() {
  if (ownedUrl) URL.revokeObjectURL(ownedUrl);
  ownedUrl = "";
}
watch(
  () => [props.image, props.preview],
  async () => {
    const seq = ++sequence;
    release();
    failed.value = false;
    url.value = "";
    loading.value = false;
    if (props.preview) {
      url.value = props.preview;
      return;
    }
    if (typeof props.image === "number") return;
    loading.value = true;
    try {
      const blob = await adminService.image(props.image.id);
      if (seq !== sequence) return;
      if (!blob) {
        failed.value = true;
        return;
      }
      ownedUrl = URL.createObjectURL(blob);
      url.value = ownedUrl;
    } catch {
      if (seq === sequence) failed.value = true;
    } finally {
      if (seq === sequence) loading.value = false;
    }
  },
  { immediate: true, deep: true },
);
onBeforeUnmount(() => {
  sequence++;
  release();
});
</script>
<template>
  <span class="fruit-image" role="img" :aria-label="label">
    <span v-if="failed || loading" class="image-fallback">{{
      loading ? "加载中" : "图片不可用"
    }}</span>
    <img
      v-else-if="typeof image === 'number' && !preview"
      :src="catalog"
      alt=""
      class="fruit-sheet"
      :style="{
        left: `${-(image % 4) * 100}%`,
        top: `${-Math.floor(image / 4) * 100}%`,
      }"
      @error="failed = true"
    />
    <img
      v-else-if="url"
      :src="url"
      alt=""
      class="uploaded-image"
      @error="failed = true"
    />
    <span v-else class="image-fallback">图片不可用</span>
  </span>
</template>
