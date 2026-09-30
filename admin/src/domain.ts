import type { ImageRef, Order, RawSeed, State } from "./types";

// Domain records contain JSON values only (Blobs live in a separate store).
// JSON cloning also accepts Vue's reactive form proxies without leaking them into IndexedDB.
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function integer(value: number, name: string, min = 0) {
  assert(
    Number.isSafeInteger(value) && value >= min,
    `${name}必须是${min ? "正" : "非负"}整数`,
  );
  return value;
}
export function parseMoney(value: string): number {
  const text = value.trim();
  assert(/^\d{1,10}(\.\d{1,2})?$/.test(text), "金额须为非负数字，最多两位小数");
  const [whole, fraction = ""] = text.split(".");
  return integer(Number(whole) * 100 + Number(fraction.padEnd(2, "0")), "金额");
}
export const money = (value: number) =>
  `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
export function statusLabel(
  order: Pick<Order, "status" | "fulfillment">,
): string {
  return {
    pending: "待支付",
    paid: order.fulfillment === "delivery" ? "待配送" : "待自提",
    completed: "已完成",
    cancelled: "已取消",
  }[order.status];
}
export const dateTime = (time: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(time);
export function validImage(image: ImageRef) {
  if (typeof image === "number") integer(image, "图片索引");
  assert(
    typeof image === "number"
      ? image < 12
      : image?.kind === "upload" && !!image.id,
    "请选择商品图片",
  );
}
export function createInitialState(seed: RawSeed, now = Date.now()): State {
  const categories = seed.categories.map(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
  }));
  const products = seed.products.map(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
    skus: seed.skus
      .filter((s) => s.productId === _id)
      .map(({ _id: id, productId: _productId, ...sku }) => ({ id, ...sku })),
  }));
  const { _id: _storeId, ...store } = seed.settings[0];
  const statuses = [
    "pending",
    "paid",
    "paid",
    "completed",
    "cancelled",
  ] as const;
  const orders: Order[] = statuses.map((status, i) => {
    const p = products[i],
      sku = p.skus[0];
    const fulfillment = i === 2 || i === 3 ? "pickup" : "delivery";
    const createdAt = now - (i + 1) * 3600000;
    const deliveryFee = fulfillment === "delivery" ? store.deliveryFee : 0;
    // Seed prices represent starting stock; every non-cancelled order has already reserved it.
    if (status !== "cancelled") sku.stock -= 1;
    return {
      id: `DEMO_100${i + 1}`,
      status,
      fulfillment,
      createdAt,
      ...(status === "paid" || status === "completed"
        ? { paidAt: createdAt + 60000 }
        : {}),
      ...(status === "completed" ? { completedAt: createdAt + 1800000 } : {}),
      ...(status === "cancelled" ? { cancelledAt: createdAt + 120000 } : {}),
      contact: {
        name: [
          "陈女士（示例）",
          "李先生（示例）",
          "王女士（示例）",
          "刘先生（示例）",
          "赵女士（示例）",
        ][i],
        phone: `1380000000${i + 1}`,
        detail:
          fulfillment === "delivery" ? "示例小区 1 栋 101 室（演示地址）" : "",
      },
      note: "本地示例订单，仅供体验后台操作。",
      lines: [
        {
          productId: p.id,
          skuId: sku.id,
          name: p.name,
          spec: sku.label,
          image: clone(p.image),
          price: sku.price,
          quantity: 1,
        },
      ],
      subtotal: sku.price,
      deliveryFee,
      total: sku.price + deliveryFee,
    };
  });
  return clone({ version: 1, categories, products, orders, store });
}
