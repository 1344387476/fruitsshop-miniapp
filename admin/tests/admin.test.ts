import { describe, it, expect, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { reactive } from "vue";
import seed from "virtual:shop-seed";
import {
  createInitialState,
  parseMoney,
  money,
  statusLabel,
  clone,
} from "../src/domain";
import { createRepository } from "../src/repository";
import { createAdminService, type SessionStorage } from "../src/service";
import type { Product } from "../src/types";

function setup() {
  const factory = new IDBFactory(),
    data = new Map<string, string>(),
    name = crypto.randomUUID();
  const session: SessionStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
  const repo = createRepository(
    () => createInitialState(seed, 1800000000000),
    name,
    factory,
  );
  const service = createAdminService(repo, session);
  const login = () => service.login("admin", "demo123456");
  return { factory, name, repo, session, service, login };
}
const png = () =>
  new Blob(
    [
      new Uint8Array(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
          "base64",
        ),
      ),
    ],
    { type: "image/png" },
  );
function freshProduct(p: Product): Product {
  return { ...p, id: "", skus: p.skus.map((s) => ({ ...s, id: "" })) };
}

describe("金额和初始化", () => {
  it("元字符串精确转分，拒绝多余小数、负数、指数和不安全金额", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("12.8")).toBe(1280);
    expect(parseMoney(" 6 ")).toBe(600);
    expect(money(29)).toBe("0.29");
    for (const v of ["-1", "1.001", "1e3", "NaN", "", "999999999999999999999"])
      expect(() => parseMoney(v)).toThrow();
  });
  it("五种显示状态、商品快照及库存预占一致，取消订单不占库存", () => {
    const state = createInitialState(seed, 1800000000000);
    expect(state.orders.map(statusLabel)).toEqual([
      "待支付",
      "待配送",
      "待自提",
      "已完成",
      "已取消",
    ]);
    state.products.forEach((p) =>
      p.skus.forEach((s) => {
        const original = seed.skus.find((x) => x._id === s.id)!;
        const consumed = state.orders
          .filter((o) => o.status !== "cancelled")
          .flatMap((o) => o.lines)
          .filter((l) => l.skuId === s.id)
          .reduce((n, l) => n + l.quantity, 0);
        expect(s.stock).toBe(original.stock - consumed);
      }),
    );
    state.orders.forEach((o) => {
      expect(o.subtotal).toBe(
        o.lines.reduce((n, l) => n + l.price * l.quantity, 0),
      );
      expect(o.total).toBe(o.subtotal + o.deliveryFee);
      if (o.fulfillment === "pickup") expect(o.deliveryFee).toBe(0);
    });
  });
  it("重新打开已有数据库不会重新添加订单或覆盖商品", async () => {
    const t = setup();
    await t.login();
    const p = await t.service.product("p0");
    p.name = "已经修改";
    await t.service.saveProduct(p);
    const reopened = createRepository(
      () => {
        throw new Error("不应再次初始化");
      },
      t.name,
      t.factory,
    );
    expect(
      (await reopened.read()).products.find((p) => p.id === "p0")!.name,
    ).toBe("已经修改");
    expect((await reopened.read()).orders).toHaveLength(5);
  });
});

describe("会话与查询", () => {
  it("拒绝错误账号和未登录访问，退出不清空业务数据", async () => {
    const t = setup();
    await expect(t.service.products()).rejects.toThrow("登录");
    await expect(t.service.login("admin", "wrong")).rejects.toThrow(
      "账号或密码",
    );
    expect(t.service.authenticated()).toBe(false);
    await t.login();
    const p = await t.service.product("p0");
    p.name = "保留资料";
    await t.service.saveProduct(p);
    await t.service.logout();
    await expect(t.service.store()).rejects.toThrow("登录");
    await t.login();
    expect((await t.service.product("p0")).name).toBe("保留资料");
  });
  it("刷新使用同一会话，存储不可用时不产生成功登录", async () => {
    const t = setup();
    await t.login();
    expect(createAdminService(t.repo, t.session).authenticated()).toBe(true);
    const service = createAdminService(t.repo, {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {},
    });
    await expect(service.login("admin", "demo123456")).rejects.toThrow("会话");
    expect(service.authenticated()).toBe(false);
  });
  it("商品和订单可组合筛选，分页越界返回最后一页", async () => {
    const t = setup();
    await t.login();
    expect(
      (
        await t.service.products({
          keyword: "富士",
          categoryId: "c1",
          enabled: "true",
        })
      ).items.map((p) => p.id),
    ).toEqual(["p0"]);
    expect(
      (
        await t.service.orders({ status: "paid", fulfillment: "pickup" })
      ).items.map((o) => o.id),
    ).toEqual(["DEMO_1003"]);
    expect(
      (await t.service.orders({ keyword: "13800000002" })).items.map(
        (o) => o.id,
      ),
    ).toEqual(["DEMO_1002"]);
    expect((await t.service.orders({ keyword: "DEMO_1005" })).total).toBe(1);
    expect((await t.service.orders({ keyword: "不存在" })).total).toBe(0);
    await t.repo.change((s) => {
      const template = s.orders[0];
      s.orders = Array.from({ length: 45 }, (_, i) => ({
        ...template,
        id: "O" + i,
        createdAt: i,
      }));
    });
    const last = await t.service.orders({ page: 999 });
    expect(last).toMatchObject({ page: 3, pages: 3, total: 45 });
    expect(last.items).toHaveLength(5);
  });
});

describe("商品、规格和分类", () => {
  it("Vue 响应式表单能复制并保存为普通持久化记录", async () => {
    const t = setup();
    await t.login();
    const form = reactive(await t.service.product("p0"));
    form.name = "响应式表单商品";
    expect(clone(form.skus[0])).toEqual({ ...form.skus[0] });
    await t.service.saveProduct(clone(form));
    expect((await t.service.product("p0")).name).toBe("响应式表单商品");
  });
  it("新增默认下架，禁用分类和没有启用规格的商品不能上架", async () => {
    const t = setup();
    await t.login();
    const p = freshProduct(await t.service.product("p0"));
    p.skus.forEach((s) => {
      s.enabled = false;
    });
    const saved = await t.service.saveProduct(p);
    expect(saved.enabled).toBe(false);
    await expect(t.service.setProductEnabled(saved.id, true)).rejects.toThrow(
      "规格",
    );
    const category = await t.service.saveCategory({
      id: "",
      name: "停用分类",
      sort: 5,
      enabled: false,
    });
    saved.categoryId = category.id;
    saved.skus[0].enabled = true;
    await t.service.saveProduct(saved);
    await expect(t.service.setProductEnabled(saved.id, true)).rejects.toThrow(
      "分类",
    );
  });
  it("下架保留数据，资料保存与库存独立，零库存可显示售罄", async () => {
    const t = setup();
    await t.login();
    const stale = await t.service.product("p0"),
      stock = stale.skus[0];
    await t.service.setStock("p0", stock.id, 0, stock.stock);
    stale.name = "修改名称";
    await t.service.saveProduct(stale);
    expect((await t.service.product("p0")).skus[0].stock).toBe(0);
    await t.service.setProductEnabled("p0", false);
    expect(
      (await t.service.products({ enabled: "false" })).items.map((p) => p.id),
    ).toContain("p0");
  });
  it("并发库存调整只有一个按原库存成功，避免覆盖其他变更", async () => {
    const t = setup();
    await t.login();
    const p = await t.service.product("p0"),
      s = p.skus[0];
    const results = await Promise.allSettled([
      t.service.setStock(p.id, s.id, 12, s.stock),
      t.service.setStock(p.id, s.id, 15, s.stock),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    await expect(t.service.setStock(p.id, s.id, -1, 12)).rejects.toThrow(
      "整数",
    );
    await expect(t.service.setStock(p.id, s.id, 1.5, 12)).rejects.toThrow(
      "整数",
    );
  });
  it("规格不能移走、删除或重复，非法价格不提交", async () => {
    const t = setup();
    await t.login();
    const p = await t.service.product("p0");
    await expect(
      t.service.saveProduct({ ...p, skus: [p.skus[0]] }),
    ).rejects.toThrow("不能删除");
    await expect(
      t.service.saveProduct({ ...p, skus: [...p.skus, p.skus[0]] }),
    ).rejects.toThrow("重复");
    const foreign = await t.service.product("p1");
    await expect(
      t.service.saveProduct({ ...p, skus: [foreign.skus[0]] }),
    ).rejects.toThrow("不属于");
    p.skus[0].price = 0.1;
    await expect(t.service.saveProduct(p)).rejects.toThrow("整数");
    expect((await t.service.product("p0")).skus).toHaveLength(2);
  });
  it("分类改名同步商品，分类有上架商品时禁止停用", async () => {
    const t = setup();
    await t.login();
    const c = (await t.service.categories()).find((c) => c.id === "c1")!;
    await expect(
      t.service.saveCategory({ ...c, enabled: false }),
    ).rejects.toThrow("先下架");
    await t.service.saveCategory({ ...c, name: "苹果与梨" });
    expect((await t.service.product("p0")).category).toBe("苹果与梨");
    await t.service.setProductEnabled("p0", false);
    await t.service.setProductEnabled("p9", false);
    await t.service.saveCategory({ ...c, name: "苹果与梨", enabled: false });
    await expect(
      t.service.saveCategory({
        id: "",
        name: "苹果与梨",
        sort: 1,
        enabled: true,
      }),
    ).rejects.toThrow("同名");
  });
  it("上架商品不得停用最后一个规格，资料保持原状", async () => {
    const t = setup();
    await t.login();
    const p = await t.service.product("p0");
    p.skus.forEach((s) => {
      s.enabled = false;
    });
    await expect(t.service.saveProduct(p)).rejects.toThrow("至少启用");
    expect((await t.service.product("p0")).skus.every((s) => s.enabled)).toBe(
      true,
    );
  });
});

describe("订单和门店", () => {
  it("只完成已付款订单，重复完成幂等，不改变库存", async () => {
    const t = setup();
    await t.login();
    const stocks = (await t.repo.read()).products.map((p) => p.skus);
    await expect(t.service.completeOrder("DEMO_1001")).rejects.toThrow(
      "已付款",
    );
    await expect(t.service.completeOrder("DEMO_1005")).rejects.toThrow(
      "已付款",
    );
    const done = await t.service.completeOrder("DEMO_1002");
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeTypeOf("number");
    expect(await t.service.completeOrder(done.id)).toEqual(done);
    expect((await t.repo.read()).products.map((p) => p.skus)).toEqual(stocks);
  });
  it("改价、换图、分类名及配送费不影响历史订单快照", async () => {
    const t = setup();
    await t.login();
    const before = await t.service.order("DEMO_1001");
    const p = await t.service.product("p0");
    p.name = "新名字";
    p.skus[0].price = 999;
    p.image = 11;
    await t.service.saveProduct(p);
    await t.service.saveStore({
      ...(await t.service.store()),
      name: "新店名",
      deliveryFee: 900,
      phone: "",
    });
    expect(await t.service.order(before.id)).toEqual(before);
    expect((await t.service.store()).deliveryFee).toBe(900);
    await expect(
      t.service.saveStore({ ...(await t.service.store()), phone: "假号码" }),
    ).rejects.toThrow("有效");
  });
});

describe("图片与事务持久化", () => {
  it("不能覆盖已有上传图片，重复引用写入时商品修改也回滚", async () => {
    const t = setup();
    await t.login();
    const first = await t.service.product("p0");
    first.image = { kind: "upload", id: "immutable-image" };
    await t.service.saveProduct(first, png());
    const before = await t.repo.read();
    const original = await t.repo.image("immutable-image");
    const second = await t.service.product("p1");
    second.image = { kind: "upload", id: "immutable-image" };
    second.name = "不可提交的覆盖";
    await expect(
      t.service.saveProduct(
        second,
        new Blob(["changed"], { type: "image/png" }),
      ),
    ).rejects.toThrow("保存失败");
    expect(await t.repo.read()).toEqual(before);
    expect(
      await (await t.repo.image("immutable-image"))!.arrayBuffer(),
    ).toEqual(await original!.arrayBuffer());
  });
  it("数据库打开失败可以重试，不把失败当成空数据重置", async () => {
    const t = setup();
    const spy = vi.spyOn(t.factory, "open").mockImplementationOnce(() => {
      throw new Error("模拟存储不可用");
    });
    await expect(t.repo.read()).rejects.toThrow("存储不可用");
    spy.mockRestore();
    expect((await t.repo.read()).orders).toHaveLength(5);
    await t.repo.change((state) => {
      state.version = 99 as never;
    });
    const reopened = createRepository(
      () => {
        throw new Error("不应重置已有数据");
      },
      t.name,
      t.factory,
    );
    await expect(reopened.read()).rejects.toThrow("版本不兼容");
    await expect(reopened.change(() => undefined)).rejects.toThrow(
      "版本不兼容",
    );
  });
  it("Blob和商品一起保存，重新打开后可取回，换图保留旧图片引用", async () => {
    const t = setup();
    await t.login();
    const p = await t.service.product("p0");
    const blob = png();
    p.image = { kind: "upload", id: "upload-one" };
    await t.service.saveProduct(p, blob);
    const reopened = createAdminService(
      createRepository(
        () => {
          throw new Error("不可重置");
        },
        t.name,
        t.factory,
      ),
      t.session,
    );
    expect((await reopened.product(p.id)).image).toEqual(p.image);
    const restored = await reopened.image("upload-one");
    expect(await restored!.arrayBuffer()).toEqual(await blob.arrayBuffer());
    await t.repo.change((state) => {
      state.orders[0].lines[0].image = { kind: "upload", id: "upload-one" };
    });
    p.image = 2;
    await t.service.saveProduct(p);
    expect((await t.service.order("DEMO_1001")).lines[0].image).toEqual({
      kind: "upload",
      id: "upload-one",
    });
    expect(await reopened.image("upload-one")).toBeInstanceOf(Blob);
  });
  it("不接受超大、错误类型或缺失图片引用", async () => {
    const t = setup();
    await t.login();
    const p = await t.service.product("p0");
    p.image = { kind: "upload", id: "bad" };
    await expect(
      t.service.saveProduct(p, new Blob(["<svg/>"], { type: "image/svg+xml" })),
    ).rejects.toThrow("5 MB");
    await expect(
      t.service.saveProduct(
        p,
        new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }),
      ),
    ).rejects.toThrow("5 MB");
    await expect(t.service.saveProduct(p)).rejects.toThrow("不存在");
  });
  it("事务异常保留旧商品与订单，不添加未提交图片", async () => {
    const t = setup();
    await t.login();
    const before = await t.repo.read();
    await expect(
      t.repo.change(
        (state) => {
          state.products[0].name = "不应提交";
          state.orders[0].status = "completed";
          throw new Error("提交前失败");
        },
        [{ id: "orphan", blob: png() }],
      ),
    ).rejects.toThrow("提交前失败");
    expect(await t.repo.read()).toEqual(before);
    expect(await t.repo.image("orphan")).toBeUndefined();
  });
  it("写入状态遭遇配额错误时，已排队的图片写入也回滚", async () => {
    const t = setup();
    await t.login();
    const before = await t.repo.read(),
      p = await t.service.product("p0");
    p.image = { kind: "upload", id: "quota-image" };
    p.name = "不能保存";
    const original = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<typeof original>
      ) {
        if (this.name === "state")
          throw new DOMException("模拟配额不足", "QuotaExceededError");
        return original.apply(this, args);
      });
    try {
      await expect(t.service.saveProduct(p, png())).rejects.toThrow("配额不足");
    } finally {
      spy.mockRestore();
    }
    expect(await t.repo.read()).toEqual(before);
    expect(await t.repo.image("quota-image")).toBeUndefined();
  });
  it("并发修改不同资料在最新事务状态上合并，不覆盖另一次保存", async () => {
    const t = setup();
    await t.login();
    const p = await t.service.product("p0"),
      store = await t.service.store();
    p.name = "并发新名称";
    await Promise.all([
      t.service.saveProduct(p),
      t.service.saveStore({ ...store, hours: "10:00–22:00" }),
    ]);
    expect((await t.service.product("p0")).name).toBe("并发新名称");
    expect((await t.service.store()).hours).toBe("10:00–22:00");
  });
});
