<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import type { Store } from "../types";
import { adminService } from "../admin-service";
import { money, parseMoney, clone } from "../domain";
import { notify, errorMessage, merchantName } from "../ui";
import Feedback from "../components/Feedback.vue";
import Icon from "../components/Icon.vue";
const form = reactive<Store>({
  name: "",
  tagline: "",
  description: "",
  phone: "",
  address: "",
  hours: "",
  deliveryFee: 600,
  deliveryNote: "",
});
const fee = ref("6.00"),
  loading = ref(true),
  error = ref(""),
  busy = ref(false),
  saveError = ref("");
let initial = "";
const fingerprint = () => JSON.stringify({ form, fee: fee.value });
async function load() {
  loading.value = true;
  error.value = "";
  try {
    Object.assign(form, await adminService.store());
    fee.value = money(form.deliveryFee);
    initial = fingerprint();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function save() {
  busy.value = true;
  saveError.value = "";
  try {
    Object.assign(
      form,
      await adminService.saveStore({
        ...clone(form),
        deliveryFee: parseMoney(fee.value),
      }),
    );
    fee.value = money(form.deliveryFee);
    initial = fingerprint();
    merchantName.value = form.name;
    notify("商家信息已保存");
  } catch (e) {
    saveError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
onBeforeRouteLeave(() => {
  if (!adminService.authenticated()) return true;
  if (busy.value) return false;
  if (initial && fingerprint() !== initial)
    return window.confirm("商家信息有未保存的修改，确定离开？");
});
onMounted(load);
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">STORE SETTINGS</span>
      <h1>商家信息</h1>
      <p>维护门店资料与固定配送费。</p>
    </div>
  </div>
  <Feedback :error="error" :loading="loading" @retry="load" />
  <form v-if="!loading && !error" class="editor-form" @submit.prevent="save">
    <fieldset :disabled="busy">
      <div class="store-grid">
        <section class="panel padded">
          <h2>门店资料</h2>
          <div class="form-grid">
            <label class="field"
              >店名 <span class="required">*</span
              ><input v-model="form.name" required maxlength="50" /></label
            ><label class="field"
              >联系电话<input
                v-model="form.phone"
                inputmode="tel"
                maxlength="30"
                placeholder="手机号或座机号，可留空" /></label
            ><label class="field full"
              >门店标语<input v-model="form.tagline" maxlength="120" /></label
            ><label class="field full"
              >商家介绍<textarea
                v-model="form.description"
                rows="3"
                maxlength="1000"
              /></label
            ><label class="field full"
              >门店地址 <span class="required">*</span
              ><textarea
                v-model="form.address"
                rows="2"
                required
                maxlength="300"
              /></label
            ><label class="field full"
              >营业时间 <span class="required">*</span
              ><input
                v-model="form.hours"
                required
                maxlength="100"
                placeholder="例如：09:00–21:00"
            /></label>
          </div>
        </section>
        <div class="detail-side">
          <section class="panel padded">
            <h2>配送与自提</h2>
            <label class="field"
              >固定配送费（元）<input
                v-model="fee"
                required
                inputmode="decimal"
                placeholder="6.00" /></label
            ><label class="field"
              >配送说明<textarea
                v-model="form.deliveryNote"
                rows="4"
                maxlength="300"
              />
            </label>
            <div class="setting-note">
              <Icon name="store" />
              <div>
                <strong>到店自提免费</strong>
                <p>配送费修改不改变已有订单金额。</p>
              </div>
            </div>
          </section>
          <div class="hint-card">
            <span
              >未配置电话时，保留空值；门店地址与营业时间用于说明到店自提安排。</span
            >
          </div>
        </div>
      </div>
    </fieldset>
    <div class="form-footer">
      <p v-if="saveError" class="inline-error" role="alert">{{ saveError }}</p>
      <span v-else class="muted">本地保存，暂不影响小程序中的门店资料</span
      ><button class="btn primary" :disabled="busy">
        {{ busy ? "正在保存…" : "保存商家信息" }}
      </button>
    </div>
  </form>
</template>
