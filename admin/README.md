# 百果集 · 商家后台

独立网页后台第一版，Vue 3 + TypeScript + Vite。支持单店演示登录、商品分类、商品上下架、固定规格和可售库存、订单查询与确认完成、商家信息编辑。页面统一通过 `src/admin-service.ts` 调用本地服务。

## 启动

后台依赖独立安装，不参与小程序 npm 构建。使用 Node.js `^20.19.0 || >=22.12.0`，本次验证为 Node.js 24.13.0。

```powershell
cd G:\miniapp\fruitshop\admin
npm ci --cache G:\miniapp\fruitshop\.npm-cache
npm run dev
```

打开 [http://localhost:5173/](http://localhost:5173/)。公开演示账号：`admin`；演示密码：`demo123456`。登录后进入订单列表。

生产构建与本地预览：

```powershell
npm run build
npm run preview
```

开发和预览都固定在 `localhost:5173`，且占用端口时直接报错。两者不可同时运行；在原终端按 Ctrl+C 结束一个，再启动另一个。不要改成 `127.0.0.1` 或另一个端口来共享原有数据，它们属于不同浏览器来源。

## 演示数据与操作

- 首次登录读取数据时，在独立 IndexedDB 数据库 `baiguoji-admin-demo` 中初始化 12 款商品、24 个规格、5 个分类、门店配置及 5 笔示例订单。初始商品资料在构建期读取项目的纯 `seedData()`，订单与预占库存一起初始化。
- 示例订单包括待支付、待配送、待自提、已完成、已取消。联系人、手机号和地址都是演示内容。只有已付款订单可以确认配送完成或顾客已取货；完成不再次扣库存。
- 新增商品默认下架，保存后在列表中上架。商品须属于启用分类，且至少有一个启用规格；零库存商品仍可显示上架与售罄。分类有上架商品时不能停用。既有商品、分类和规格保留稳定 ID，通过停用保留记录。
- 规格价格输入元金额，最多两位小数，按整数分保存。已有规格库存通过“调整库存”单独保存，商品资料编辑不会覆盖它。库存表示已扣除订单预占后的可售数量。
- 现有水果图使用项目 4×3 图集。上传支持 JPEG、PNG、WebP，最大 5 MB，并在页面检查实际可解码。上传图片以 Blob 存在浏览器中，商品只保存图片 ID，不保存临时 `blob:` URL；商品和新图片共同提交，失败时回滚。
- 订单展示历史快照。改价、分类改名、换图及修改配送费不改变旧订单。已有图片引用不可覆盖，第一版不清理可能被历史订单引用的图片。
- 会话保存在 `sessionStorage`：当前标签页刷新后保留，退出时移除。业务数据和图片保留在当前浏览器来源下，重启页面或重新登录不重置数据；浏览器自行清理站点存储会影响本地演示数据。

后台使用独立存储，不读取或覆盖小程序的 `fruitshop:v1`，不与小程序、云函数或其他设备同步。公开演示登录和页面守卫仅用于体验流程，不属于生产身份认证。未接入云开发或真实支付。

## Netlify 部署

2026-09-30 已发布到 [百果集后台](https://baiguoji-admin.netlify.app/)，当前保留 Netlify 团队登录访问保护，进入网站后再使用演示账号。部署记录见 [Netlify 控制台](https://app.netlify.com/projects/baiguoji-admin/deploys/6abcb5c9c5fc77b9a610b1b0)。

根目录 `netlify.toml` 指定构建目录 `admin`、命令 `npm run build`、发布目录 `dist` 和 Node.js 24。只上传后台静态构建产物，不部署项目的微信云函数。当前采用手动上传，没有连接 Git 自动发布。

网站与 localhost 属于不同浏览器来源，会分别初始化和保存演示数据；本地数据不随发布迁移，网站各浏览器的数据也互不共享。后续本地构建完成后，在根目录使用已登录的 Netlify CLI 更新同一站点：

```powershell
.\.netlify\cli\node_modules\.bin\netlify.cmd deploy --site a2c91dc7-6fc3-4777-a617-b3c31b3e40b5 --dir G:\miniapp\fruitshop\admin\dist --no-build --prod
```

## 检查

```powershell
npm run check
```

运行后台类型检查、22 项业务/持久化测试和生产构建。现有小程序检查在项目根目录运行 `npm run check`。

真实浏览器检查需要根目录已安装的 `playwright-core` 和 `sharp`，先启动本地预览，再在另一个终端运行：

```powershell
npm run test:browser
```

默认使用本机 Chrome：`C:/Program Files/Google/Chrome/Application/chrome.exe`，可通过 `ADMIN_BROWSER_PATH` 指定另一个 Chromium 可执行文件。测试使用隔离浏览器上下文，不使用或修改用户 Chrome 资料与已有后台数据。截图与结果位于 `../artifacts/admin-review-2026-09-30/`。

验证包括桌面 1440×1000、手机宽度 390×844，登录、筛选、上传与刷新恢复、存储失败回滚、上下架、分类约束、订单完成及退出。截图是网页后台证据，不替代微信小程序模拟器验收。真实手机键盘、Safari、云端身份与存储、跨设备同步尚未验证。

## 后续接入

保留页面对异步 `adminService` 的调用，在服务适配入口替换本地实现。现有 `shop-api` 只提供微信顾客接口，不能直接用来执行管理写操作；上线阶段需另行实现管理身份、服务端权限、商品与库存事务、全店订单及云存储图片适配。当前后台的本地上传引用也不能直接传给仍使用数字图集索引的小程序。

第三方依赖和水果图来源见项目 `THIRD_PARTY_NOTICES.md`，依赖许可证随各 npm 包保留。
