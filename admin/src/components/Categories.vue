<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import type { Category } from "../types";
import { adminService } from "../admin-service";
import { errorMessage, notify } from "../ui";
import Feedback from "./Feedback.vue";
const emit = defineEmits<{ saved: []; busy: [value: boolean] }>();
const items = ref<Category[]>([]),
  loading = ref(true),
  error = ref(""),
  saving = ref(false),
  saveError = ref("");
const form = reactive<Category>({ id: "", name: "", sort: 0, enabled: true });
async function load() {
  loading.value = true;
  error.value = "";
  try {
    items.value = await adminService.categories();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
function edit(c?: Category) {
  Object.assign(
    form,
    c || { id: "", name: "", sort: items.value.length, enabled: true },
  );
  saveError.value = "";
}
async function save() {
  saving.value = true;
  emit("busy", true);
  saveError.value = "";
  try {
    await adminService.saveCategory({ ...form });
    await load();
    edit();
    emit("saved");
    notify("分类已保存");
  } catch (e) {
    saveError.value = errorMessage(e);
  } finally {
    saving.value = false;
    emit("busy", false);
  }
}
onMounted(load);
</script>
<template>
  <p class="muted">排序数字越小越靠前。停用分类前，请先下架关联商品。</p>
  <Feedback :error="error" :loading="loading" @retry="load" />
  <div v-if="!loading && !error" class="category-list">
    <div v-for="c in items" :key="c.id" class="category-row">
      <span
        ><strong>{{ c.name }}</strong
        ><small>排序 {{ c.sort }}</small></span
      ><span class="badge" :class="c.enabled ? 'completed' : 'cancelled'">{{
        c.enabled ? "已启用" : "已停用"
      }}</span
      ><button class="text-button" :disabled="saving" @click="edit(c)">
        编辑
      </button>
    </div>
  </div>
  <form class="category-form" @submit.prevent="save">
    <h3>{{ form.id ? "编辑分类" : "新增分类" }}</h3>
    <fieldset :disabled="saving">
      <div class="form-grid">
        <label class="field"
          >分类名称<input v-model="form.name" maxlength="30" required /></label
        ><label class="field"
          >排序<input
            v-model.number="form.sort"
            type="number"
            min="0"
            step="1"
            required
        /></label>
      </div>
      <label class="checkbox"
        ><input v-model="form.enabled" type="checkbox" />启用此分类</label
      >
      <p v-if="saveError" class="inline-error" role="alert">{{ saveError }}</p>
      <div class="modal-actions">
        <button v-if="form.id" type="button" class="btn" @click="edit()">
          改为新增</button
        ><button class="btn primary">
          {{ saving ? "正在保存…" : "保存分类" }}
        </button>
      </div>
    </fieldset>
  </form>
</template>
