import { createRouter, createWebHashHistory } from "vue-router";
import { adminService } from "./admin-service";
import Login from "./views/Login.vue";
import Orders from "./views/Orders.vue";
import OrderDetail from "./views/OrderDetail.vue";
import Products from "./views/Products.vue";
import ProductEdit from "./views/ProductEdit.vue";
import Store from "./views/Store.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/login",
      component: Login,
      meta: { public: true, title: "商家登录" },
    },
    { path: "/", redirect: "/orders" },
    { path: "/orders", component: Orders, meta: { title: "订单管理" } },
    {
      path: "/orders/:id",
      component: OrderDetail,
      meta: { title: "订单详情" },
    },
    { path: "/products", component: Products, meta: { title: "商品管理" } },
    {
      path: "/products/new",
      component: ProductEdit,
      meta: { title: "新增商品" },
    },
    {
      path: "/products/:id",
      component: ProductEdit,
      meta: { title: "编辑商品" },
    },
    { path: "/store", component: Store, meta: { title: "商家信息" } },
    { path: "/:pathMatch(.*)*", redirect: "/orders" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
router.beforeEach((to) => {
  if (!to.meta.public && !adminService.authenticated()) return "/login";
  if (to.path === "/login" && adminService.authenticated()) return "/orders";
});
