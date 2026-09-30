<script setup lang="ts">
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { adminService } from "./admin-service";
import { toast, notify, errorMessage, merchantName } from "./ui";
import Icon from "./components/Icon.vue";
const route = useRoute(),
  router = useRouter(),
  name = merchantName;
watch(
  () => route.fullPath,
  async () => {
    document.title = `${route.meta.title || "商家后台"} · 百果集`;
    if (route.meta.public) return;
    try {
      name.value = (await adminService.store()).name;
    } catch {
      /* the page presents storage failures with a retry */
    }
  },
  { immediate: true },
);
async function logout() {
  try {
    await adminService.logout();
    await router.replace("/login");
  } catch (error) {
    notify(errorMessage(error), "error");
  }
}
</script>
<template>
  <RouterView v-if="route.meta.public" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/orders" class="brand"
        ><span class="brand-mark"><i /></span
        ><span
          ><strong>{{ name }}</strong
          ><small>商家管理后台</small></span
        ></RouterLink
      >
      <div class="nav-caption">日常经营</div>
      <nav aria-label="后台导航">
        <RouterLink
          to="/orders"
          :class="{ active: route.path.startsWith('/orders') }"
          ><Icon name="order" /><span>订单管理</span></RouterLink
        >
        <RouterLink
          to="/products"
          :class="{ active: route.path.startsWith('/products') }"
          ><Icon name="product" /><span>商品管理</span></RouterLink
        >
        <RouterLink to="/store" :class="{ active: route.path === '/store' }"
          ><Icon name="store" /><span>商家信息</span></RouterLink
        >
      </nav>
      <div class="sidebar-foot"><span class="status-dot" />单店 · 本地演示</div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span
          >{{ name }} <span class="crumb">/</span> {{ route.meta.title }}</span
        >
        <div class="account">
          <span class="avatar">店</span><span>演示管理员</span
          ><button class="text-button" @click="logout">
            <Icon name="logout" />退出
          </button>
        </div>
      </header>
      <div class="demo-banner">
        <span class="demo-tag">演示模式</span
        ><span>本地演示，未同步小程序或云端</span>
      </div>
      <main class="main"><RouterView :key="route.path" /></main>
      <footer class="workspace-foot">
        把新鲜，带回日常。<span>百果集 · 商家后台</span>
      </footer>
    </div>
  </div>
  <div
    v-if="toast.message"
    class="toast"
    :class="toast.kind"
    role="status"
    aria-live="polite"
  >
    <span>{{ toast.kind === "success" ? "✓" : "!" }}</span
    >{{ toast.message
    }}<button @click="toast.message = ''" aria-label="关闭提示">×</button>
  </div>
</template>
