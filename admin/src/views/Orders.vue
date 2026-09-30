<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import type { Order, OrderFilter, Page } from "../types";
import { adminService } from "../admin-service";
import { money, dateTime, statusLabel } from "../domain";
import { errorMessage } from "../ui";
import Feedback from "../components/Feedback.vue";
import Pagination from "../components/Pagination.vue";
import Icon from "../components/Icon.vue";
const filter = reactive<OrderFilter>({
  keyword: "",
  status: "",
  fulfillment: "",
  page: 1,
});
const result = ref<Page<Order>>({ items: [], total: 0, page: 1, pages: 1 }),
  loading = ref(true),
  error = ref("");
let sequence = 0;
async function load(reset = false) {
  if (reset) filter.page = 1;
  const seq = ++sequence;
  loading.value = true;
  error.value = "";
  try {
    const data = await adminService.orders({ ...filter });
    if (seq === sequence) result.value = data;
  } catch (e) {
    if (seq === sequence) error.value = errorMessage(e);
  } finally {
    if (seq === sequence) loading.value = false;
  }
}
function reset() {
  Object.assign(filter, { keyword: "", status: "", fulfillment: "", page: 1 });
  load();
}
onMounted(() => load());
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">ORDERS</span>
      <h1>订单管理</h1>
      <p>查看订单，安排配送与到店自提。</p>
    </div>
    <button class="btn" :disabled="loading" @click="load()">刷新列表</button>
  </div>
  <section class="panel">
    <form class="filters" @submit.prevent="load(true)">
      <label class="field search-field"
        >搜索订单<input v-model="filter.keyword" placeholder="订单号或手机号"
      /></label>
      <label class="field"
        >订单状态<select v-model="filter.status" @change="load(true)">
          <option value="">全部状态</option>
          <option value="pending">待支付</option>
          <option value="paid">待配送 / 待自提</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select></label
      >
      <label class="field"
        >履约方式<select v-model="filter.fulfillment" @change="load(true)">
          <option value="">全部方式</option>
          <option value="delivery">配送</option>
          <option value="pickup">自提</option>
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
        订单列表 <span class="count">{{ result.total }}</span>
      </h2>
      <span class="muted">按下单时间倒序</span>
    </div>
    <Feedback
      :error="error"
      :loading="loading"
      :empty="!result.items.length"
      text="没有符合条件的订单"
      @retry="load()"
    />
    <div v-if="!loading && !error && result.items.length" class="table-scroll">
      <p class="mobile-table-hint">
        左右滑动可查看完整表格，也可点击订单号查看详情。
      </p>
      <table class="order-table">
        <thead>
          <tr>
            <th>订单 / 下单时间</th>
            <th>商品</th>
            <th>联系人</th>
            <th>履约方式</th>
            <th>订单金额</th>
            <th>状态</th>
            <th class="align-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in result.items" :key="o.id">
            <td>
              <RouterLink :to="`/orders/${o.id}`" class="order-number">{{
                o.id
              }}</RouterLink
              ><span class="cell-sub">{{ dateTime(o.createdAt) }}</span>
            </td>
            <td>
              <span class="cell-name">{{ o.lines[0]?.name }}</span
              ><span class="cell-sub"
                >共 {{ o.lines.reduce((n, l) => n + l.quantity, 0) }} 件</span
              >
            </td>
            <td>
              {{ o.contact.name
              }}<span class="cell-sub phone">{{ o.contact.phone }}</span>
            </td>
            <td>
              <span class="fulfillment">{{
                o.fulfillment === "delivery" ? "门店配送" : "到店自提"
              }}</span>
            </td>
            <td class="amount">¥{{ money(o.total) }}</td>
            <td>
              <span class="badge" :class="o.status">{{ statusLabel(o) }}</span>
            </td>
            <td class="align-right">
              <RouterLink class="text-button" :to="`/orders/${o.id}`"
                >查看详情 <span aria-hidden="true">→</span></RouterLink
              >
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
  <div class="hint-card">
    <Icon name="order" /><span
      >示例订单用于体验管理流程。待配送与待自提订单可在详情中确认完成。</span
    >
  </div>
</template>
