// Run against the real admin preview. A fresh browser context never uses the user's profile/data.
const { chromium } = require("../../node_modules/playwright-core");
const sharp = require("../../node_modules/sharp");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const out = path.resolve(__dirname, "../../artifacts/admin-review-2026-09-30");
const executablePath =
  process.env.ADMIN_BROWSER_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = "http://localhost:5173/";

async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  const errors = [],
    checks = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("dialog", (dialog) => dialog.accept());
  page.setDefaultTimeout(10000);
  const visible = async (text) => {
    await page.getByText(text).first().waitFor({ state: "visible" });
  };
  const heading = async (text) => {
    await page.locator(".page-heading h1").filter({ hasText: text }).waitFor();
  };
  const snap = async (name) => {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({
      path: path.join(out, name + ".png"),
      fullPage: true,
    });
  };
  const check = (text) => {
    checks.push(text);
    console.log("PASS " + text);
  };
  const state = () =>
    page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("baiguoji-admin-demo", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return new Promise((resolve, reject) => {
        const tx = db.transaction("state", "readonly"),
          r = tx.objectStore("state").get("current");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        tx.oncomplete = () => db.close();
      });
    });
  const imageCount = () =>
    page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open("baiguoji-admin-demo", 1);
        r.onsuccess = () => resolve(r.result);
      });
      return new Promise((resolve) => {
        const tx = db.transaction("images", "readonly"),
          r = tx.objectStore("images").count();
        r.onsuccess = () => resolve(r.result);
        tx.oncomplete = () => db.close();
      });
    });
  const noOverflow = async (label) => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      label + " body overflow",
    );
  };
  async function login() {
    await page.getByLabel("账号", { exact: true }).fill("admin");
    await page.getByLabel("密码", { exact: true }).fill("demo123456");
    await page.getByRole("button", { name: "登录后台", exact: true }).click();
    await heading("订单管理");
    await page.locator("tbody tr").first().waitFor();
  }
  try {
    await page.goto(base + "#/orders");
    await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
    assert.ok(page.url().endsWith("#/login"));
    await snap("desktop-login");
    await page.getByLabel("账号", { exact: true }).fill("admin");
    await page.getByLabel("密码", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "登录后台", exact: true }).click();
    await visible("账号或密码不正确");
    await login();
    assert.equal(await page.locator("tbody tr").count(), 5);
    await snap("desktop-orders");
    check("未登录路由守卫、错误登录、正确登录和五种示例订单");
    await page.getByLabel("订单状态").selectOption("paid");
    await page.getByLabel("履约方式").selectOption("pickup");
    await page.waitForFunction(
      () => document.querySelectorAll("tbody tr").length === 1,
    );
    assert.match(await page.locator("tbody").innerText(), /待自提/);
    await page.getByRole("button", { name: "重置筛选" }).click();
    await page.getByLabel("搜索订单").fill("13800000002");
    await page.getByRole("button", { name: "查询", exact: true }).click();
    await page.getByRole("link", { name: "DEMO_1002", exact: true }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 1);
    check("状态/自提组合筛选、手机号搜索与重置");
    const before = await state();
    await page.getByRole("link", { name: "DEMO_1002", exact: true }).click();
    await heading("订单详情");
    await page.getByRole("button", { name: "确认配送完成" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认完成", exact: true })
      .click();
    await page.locator(".page-heading .badge.completed").waitFor();
    const after = await state();
    assert.deepEqual(after.products, before.products);
    assert.equal(
      after.orders.find((o) => o.id === "DEMO_1002").status,
      "completed",
    );
    assert.equal(
      await page.getByRole("button", { name: "确认配送完成" }).count(),
      0,
    );
    await snap("desktop-order-detail");
    check("订单完成真实点击，状态更新且库存不再次扣减");

    await page.getByRole("link", { name: "商品管理", exact: true }).click();
    await heading("商品管理");
    await page.locator("tbody tr").first().waitFor();
    assert.equal(await page.locator("tbody tr").count(), 12);
    await snap("desktop-products");
    await page.getByRole("link", { name: "脆甜红富士", exact: true }).click();
    await heading("编辑商品");
    await page
      .getByRole("button", { name: "调整库存", exact: true })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("可售库存", { exact: true })
      .fill("0");
    await page.getByRole("button", { name: "保存库存", exact: true }).click();
    await visible("可售库存已更新");
    const longName = "脆甜红富士 · 长商品名称测试：门店新鲜挑选的日常水果";
    await page.getByRole("textbox", { name: /^商品名称/ }).fill(longName);
    await page
      .locator(".sku-row")
      .nth(1)
      .getByLabel("启用", { exact: true })
      .uncheck();
    await page.locator("input[type=file]").setInputFiles({
      name: "damaged.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
    await visible("图片损坏或无法读取，请换一张图片");
    check("本地上传损坏图片被拦截，保留商品编辑内容");
    const uploadBuffer = await sharp({
      create: { width: 180, height: 180, channels: 3, background: "#dd7948" },
    })
      .png()
      .toBuffer();
    await page.locator("input[type=file]").setInputFiles({
      name: "demo-fruit.png",
      mimeType: "image/png",
      buffer: uploadBuffer,
    });
    await page.locator(".image-preview img.uploaded-image").waitFor();
    await snap("desktop-product-editor");
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      window.__qaFailWrite = true;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "state" && window.__qaFailWrite)
          throw new DOMException("模拟存储配额不足", "QuotaExceededError");
        return original.apply(this, args);
      };
    });
    await page.getByRole("button", { name: "保存商品", exact: true }).click();
    await visible("模拟存储配额不足");
    assert.equal(
      (await state()).products.find((p) => p.id === "p0").name,
      "脆甜红富士",
    );
    assert.equal(await imageCount(), 0);
    assert.equal(
      await page.getByRole("textbox", { name: /^商品名称/ }).inputValue(),
      longName,
    );
    await snap("desktop-storage-failure");
    check("真实 IndexedDB 写入失败：图片和商品共同回滚，表单保留");
    await page.evaluate(() => {
      window.__qaFailWrite = false;
    });
    await page.getByRole("button", { name: "保存商品", exact: true }).click();
    await heading("商品管理");
    const edited = page.locator("tbody tr").filter({ hasText: longName });
    await edited.waitFor();
    assert.match(await edited.innerText(), /售罄/);
    assert.equal(await imageCount(), 1);
    await page.reload();
    await page.getByRole("link", { name: longName, exact: true }).waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector("img.uploaded-image");
      return img?.complete && img.naturalWidth > 0;
    });
    assert.equal(
      (await state()).orders.find((o) => o.id === "DEMO_1001").lines[0].name,
      "脆甜红富士",
    );
    check("保存与刷新恢复上传图片、规格停用、售罄以及历史快照");

    await page.getByRole("button", { name: "管理分类", exact: true }).click();
    const categoryDialog = page.getByRole("dialog");
    await categoryDialog
      .getByLabel("分类名称", { exact: true })
      .fill("后台验证分类");
    await categoryDialog.getByLabel("排序", { exact: true }).fill("5");
    await categoryDialog.getByRole("button", { name: "保存分类" }).click();
    await visible("分类已保存");
    await categoryDialog
      .locator(".category-row")
      .filter({ hasText: "苹果梨类" })
      .getByRole("button", { name: "编辑", exact: true })
      .click();
    await categoryDialog.getByLabel("启用此分类").uncheck();
    await categoryDialog.getByRole("button", { name: "保存分类" }).click();
    await visible("请先下架该分类中的商品再停用分类");
    await categoryDialog.getByRole("button", { name: "关闭弹窗" }).click();
    check("分类新增真实点击，有关联上架商品时阻止停用");

    await page.getByRole("link", { name: "新增商品", exact: true }).click();
    await heading("新增商品");
    const newName = "本地上架演示 · 蜜甜橙";
    await page.getByRole("button", { name: "新增规格", exact: true }).click();
    assert.equal(await page.locator(".sku-row").count(), 2);
    await page
      .locator(".sku-row")
      .nth(1)
      .getByRole("button", { name: "取消新增", exact: true })
      .click();
    assert.equal(await page.locator(".sku-row").count(), 1);
    await page.getByRole("textbox", { name: /^商品名称/ }).fill(newName);
    await page.getByLabel(/规格名称/).fill("500g / 份");
    await page.getByLabel("售价（元）", { exact: true }).fill("0.29");
    await page.getByLabel("初始库存").fill("3");
    await page.getByRole("button", { name: "保存商品", exact: true }).click();
    await heading("商品管理");
    const newRow = page.locator("tbody tr").filter({ hasText: newName });
    await newRow.waitFor();
    assert.match(await newRow.innerText(), /已下架/);
    await newRow.getByRole("button", { name: "上架", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认", exact: true })
      .click();
    await newRow.locator(".badge.completed").waitFor();
    assert.equal(
      (await state()).products.find((p) => p.name === newName).skus[0].price,
      29,
    );
    await newRow.getByRole("button", { name: "下架", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认", exact: true })
      .click();
    await newRow.locator(".badge.cancelled").waitFor();
    check("新增商品默认下架，整数分定价与上架/下架真实点击");

    await page.getByRole("link", { name: "商家信息", exact: true }).click();
    await heading("商家信息");
    await page.getByLabel(/^店名/).fill("百果集（演示门店）");
    await page.getByLabel("固定配送费（元）").fill("9.50");
    await page
      .getByLabel(/门店地址/)
      .fill(
        "示例街道与演示社区的较长门店地址，仅用于检查后台表单在手机宽度下的换行显示",
      );
    await page.getByRole("button", { name: "保存商家信息" }).click();
    await visible("商家信息已保存");
    assert.equal(
      await page.locator(".sidebar .brand strong").innerText(),
      "百果集（演示门店）",
    );
    await page.reload();
    await heading("商家信息");
    await page.getByLabel("固定配送费（元）").waitFor();
    assert.equal(
      await page.getByLabel("固定配送费（元）").inputValue(),
      "9.50",
    );
    assert.equal(
      (await state()).orders.find((o) => o.id === "DEMO_1001").deliveryFee,
      600,
    );
    await snap("desktop-store");
    check("商家信息保存刷新恢复，配送费不改历史订单");

    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
    await page.goto(base + "#/products");
    await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
    await login();
    await page.getByRole("link", { name: "商品管理", exact: true }).click();
    await heading("商品管理");
    await page.getByRole("link", { name: longName, exact: true }).waitFor();
    assert.equal(await imageCount(), 1);
    check("退出撤销访问，重新登录保留业务数据和图片");

    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow("mobile products");
    await snap("mobile-products");
    await page.getByRole("link", { name: longName, exact: true }).click();
    await heading("编辑商品");
    await page.locator(".image-preview img.uploaded-image").waitFor();
    await noOverflow("mobile editor");
    await snap("mobile-product-editor");
    await page.getByRole("link", { name: "订单管理", exact: true }).click();
    await heading("订单管理");
    await page.locator("tbody tr").first().waitFor();
    await noOverflow("mobile orders");
    await snap("mobile-orders");
    await page.getByRole("link", { name: "DEMO_1003", exact: true }).click();
    await heading("订单详情");
    await noOverflow("mobile detail");
    await snap("mobile-order-detail");
    await page.getByRole("button", { name: "确认顾客已取货" }).click();
    await noOverflow("mobile completion modal");
    await snap("mobile-completion-modal");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认完成", exact: true })
      .click();
    await page.locator(".page-heading .badge.completed").waitFor();
    await page.getByRole("link", { name: "商家信息", exact: true }).click();
    await heading("商家信息");
    await page.getByLabel(/门店地址/).waitFor();
    await noOverflow("mobile store");
    await snap("mobile-store");
    check(
      "390×844 手机布局无页面水平溢出，图片/表单/详情/弹窗可用，自提完成真实点击",
    );
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
    await noOverflow("mobile login");
    await snap("mobile-login");
    assert.deepEqual(errors, []);
    const report = {
      date: "2026-09-30",
      target: "独立网页后台（不是小程序模拟器）",
      url: base,
      desktop: [1440, 1000],
      mobile: [390, 844],
      isolatedContext: true,
      checks,
      errors,
    };
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(`Browser checks passed: ${checks.length}. Screenshots: ${out}`);
  } catch (error) {
    await snap("failure").catch(() => {});
    fs.writeFileSync(
      path.join(out, "failure.json"),
      JSON.stringify({ message: error.message, errors, checks }, null, 2) +
        "\n",
    );
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
