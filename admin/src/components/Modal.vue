<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, useId } from "vue";
const props = defineProps<{ title: string; busy?: boolean; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const element = ref<HTMLElement>(),
  titleId = useId();
let previous: HTMLElement | null = null;
const previousOverflow = document.body.style.overflow;
function keydown(e: KeyboardEvent) {
  if (e.key === "Escape" && !props.busy) emit("close");
  if (e.key !== "Tab" || !element.value) return;
  const items = [
    ...element.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    ),
  ];
  const first = items[0],
    last = items[items.length - 1];
  if (!first) {
    e.preventDefault();
    return;
  }
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
onMounted(() => {
  previous = document.activeElement as HTMLElement;
  document.body.style.overflow = "hidden";
  element.value?.focus();
  document.addEventListener("keydown", keydown);
});
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
  document.removeEventListener("keydown", keydown);
  previous?.focus();
});
</script>
<template>
  <Teleport to="body"
    ><div class="modal-backdrop" @click.self="!busy && $emit('close')">
      <section
        ref="element"
        class="modal"
        :class="{ wide }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <header class="modal-header">
          <h2 :id="titleId">{{ title }}</h2>
          <button
            type="button"
            class="icon-button"
            :disabled="busy"
            aria-label="关闭弹窗"
            @click="$emit('close')"
          >
            ×
          </button>
        </header>
        <div class="modal-body"><slot /></div>
      </section></div
  ></Teleport>
</template>
