<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { adminService } from "../admin-service";
import { errorMessage } from "../ui";
const router = useRouter(),
  username = ref(""),
  password = ref(""),
  busy = ref(false),
  error = ref("");
async function login() {
  error.value = "";
  busy.value = true;
  try {
    await adminService.login(username.value, password.value);
    await router.replace("/orders");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <main class="login-page">
    <div class="login-brand">
      <span class="brand-mark"><i /></span><strong>百果集</strong
      ><span>把新鲜，带回日常。</span>
    </div>
    <section class="login-card">
      <span class="eyebrow">商家管理后台</span>
      <h1>欢迎回来</h1>
      <p class="muted">从这里，开始一天的经营。</p>
      <form @submit.prevent="login">
        <label class="field"
          >账号<input
            v-model="username"
            name="username"
            autocomplete="username"
            placeholder="请输入演示账号"
            required
            :disabled="busy"
        /></label>
        <label class="field"
          >密码<input
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入演示密码"
            required
            :disabled="busy"
        /></label>
        <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
        <button class="btn primary login-submit" :disabled="busy">
          {{ busy ? "正在登录…" : "登录后台" }}
        </button>
      </form>
      <div class="demo-account">
        <span class="demo-tag">演示账号</span>
        <div>
          <span>账号 <code>admin</code></span
          ><span>密码 <code>demo123456</code></span>
        </div>
      </div>
    </section>
    <p class="login-note">
      本地演示，未同步小程序或云端<br />公开账号仅用于体验登录流程
    </p>
  </main>
</template>
