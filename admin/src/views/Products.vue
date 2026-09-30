<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import type { Product, Category, Page, ProductFilter } from "../types";
import { adminService } from "../admin-service";
import { money } from "../domain";
import { notify, errorMessage } from "../ui";
import FruitImage from "../components/FruitImage.vue";
import Feedback from "../components/Feedback.vue";
import Pagination from "../components/Pagination.vue";
import Modal from "../components/Modal.vue";
import Categories from "../components/Categories.vue";
import Icon from "../components/Icon.vue";
const filter = reactive<ProductFilter>({
  keyword: "",
  categoryId: "",
  enabled: "",
  page: 1,
});
const result = ref<Page<Product>>({ items: [], total: 0, page: 1, pages: 1 }),
  categories = ref<Category[]>([]);
const loading = ref(true),
  error = ref(""),
  categoryModal = ref(false),
  categoryBusy = ref(false);
const changing = ref<Product>(),
  busy = ref(false),
  saveError = ref("");
let sequence = 0;
async function load(reset = false) {
  if (reset) filter.page = 1;
  const seq = ++sequence;
  loading.value = true;
  error.value = "";
  try {
    const [p, c] = await Promise.all([
      adminService.products({ ...filter }),
      adminService.categories(),
    ]);
    if (seq === sequence) {
      result.value = p;
      categories.value = c;
    }
  } catch (e) {
    if (seq === sequence) error.value = errorMessage(e);
  } finally {
    if (seq === sequence) loading.value = false;
  }
}
function reset() {
  Object.assign(filter, { keyword: "", categoryId: "", enabled: "", page: 1 });
  load();
}
async function toggle() {
  busy.value = true;
  saveError.value = "";
  try {
    await adminService.setProductEnabled(
      changing.value!.id,
      !changing.value!.enabled,
    );
    changing.value = undefined;
    notify("商品状态已更新");
    await load();
  } catch (e) {
    saveError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
const priceRange = (p: Product) => {
  const prices = p.skus.filter((s) => s.enabled).map((s) => s.price);
  if (!prices.length) return "暂无启用规格";
  return `¥${money(Math.min(...prices))}${Math.max(...prices) !== Math.min(...prices) ? " 起" : ""}`;
};
onMounted(() => load());
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">PRODUCTS</span>
      <h1>商品管理</h1>
      <p>维护日常鲜果，管理规格与可售库存。</p>
    </div>
    <div class="heading-actions">
      <button class="btn" @click="categoryModal = true">管理分类</button
      ><RouterLink class="btn primary" to="/products/new"
        ><Icon name="plus" />新增商品</RouterLink
      >
    </div>
  </div>
  <section class="panel">
    <form class="filters" @submit.prevent="load(true)">
      <label class="field search-field"
        >搜索商品<input
          v-model="filter.keyword"
          placeholder="输入商品名称" /></label
      ><label class="field"
        >商品分类<select v-model="filter.categoryId" @change="load(true)">
          <option value="">全部分类</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">
            {{ c.name }}{{ c.enabled ? "" : "（停用）" }}
          </option>
        </select></label
      ><label class="field"
        >上架状态<select v-model="filter.enabled" @change="load(true)">
          <option value="">全部状态</option>
          <option value="true">已上架</option>
          <option value="false">已下架</option>
        </select></label
      >
      <div class="filter-actions">
        <button class="btn primary" :disabled="loading">查询</button
        ><button type="button" class="text-button" @click="reset">
          重置筛选
        </button>
      </div>
    </form>
    <div class="panel-title">
      <h2>
        商品列表 <span class="count">{{ result.total }}</span>
      </h2>
      <span class="muted">库存按固定规格管理</span>
    </div>
    <Feedback
      :error="error"
      :loading="loading"
      :empty="!result.items.length"
      text="没有符合条件的商品"
      @retry="load()"
    />
    <div v-if="!loading && !error && result.items.length" class="table-scroll">
      <p class="mobile-table-hint">
        左右滑动可查看完整表格，也可点击商品名称进行编辑。
      </p>
      <table class="product-table">
        <thead>
          <tr>
            <th>商品</th>
            <th>分类</th>
            <th>售价</th>
            <th>可售库存</th>
            <th>状态</th>
            <th class="align-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in result.items" :key="p.id">
            <td>
              <div class="product-cell">
                <FruitImage :image="p.image" :label="p.name" />
                <div>
                  <RouterLink :to="`/products/${p.id}`" class="cell-name">{{
                    p.name
                  }}</RouterLink
                  ><span class="cell-sub"
                    >{{
                      p.skus.filter((s) => s.enabled).length
                    }}
                    个启用规格</span
                  >
                </div>
              </div>
            </td>
            <td>{{ p.category }}</td>
            <td class="amount">{{ priceRange(p) }}</td>
            <td>
              <span
                :class="{
                  'out-stock': !p.skus.some((s) => s.enabled && s.stock),
                }"
                >{{
                  p.skus
                    .filter((s) => s.enabled)
                    .reduce((n, s) => n + s.stock, 0)
                }}</span
              ><span
                v-if="!p.skus.some((s) => s.enabled && s.stock)"
                class="cell-sub out-stock"
                >售罄 / 无启用规格</span
              >
            </td>
            <td>
              <span
                class="badge"
                :class="p.enabled ? 'completed' : 'cancelled'"
                >{{ p.enabled ? "已上架" : "已下架" }}</span
              >
            </td>
            <td class="align-right">
              <div class="row-actions">
                <RouterLink class="text-button" :to="`/products/${p.id}`"
                  >编辑</RouterLink
                ><button
                  class="text-button"
                  :class="{ 'muted-action': p.enabled }"
                  @click="
                    changing = p;
                    saveError = '';
                  "
                >
                  {{ p.enabled ? "下架" : "上架" }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Pagination
      v-if="!loading && !error"
      v-bind="result"
      @change="
        filter.page = $event;
        load();
      "
    />
  </section>
  <Modal
    v-if="categoryModal"
    title="管理商品分类"
    :busy="categoryBusy"
    @close="categoryModal = false"
    ><Categories @saved="load()" @busy="categoryBusy = $event"
  /></Modal>
  <Modal
    v-if="changing"
    :title="changing.enabled ? '下架商品' : '上架商品'"
    :busy="busy"
    @close="changing = undefined"
    ><p>确认{{ changing.enabled ? "下架" : "上架" }}“{{ changing.name }}”？</p>
    <p class="muted">
      {{
        changing.enabled
          ? "下架保留商品资料与历史订单。"
          : "上架需要启用分类，并至少保留一个启用规格。"
      }}
    </p>
    <p v-if="saveError" class="inline-error" role="alert">{{ saveError }}</p>
    <div class="modal-actions">
      <button class="btn" :disabled="busy" @click="changing = undefined">
        取消</button
      ><button class="btn primary" :disabled="busy" @click="toggle">
        {{ busy ? "正在保存…" : "确认" }}
      </button>
    </div></Modal
  >
</template>
