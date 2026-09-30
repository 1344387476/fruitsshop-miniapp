<script setup lang="ts">
import { reactive, ref, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import type { Product, Category, SKU } from "../types";
import { adminService } from "../admin-service";
import { clone, money, parseMoney, assert } from "../domain";
import { notify, errorMessage } from "../ui";
import FruitImage from "../components/FruitImage.vue";
import Feedback from "../components/Feedback.vue";
import Modal from "../components/Modal.vue";
import Icon from "../components/Icon.vue";
const route = useRoute(),
  router = useRouter(),
  isNew = route.path === "/products/new";
const form = reactive<Product>({
  id: "",
  name: "",
  subtitle: "",
  categoryId: "",
  category: "",
  origin: "",
  image: 0,
  description: "",
  storage: "",
  enabled: false,
  skus: [],
});
const categories = ref<Category[]>([]),
  prices = ref<string[]>([]),
  loading = ref(true),
  error = ref(""),
  busy = ref(false),
  saveError = ref("");
const pendingBlob = ref<Blob>(),
  preview = ref(""),
  imageBusy = ref(false),
  fileError = ref(""),
  fileInput = ref<HTMLInputElement>();
const stockTarget = ref<SKU>(),
  stockValue = ref(0),
  stockBusy = ref(false),
  stockError = ref("");
let initial = "",
  uploadSequence = 0;
const fingerprint = () =>
  JSON.stringify({
    form,
    prices: prices.value,
    upload: pendingBlob.value ? preview.value : "",
  });
function releasePreview() {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = "";
}
function populate(p: Product) {
  Object.assign(form, clone(p));
  prices.value = p.skus.map((s) => money(s.price));
  initial = fingerprint();
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    categories.value = await adminService.categories();
    if (!isNew) populate(await adminService.product(String(route.params.id)));
    else if (!initial) {
      form.categoryId = categories.value.find((c) => c.enabled)?.id || "";
      form.skus = [{ id: "", label: "", price: 0, stock: 0, enabled: true }];
      prices.value = [""];
      initial = fingerprint();
    }
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
function chooseCatalog(index: number) {
  uploadSequence++;
  imageBusy.value = false;
  releasePreview();
  pendingBlob.value = undefined;
  form.image = index;
  fileError.value = "";
  if (fileInput.value) fileInput.value.value = "";
}
async function upload(event: Event) {
  const target = event.target as HTMLInputElement,
    file = target.files?.[0];
  if (!file) return;
  const sequence = ++uploadSequence;
  imageBusy.value = true;
  fileError.value = "";
  let candidate = "";
  try {
    assert(
      ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
        file.size > 0 &&
        file.size <= 5 * 1024 * 1024,
      "请上传 5 MB 以内的 JPEG、PNG 或 WebP 图片",
    );
    candidate = URL.createObjectURL(file);
    const img = new Image();
    img.src = candidate;
    await img.decode();
    assert(
      img.naturalWidth > 0 && img.naturalHeight > 0,
      "图片无法读取，请换一张图片",
    );
    if (sequence !== uploadSequence) {
      URL.revokeObjectURL(candidate);
      return;
    }
    releasePreview();
    preview.value = candidate;
    pendingBlob.value = file;
    form.image = { kind: "upload", id: crypto.randomUUID() };
  } catch (e) {
    if (candidate) URL.revokeObjectURL(candidate);
    if (sequence === uploadSequence)
      fileError.value =
        e instanceof Error && e.message.startsWith("请上传")
          ? e.message
          : "图片损坏或无法读取，请换一张图片";
  } finally {
    if (sequence === uploadSequence) imageBusy.value = false;
    target.value = "";
  }
}
function addSku() {
  if (form.skus.length >= 50) {
    notify("最多保留 50 个规格", "error");
    return;
  }
  form.skus.push({ id: "", label: "", price: 0, stock: 0, enabled: true });
  prices.value.push("");
}
function cancelNewSku(index: number) {
  if (form.skus[index].id) return;
  form.skus.splice(index, 1);
  prices.value.splice(index, 1);
}
async function save() {
  busy.value = true;
  saveError.value = "";
  try {
    const input = clone(form);
    input.skus.forEach((s, i) => {
      s.price = parseMoney(prices.value[i]);
    });
    const saved = await adminService.saveProduct(input, pendingBlob.value);
    pendingBlob.value = undefined;
    releasePreview();
    populate(saved);
    notify(isNew ? "商品已创建，默认下架" : "商品资料已保存");
    busy.value = false;
    await router.push("/products");
  } catch (e) {
    saveError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
function openStock(s: SKU) {
  stockTarget.value = clone(s);
  stockValue.value = s.stock;
  stockError.value = "";
}
async function saveStock() {
  stockBusy.value = true;
  stockError.value = "";
  try {
    const s = stockTarget.value!;
    const saved = await adminService.setStock(
      form.id,
      s.id,
      stockValue.value,
      s.stock,
    );
    // Update only stock, retaining all unsaved text/specification edits.
    const index = form.skus.findIndex((x) => x.id === s.id);
    const wasClean = fingerprint() === initial;
    form.skus[index].stock = saved.stock;
    if (wasClean) initial = fingerprint();
    stockTarget.value = undefined;
    notify("可售库存已更新");
  } catch (e) {
    stockError.value = errorMessage(e);
  } finally {
    stockBusy.value = false;
  }
}
onBeforeRouteLeave(() => {
  if (!adminService.authenticated()) return true;
  if (busy.value || stockBusy.value || imageBusy.value) return false;
  if (initial && fingerprint() !== initial)
    return window.confirm("商品有未保存的修改，确定离开？");
});
onBeforeUnmount(() => {
  uploadSequence++;
  releasePreview();
});
onMounted(load);
</script>
<template>
  <RouterLink to="/products" class="back-link"
    ><Icon name="arrow" />返回商品列表</RouterLink
  >
  <div class="page-heading">
    <div>
      <span class="eyebrow">PRODUCT EDITOR</span>
      <h1>{{ isNew ? "新增商品" : "编辑商品" }}</h1>
      <p>
        {{
          isNew
            ? "先完善商品资料，保存后再上架。"
            : "资料与价格修改只影响商品，不改变历史订单。"
        }}
      </p>
    </div>
    <span
      v-if="!isNew"
      class="badge"
      :class="form.enabled ? 'completed' : 'cancelled'"
      >{{ form.enabled ? "已上架" : "已下架" }}</span
    >
  </div>
  <Feedback :error="error" :loading="loading" @retry="load" />
  <form v-if="!loading && !error" class="editor-form" @submit.prevent="save">
    <fieldset :disabled="busy || stockBusy">
      <div class="editor-grid">
        <section class="panel padded">
          <h2>基本资料</h2>
          <div class="form-grid">
            <label class="field full"
              >商品名称 <span class="required">*</span
              ><input
                v-model="form.name"
                name="productName"
                required
                maxlength="80"
                placeholder="例如：脆甜红富士" /></label
            ><label class="field"
              >商品分类 <span class="required">*</span
              ><select v-model="form.categoryId" required>
                <option value="" disabled>请选择分类</option>
                <option v-for="c in categories" :key="c.id" :value="c.id">
                  {{ c.name }}{{ c.enabled ? "" : "（停用）" }}
                </option>
              </select></label
            ><label class="field"
              >产地<input
                v-model="form.origin"
                maxlength="100"
                placeholder="例如：山东烟台" /></label
            ><label class="field full"
              >简短说明<input
                v-model="form.subtitle"
                maxlength="120"
                placeholder="一句话介绍商品" /></label
            ><label class="field full"
              >商品介绍<textarea
                v-model="form.description"
                rows="4"
                maxlength="1000"
              /></label
            ><label class="field full"
              >保存说明<textarea
                v-model="form.storage"
                rows="2"
                maxlength="300"
              />
            </label>
          </div>
        </section>
        <section class="panel padded image-editor">
          <h2>商品图片</h2>
          <div class="image-preview">
            <FruitImage
              :image="form.image"
              :label="form.name || '商品预览'"
              :preview="preview"
            />
          </div>
          <label class="upload-button btn"
            ><input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              :disabled="busy || imageBusy"
              @change="upload"
            />{{ imageBusy ? "正在检查图片…" : "上传本地图片" }}</label
          >
          <p class="muted helper">
            JPEG / PNG / WebP，单张不超过 5 MB。<br />图片保存在当前浏览器。
          </p>
          <p v-if="fileError" class="inline-error" role="alert">
            {{ fileError }}
          </p>
          <span class="field-label">或选择现有水果素材</span>
          <div class="catalog-picker">
            <button
              v-for="i in 12"
              :key="i"
              type="button"
              :class="{ selected: form.image === i - 1 }"
              :aria-label="`选择水果素材 ${i}`"
              :aria-pressed="form.image === i - 1"
              @click="chooseCatalog(i - 1)"
            >
              <FruitImage :image="i - 1" :label="`水果素材 ${i}`" />
            </button>
          </div>
        </section>
      </div>
      <section class="panel padded sku-panel">
        <div class="section-heading">
          <div>
            <h2>规格与库存</h2>
            <p class="muted">固定规格、固定售价。可售库存已扣除订单预占。</p>
          </div>
          <button type="button" class="btn small" @click="addSku">
            <Icon name="plus" />新增规格
          </button>
        </div>
        <div class="sku-list">
          <div
            v-for="(s, i) in form.skus"
            :key="s.id || `new-${i}`"
            class="sku-row"
          >
            <label class="field"
              >规格名称 <span class="required">*</span
              ><input
                v-model="s.label"
                required
                maxlength="100"
                placeholder="例如：4个装 / 约800g" /></label
            ><label class="field"
              >售价（元）<input
                v-model="prices[i]"
                required
                inputmode="decimal"
                placeholder="0.00"
            /></label>
            <div v-if="s.id" class="field">
              <span>可售库存</span>
              <div class="stock-field">
                <strong>{{ s.stock }}</strong
                ><button
                  type="button"
                  class="text-button"
                  @click="openStock(s)"
                >
                  调整库存
                </button>
              </div>
            </div>
            <label v-else class="field"
              >初始库存<input
                v-model.number="s.stock"
                type="number"
                min="0"
                step="1"
                required
            /></label>
            <div class="sku-controls">
              <label class="checkbox sku-enabled"
                ><input v-model="s.enabled" type="checkbox" />启用</label
              >
              <button
                v-if="!s.id"
                type="button"
                class="text-button"
                @click="cancelNewSku(i)"
              >
                取消新增
              </button>
            </div>
          </div>
        </div>
      </section>
    </fieldset>
    <div class="form-footer">
      <p v-if="saveError" class="inline-error" role="alert">{{ saveError }}</p>
      <span v-else class="muted">{{
        isNew ? "新商品保存后默认为下架状态" : "已有规格停用后仍保留历史记录"
      }}</span>
      <div>
        <RouterLink class="btn" to="/products">取消</RouterLink
        ><button class="btn primary" :disabled="busy || imageBusy || stockBusy">
          {{ busy ? "正在保存…" : "保存商品" }}
        </button>
      </div>
    </div>
  </form>
  <Modal
    v-if="stockTarget"
    title="调整可售库存"
    :busy="stockBusy"
    @close="stockTarget = undefined"
    ><form @submit.prevent="saveStock">
      <p>{{ stockTarget.label }}</p>
      <p class="muted">
        当前可售库存：{{ stockTarget.stock }}。请输入调整后的可售数量。
      </p>
      <label class="field"
        >可售库存<input
          v-model.number="stockValue"
          type="number"
          min="0"
          step="1"
          required
          :disabled="stockBusy"
      /></label>
      <p v-if="stockError" class="inline-error" role="alert">
        {{ stockError }}
      </p>
      <div class="modal-actions">
        <button
          type="button"
          class="btn"
          :disabled="stockBusy"
          @click="stockTarget = undefined"
        >
          取消</button
        ><button class="btn primary" :disabled="stockBusy">
          {{ stockBusy ? "正在保存…" : "保存库存" }}
        </button>
      </div>
    </form></Modal
  >
</template>
