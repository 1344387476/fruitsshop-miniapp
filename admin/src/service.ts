import type { Repository } from "./repository";
import type {
  Category,
  OrderFilter,
  Page,
  Product,
  ProductFilter,
  State,
  Store,
} from "./types";
import { assert, clone, integer, validImage } from "./domain";

export const SESSION_KEY = "baiguoji-admin:session";
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const required = (value: string, label: string, max = 200) => {
  assert(
    typeof value === "string" && !!value.trim() && value.trim().length <= max,
    `${label}不能为空且不得超过${max}字`,
  );
  return value.trim();
};
const optional = (value: string, label: string, max = 1000) => {
  assert(
    typeof value === "string" && value.trim().length <= max,
    `${label}不得超过${max}字`,
  );
  return value.trim();
};
const newId = () => crypto.randomUUID();
function page<T>(items: T[], requested = 1): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / 20));
  const p = Math.min(Math.max(1, requested), pages);
  return {
    items: items.slice((p - 1) * 20, p * 20),
    total: items.length,
    page: p,
    pages,
  };
}

export function createAdminService(repo: Repository, session: SessionStorage) {
  function authenticated() {
    try {
      return session.getItem(SESSION_KEY) === "demo-admin";
    } catch {
      return false;
    }
  }
  function guard() {
    assert(authenticated(), "请先登录后台");
  }
  async function read() {
    guard();
    return repo.read();
  }
  async function change<T>(
    fn: (state: State) => T,
    images?: { id: string; blob: Blob }[],
  ) {
    guard();
    return repo.change(fn, images);
  }
  function product(state: State, id: string) {
    const p = state.products.find((p) => p.id === id);
    assert(p, "商品不存在，请刷新列表");
    return p;
  }
  function canEnable(state: State, p: Product) {
    assert(
      state.categories.some((c) => c.id === p.categoryId && c.enabled),
      "请先启用商品所属分类",
    );
    assert(
      p.skus.some((s) => s.enabled),
      "上架前至少启用一个规格",
    );
  }
  return {
    authenticated,
    async login(username: string, password: string) {
      assert(
        username.trim() === "admin" && password === "demo123456",
        "账号或密码不正确",
      );
      try {
        session.setItem(SESSION_KEY, "demo-admin");
      } catch {
        throw new Error("浏览器无法保存演示会话，请允许会话存储后重试");
      }
    },
    async logout() {
      session.removeItem(SESSION_KEY);
    },
    async categories() {
      return (await read()).categories.sort(
        (a, b) => a.sort - b.sort || a.id.localeCompare(b.id),
      );
    },
    async saveCategory(input: Category) {
      return change((state) => {
        const name = required(input.name, "分类名称", 30);
        integer(input.sort, "排序");
        assert(typeof input.enabled === "boolean", "分类状态无效");
        assert(
          !state.categories.some((c) => c.name === name && c.id !== input.id),
          "已有同名分类",
        );
        const old = state.categories.find((c) => c.id === input.id);
        assert(!input.id || old, "分类不存在");
        assert(
          input.enabled ||
            !state.products.some((p) => p.categoryId === input.id && p.enabled),
          "请先下架该分类中的商品再停用分类",
        );
        const next = {
          id: old?.id ?? newId(),
          name,
          sort: input.sort,
          enabled: input.enabled,
        };
        if (old) Object.assign(old, next);
        else state.categories.push(next);
        state.products
          .filter((p) => p.categoryId === next.id)
          .forEach((p) => {
            p.category = name;
          });
        return clone(next);
      });
    },
    async products(filter: ProductFilter = {}) {
      const state = await read(),
        q = filter.keyword?.trim() || "";
      return page(
        state.products.filter(
          (p) =>
            (!q || p.name.includes(q)) &&
            (!filter.categoryId || p.categoryId === filter.categoryId) &&
            (!filter.enabled || p.enabled === (filter.enabled === "true")),
        ),
        filter.page,
      );
    },
    async product(id: string) {
      return clone(product(await read(), id));
    },
    async saveProduct(input: Product, upload?: Blob) {
      guard();
      if (upload) {
        assert(
          ["image/jpeg", "image/png", "image/webp"].includes(upload.type) &&
            upload.size > 0 &&
            upload.size <= 5 * 1024 * 1024,
          "请上传 5 MB 以内的 JPEG、PNG 或 WebP 图片",
        );
        assert(
          typeof input.image !== "number" && input.image.kind === "upload",
          "上传图片引用无效",
        );
      }
      const uploads =
        upload && typeof input.image !== "number"
          ? [{ id: input.image.id, blob: upload }]
          : [];
      if (typeof input.image !== "number" && !upload)
        assert(await repo.image(input.image.id), "本地图片不存在，请重新选择");
      return change((state) => {
        const old = state.products.find((p) => p.id === input.id);
        assert(!input.id || old, "商品不存在");
        const category = state.categories.find(
          (c) => c.id === input.categoryId,
        );
        assert(category, "请选择有效分类");
        validImage(input.image);
        assert(
          Array.isArray(input.skus) &&
            input.skus.length > 0 &&
            input.skus.length <= 50,
          "请保留 1–50 个固定规格",
        );
        const next: Product = {
          id: old?.id ?? newId(),
          name: required(input.name, "商品名称", 80),
          subtitle: optional(input.subtitle, "简短说明", 120),
          categoryId: category.id,
          category: category.name,
          origin: optional(input.origin, "产地", 100),
          description: optional(input.description, "商品介绍"),
          storage: optional(input.storage, "保存说明", 300),
          image: clone(input.image),
          enabled: old?.enabled ?? false,
          skus: input.skus.map((s) => {
            assert(typeof s.enabled === "boolean", "规格状态无效");
            const existing = old?.skus.find((x) => x.id === s.id);
            assert(!s.id || existing, "规格不属于当前商品");
            return {
              id: existing?.id ?? newId(),
              label: required(s.label, "规格名称", 100),
              price: integer(s.price, "价格"),
              stock: existing ? existing.stock : integer(s.stock, "库存"),
              enabled: s.enabled,
            };
          }),
        };
        assert(
          new Set(next.skus.map((s) => s.id)).size === next.skus.length,
          "规格不能重复",
        );
        assert(
          !old || old.skus.every((s) => next.skus.some((n) => n.id === s.id)),
          "已有规格只能停用，不能删除",
        );
        if (next.enabled) canEnable(state, next);
        if (old) Object.assign(old, next);
        else state.products.unshift(next);
        return clone(next);
      }, uploads);
    },
    async setProductEnabled(id: string, enabled: boolean) {
      return change((state) => {
        assert(typeof enabled === "boolean", "商品状态无效");
        const p = product(state, id);
        if (enabled) canEnable(state, p);
        p.enabled = enabled;
        return clone(p);
      });
    },
    async setStock(
      productId: string,
      skuId: string,
      stock: number,
      expectedStock: number,
    ) {
      return change((state) => {
        const sku = product(state, productId).skus.find((s) => s.id === skuId);
        assert(sku, "规格不存在");
        integer(stock, "库存");
        assert(sku.stock === expectedStock, "库存已被更新，请刷新商品后重试");
        sku.stock = stock;
        return clone(sku);
      });
    },
    async orders(filter: OrderFilter = {}) {
      const q = filter.keyword?.trim() || "";
      return page(
        (await read()).orders
          .filter(
            (o) =>
              (!q || o.id.includes(q) || o.contact.phone.includes(q)) &&
              (!filter.status || o.status === filter.status) &&
              (!filter.fulfillment || o.fulfillment === filter.fulfillment),
          )
          .sort(
            (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
          ),
        filter.page,
      );
    },
    async order(id: string) {
      const order = (await read()).orders.find((o) => o.id === id);
      assert(order, "订单不存在，请返回列表");
      return clone(order);
    },
    async completeOrder(id: string) {
      return change((state) => {
        const o = state.orders.find((o) => o.id === id);
        assert(o, "订单不存在");
        if (o.status === "completed") return clone(o);
        assert(o.status === "paid", "只有已付款订单才能确认完成");
        o.status = "completed";
        o.completedAt = Date.now();
        return clone(o);
      });
    },
    async store() {
      return (await read()).store;
    },
    async saveStore(input: Store) {
      return change((state) => {
        const phone = optional(input.phone, "联系电话", 30);
        assert(
          !phone || /^(1[3-9]\d{9}|(?:0\d{2,3}-?)?\d{7,8})$/.test(phone),
          "请填写有效的手机号或座机号，未配置可留空",
        );
        state.store = {
          name: required(input.name, "店名", 50),
          tagline: optional(input.tagline, "标语", 120),
          description: optional(input.description, "商家介绍"),
          phone,
          address: required(input.address, "门店地址", 300),
          hours: required(input.hours, "营业时间", 100),
          deliveryFee: integer(input.deliveryFee, "配送费"),
          deliveryNote: optional(input.deliveryNote, "配送说明", 300),
        };
        return clone(state.store);
      });
    },
    async image(id: string) {
      guard();
      return repo.image(id);
    },
  };
}
