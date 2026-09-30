<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import type { Order } from "../types";
import { adminService } from "../admin-service";
import { money, statusLabel, dateTime } from "../domain";
import { notify, errorMessage } from "../ui";
import FruitImage from "../components/FruitImage.vue";
import Feedback from "../components/Feedback.vue";
import Modal from "../components/Modal.vue";
import Icon from "../components/Icon.vue";
const route = useRoute(),
  order = ref<Order>(),
  loading = ref(true),
  error = ref(""),
  confirming = ref(false),
  busy = ref(false),
  saveError = ref("");
async function load() {
  loading.value = true;
  error.value = "";
  try {
    order.value = await adminService.order(String(route.params.id));
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function complete() {
  busy.value = true;
  saveError.value = "";
  try {
    order.value = await adminService.completeOrder(order.value!.id);
    confirming.value = false;
    notify("订单已完成");
  } catch (e) {
    saveError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <RouterLink to="/orders" class="back-link"
    ><Icon name="arrow" />返回订单列表</RouterLink
  >
  <Feedback :loading="loading" :error="error" @retry="load" />
  <template v-if="order && !loading && !error">
    <div class="page-heading">
      <div>
        <span class="eyebrow">ORDER DETAIL</span>
        <h1>
          订单详情
          <span class="badge" :class="order.status">{{
            statusLabel(order)
          }}</span>
        </h1>
        <p>{{ order.id }} · {{ dateTime(order.createdAt) }}</p>
      </div>
      <button
        v-if="order.status === 'paid'"
        class="btn primary"
        @click="
          confirming = true;
          saveError = '';
        "
      >
        {{
          order.fulfillment === "delivery" ? "确认配送完成" : "确认顾客已取货"
        }}
      </button>
    </div>
    <div class="detail-grid">
      <section class="panel">
        <div class="panel-title">
          <h2>商品明细</h2>
          <span class="muted">下单时快照</span>
        </div>
        <div v-for="line in order.lines" :key="line.skuId" class="order-line">
          <FruitImage :image="line.image" :label="line.name" />
          <div class="line-description">
            <strong>{{ line.name }}</strong
            ><span class="muted">{{ line.spec }}</span
            ><span class="muted"
              >¥{{ money(line.price) }} × {{ line.quantity }}</span
            >
          </div>
          <strong class="amount"
            >¥{{ money(line.price * line.quantity) }}</strong
          >
        </div>
        <div class="order-totals">
          <div>
            <span>商品金额</span><span>¥{{ money(order.subtotal) }}</span>
          </div>
          <div>
            <span>配送费</span
            ><span>{{
              order.fulfillment === "pickup"
                ? "自提免费"
                : `¥${money(order.deliveryFee)}`
            }}</span>
          </div>
          <div class="total">
            <span>订单总额</span><strong>¥{{ money(order.total) }}</strong>
          </div>
        </div>
      </section>
      <div class="detail-side">
        <section class="panel padded">
          <h2>履约信息</h2>
          <dl class="info-list">
            <dt>方式</dt>
            <dd>
              {{ order.fulfillment === "delivery" ? "门店配送" : "到店自提" }}
            </dd>
            <dt>联系人</dt>
            <dd>{{ order.contact.name }}</dd>
            <dt>手机号</dt>
            <dd class="phone">{{ order.contact.phone }}</dd>
            <template v-if="order.fulfillment === 'delivery'"
              ><dt>收货地址</dt>
              <dd>{{ order.contact.detail }}</dd></template
            >
            <dt>顾客备注</dt>
            <dd>{{ order.note || "无备注" }}</dd>
          </dl>
        </section>
        <section class="panel padded">
          <h2>订单记录</h2>
          <ol class="timeline">
            <li>
              <span>下单</span><time>{{ dateTime(order.createdAt) }}</time>
            </li>
            <li v-if="order.paidAt">
              <span>模拟付款</span><time>{{ dateTime(order.paidAt) }}</time>
            </li>
            <li v-if="order.completedAt">
              <span>订单完成</span
              ><time>{{ dateTime(order.completedAt) }}</time>
            </li>
            <li v-if="order.cancelledAt">
              <span>订单取消</span
              ><time>{{ dateTime(order.cancelledAt) }}</time>
            </li>
          </ol>
        </section>
      </div>
    </div>
    <Modal
      v-if="confirming"
      title="确认订单完成"
      :busy="busy"
      @close="confirming = false"
      ><p>
        {{
          order.fulfillment === "delivery"
            ? "请确认商品已配送完成。"
            : "请确认顾客已到店取货。"
        }}完成后该订单将显示为“已完成”。
      </p>
      <p class="muted">订单 {{ order.id }}</p>
      <p v-if="saveError" class="inline-error" role="alert">{{ saveError }}</p>
      <div class="modal-actions">
        <button class="btn" :disabled="busy" @click="confirming = false">
          暂不完成</button
        ><button class="btn primary" :disabled="busy" @click="complete">
          {{ busy ? "正在保存…" : "确认完成" }}
        </button>
      </div></Modal
    >
  </template>
</template>
