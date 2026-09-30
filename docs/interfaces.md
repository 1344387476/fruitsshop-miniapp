# 服务接口与后续接入

所有页面从 `services/shop.ts` 获取数据，当前为 Promise 封装的本地服务。接口说明描述能力，不绑定最终 HTTP 路径。

| 服务 | 输入与返回 |
| --- | --- |
| catalog / product | 商品列表 / 按商品 id 查询；返回固定规格、整数分价格、可用库存 |
| cart / addCart / updateCart / selectCart / removeCart | SKU、数量、勾选状态；按 SKU 合并 |
| addresses / saveAddress / deleteAddress | 收货人、手机号、完整地址、默认地址 |
| quote | SKU 与数量数组、delivery 或 pickup；返回商品行、商品额、运费、实付额 |
| createOrder | 幂等 token、商品行、履约方式、地址 id 或自提联系人、备注、是否来自购物车 |
| orders / getOrder | 当前顾客订单列表 / 订单快照 |
| pay | 演示专用 success、fail、cancel；真实接入替换为后端预支付 + 微信支付 + 服务端状态确认 |
| cancelOrder | 只接受待支付订单；释放预占库存 |
| completeOrder / resetDemo | 仅供本地演示，不能映射为无鉴权顾客 API |

## 最小数据约定

`Product` 包含分类、名称、介绍、产地、图片、存储说明和 SKU。SKU 包含 id、规格文本、价格（分）、库存（整数）。

`Order` 保存订单号、创建时间、四种状态、履约方式、联系人快照、商品快照、备注、商品额、配送费和总金额。历史订单不读取当前商品价格或现有地址作为展示依据。

状态：`pending → paid → completed`；`pending → cancelled`。paid 展示为“待配送”或“待自提”。真实退款与履约异常本版不实现。

`createOrder` 对同一 token 重复请求返回同一订单。前端按钮同时禁用防连点。本地提交作为同步事务落盘，存储失败回滚；这不能替代真实后端事务、并发锁和支付回调幂等。

## 后台边界

需要管理分类、商品规格与库存、订单、门店配置。门店仅需查看待配送/待自提订单和标记完成。本版不需要会员管理、营销中心、派单平台或门店装修。

### 网页后台本地服务（2026-09-30）

`admin/src/admin-service.ts` 是网页后台的适配入口，当前选择独立 IndexedDB 实现。它未调用现有 `shop-api`，未实现云端管理员身份，也不读取小程序设备存储。

| 能力 | 本地服务方法与约定 |
| --- | --- |
| 演示会话 | `login / logout / authenticated`；公开演示账号，sessionStorage 会话；业务调用检查会话 |
| 分类 | `categories / saveCategory`；稳定 ID、名称、排序、启用状态；改名同步商品冗余分类名；有关联上架商品不能停用 |
| 商品 | `products / product / saveProduct / setProductEnabled`；名称、分类、状态筛选，每页 20 条；新商品默认下架，既有规格只能停用，不删除或改变归属 |
| 库存 | `setStock(productId, skuId, stock, expectedStock)`；非负整数可售库存，事务中检查当前值；商品资料保存保留最新库存 |
| 订单 | `orders / order / completeOrder`；按订单号/手机号、状态、配送/自提筛选，按创建时间倒序分页；详情保留下单快照；仅已付款可完成，重复完成幂等 |
| 商家 | `store / saveStore`；店名、标语、介绍、电话、地址、营业时间、整数分配送费、配送说明；电话可为空 |
| 图片 | `image(id)` 读取本地 Blob；商品保存可携带一个新图片 Blob，与商品记录共同提交 |

后台沿用现有 `Product`、`SKU`、`Order` 的业务字段和订单状态，在后台自身类型中增加分类 ID、启用状态及图片扩展。图片为原有数字图集索引，或 `{ kind: 'upload', id }` 本地引用；不持久化临时 `blob:` URL。上传引用不可覆盖，旧订单可能引用的图片不清理。新图片限制为可解码的 JPEG/PNG/WebP，最大 5 MB；页面校验解码，服务同时校验类型与大小。

独立数据库 `baiguoji-admin-demo` 的 `state` 保存版本 1 的业务记录，`images` 保存图片 Blob。写操作在同一事务读取最新状态并应用改动，事务完成后才返回成功，失败不更新页面成功状态；不清缓存或重置数据。空数据库首次初始化时，商品资料由构建期读取纯 `seedData()`，另生成五笔示例订单并同步库存。重新读取、刷新、登录不会再次初始化。

后续云接入须另行实现服务端管理员鉴权与管理接口，再替换适配入口；不能把本地演示会话、前端禁用按钮或本地事务当成服务器安全保障。本地上传图片须转换为云端图片资源，并同步适配小程序图片组件，不能直接传入原有只接受数字索引的组件。

后端接入时将 image 数字索引替换/扩展为正式图片 URL；图片组件集中适配。真实微信身份用服务端交换 code，无需新增前端会员资料系统。电话拨号直接调用微信 API；用户拒绝、未配置等情况应保持可返回。

## 云函数接口（2026-09-27 源码实现）

云函数为 `shop-api`，入口在 `cloudfunctions/shop-api/index.js`。当前小程序仍使用本地服务，没有修改调用层、AppID、分包或项目编译配置。下面是已实现的云端接口，不是已经上线的 API。

使用小程序 `wx.cloud.callFunction({ name: 'shop-api', data: { action, data } })` 调用，结果位于 `res.result`。`data` 默认为空对象；所有 action 都需要云端微信身份。云函数在每次调用内部通过 CloudBase SDK `app.auth().getUserInfo().openId` 获取用户身份，不读取客户端 `openId`、`ownerId` 或角色字段。

返回结构：成功为 `{ ok: true, data: ... }`；失败为 `{ ok: false, error: { code, message, retryable } }`。不返回底层异常、凭证、内部 ownerId 或数据库 `_id`。字段、数量、布尔值均按 JSON 实际类型校验，不接受数字字符串代替数量。

| action | data 输入 | 成功 data |
| --- | --- | --- |
| categories | `{}` | `{ id, name, sort }[]`，按 sort、id 升序 |
| store | `{}` | 店名、说明、电话、地址、营业时间、配送费等公开配置 |
| catalog | `{ categoryId?, offset?, limit? }` | `{ items: Product[], nextOffset: number \| null }` |
| product | `{ id }` | 商品详情及已启用 SKU |
| cart | `{}` | 商品行及当前名称、规格、图片、价格、库存、available |
| addCart | `{ skuId, quantity }` | 原始购物车行数组，按 SKU 增加并合并 |
| updateCart | `{ skuId, quantity }` | 原始购物车行数组，quantity 为目标数量 |
| selectCart | `{ skuId, selected }`，skuId 可为 `all` | 原始购物车行数组 |
| removeCart | `{ skuId }` | 原始购物车行数组；移除不存在项无副作用 |
| addresses | `{}` | 当前用户地址数组 |
| saveAddress | `{ address: { id?, name, phone, detail, isDefault } }` | 地址 id；id 缺省/空字符串表示新增 |
| deleteAddress | `{ id }` | `null`；只移除自己地址簿中的对应地址 |
| quote | `{ lines: { skuId, quantity }[], fulfillment }` | `{ lines, subtotal, deliveryFee, total }` |
| createOrder | `{ token, lines, fulfillment, addressId?, name?, phone?, note?, fromCart }` | 订单快照 |
| orders | `{ offset?, limit? }` | `{ items: Order[], nextOffset: number \| null }` |
| getOrder | `{ id }` | 订单快照 |
| cancelOrder | `{ id }` | 已取消订单快照，重复调用不重复释放库存 |
| demoPay | `{ id, outcome: 'success' \| 'fail' \| 'cancel' }` | 自己的订单快照，仅开发环境可用 |
| demoCompleteOrder | `{ id }` | 自己的模拟订单快照，仅开发环境可用 |

分页默认 offset=0、limit=20；limit 为 1–50，offset 为 0–100000。目录按 id 升序，订单按 createdAt、id 降序。`nextOffset=null` 表示没有下一页；分页期间新增/上下架数据可能使 offset 翻页重复或跳过，客户端刷新从第一页开始并按 id 去重。分类最多返回 100 项，每个商品最多返回 100 个已启用 SKU，第一版控制在此范围。

Product 与本地模型字段一致，额外包含 categoryId；SKU 的 stock 表示可售库存，已被待支付订单预占的库存已经扣除。图片仍为现有本地图片数字索引，没有本轮上传素材或迁移到云存储。购物车最多 50 个不同 SKU；结算最多 50 行，重复 SKU 合并后数量仍须在 1–99，且不能超过可售库存。地址最多 20 条，姓名不超过 50 字，手机号必须符合现有 11 位规则，详细地址为 5–300 字，备注最多 200 字。商品价格、配送费、库存以及金额乘加均校验安全整数。

订单除既有字段外增加 `paymentMode: 'none' | 'demo'`，并在对应状态写入 paidAt、cancelledAt、completedAt（服务器毫秒时间）。云端订单 ID 由用户身份与 token 的 SHA-256 派生，未来微信支付 `out_trade_no` 必须单独按支付平台长度约束生成，不直接使用该 ID。

### 订单、库存和失败处理

- 服务端 quote/createOrder 读取 `settings/store` 及当前商品/SKU；不采用客户端传入的价格、金额或订单状态。报价只读，不锁库存；下单时再次校验。
- createOrder 的 token 必须是非空字符串，最多 128 字。token 作用域为当前 OpenID，同一用户重复 token 返回首次订单，即使本次 payload 改变、价格更新、订单已支付或取消也不新建订单。新的购买必须生成新 token；响应丢失或事务冲突重试必须复用原 token。
- 单个事务执行幂等检查、库存预占、订单和幂等记录创建、已购买购物车数量扣减。立即购买不修改购物车；来自购物车时仅扣减本次 SKU 数量，保留剩余数量和其他行的勾选状态。
- cancelOrder 在同一事务内检查归属和待支付状态、释放库存、写入取消状态。售罄或下架 SKU 仍可释放；不能物理删除有未结订单的 SKU。订单不自动过期，取消不把商品重新放回购物车。
- 地址按当前用户读取，配送复制地址快照，自提校验姓名手机号；后续修改商品或地址不影响历史订单。
- 模拟支付 fail/cancel 不改变 pending 状态，success 设置 paid 并标记 demo；模拟完成仅接受模拟付款的订单，重复成功/完成不产生重复副作用。没有云端 resetDemo、顾客 completeOrder 或真实 pay action。
- 遇到事务冲突返回 `CONFLICT`；不在函数内部盲目重放。数据库调用异常或提交结果不确定返回 `SERVICE_UNAVAILABLE`。客户端不要自动重试加购增量/新建地址这类操作；先重新查询。createOrder 同 token 和 cancelOrder 可安全重试。

| code | 含义 | retryable |
| --- | --- | --- |
| UNAUTHENTICATED | 未取得可信微信 OpenID | false |
| UNKNOWN_ACTION / INVALID_INPUT | 不支持的操作或参数无效 | false |
| NOT_FOUND | 记录不存在或不属于当前用户，不透露其他用户数据 | false |
| UNAVAILABLE / OUT_OF_STOCK | 商品下架或可售库存不足 | false |
| INVALID_STATE | 当前订单状态不允许操作 | false |
| LIMIT_EXCEEDED | 购物车或地址数量达到上限 | false |
| NOT_CONFIGURED / DATA_INVALID | 门店未初始化或云端价格/库存不合法，需维护数据 | false |
| DEMO_DISABLED | 开发模拟开关未同时开启 | false |
| CONFLICT | 数据库事务写冲突，应重新获取数据或同 token 重试 | true |
| SERVICE_UNAVAILABLE | SDK、网络或数据库异常，响应不包含内部错误 | true |

### 数据集合与权限

| 集合 | 文档结构 / ID |
| --- | --- |
| categories | `_id, name, sort, enabled` |
| products | `_id, categoryId, category, name, subtitle, origin, image, description, storage, enabled` |
| skus | `_id, productId, label, price, stock, enabled` |
| settings | 固定 `_id='store'`，公开门店配置及整数分配送费 |
| carts | `_id=SHA256(['user', OpenID]), ownerId, items: { skuId, quantity, selected }[], updatedAt` |
| addresses | 同样按用户生成文档 ID，`ownerId, items: Address[], updatedAt`；地址簿内只有一个默认项 |
| orders | `_id=id, ownerId` 及完整订单快照、paymentMode、状态时间 |
| order_requests | `_id=SHA256(['order', OpenID, token]), ownerId, orderId, createdAt` |

所有集合客户端规则均为 `{ "read": false, "write": false }`，客户端统一走云函数。云函数服务端 SDK 具有管理权限，必须由源码进行归属检查，不能仅依赖客户端数据库规则。每个用户一个地址簿文档便于事务维护默认地址；客户端不能提供地址簿 ID。通过订单 `_id` 和 `order_requests` `_id` 的唯一性实现幂等，不需额外的 token 唯一索引。

分类、商品、库存和门店资料第一阶段由店家授权的云控制台账号维护，没有顾客端管理 API。生产订单完成暂缓到独立店家身份/权限接口实施，不以直接修改数据库状态作为正式业务流程。云环境配置说明与复合索引清单位于 `cloudfunctions/database.config.json`；它是人工配置规范，不是可自动部署的配置文件。

## 云后台配置与部署步骤

本阶段只完成源码和本地验证，以下是取得正式 AppID 后的操作顺序，尚未执行：

1. 明确确认开发环境 ID，并在真实支付接入前建立独立生产环境。不要复用测试占位 AppID，也不要自动选择云环境。
2. 再配置项目 `cloudfunctionRoot: 'cloudfunctions/'`，初始化小程序 wx.cloud；只将 `cloudfunctions/shop-api` 作为函数部署目录。`seed-data.cjs` 和 `database.config.json` 不部署为云函数。
3. 创建全部八个集合；逐一设置禁止客户端读写的安全规则，并按 database.config.json 建立索引。服务端 SDK `3.18.3` 独立锁定，执行 `npm ci --ignore-scripts`；部署时使用锁定依赖。
4. 运行 `node cloudfunctions/seed-data.cjs products`（其他集合替换名称）获得 JSON Lines。只向新的空集合导入 categories、products、skus、settings；禁止覆盖已有价格、库存或订单。用户集合保持空，不迁移设备中的 fruitshop:v1。
5. 在开发环境设置 `APP_STAGE=development`、`ENABLE_DEMO_ACTIONS=true` 才启用模拟操作。生产设置 `APP_STAGE=production`、`ENABLE_DEMO_ACTIONS=false`。两个开关均从服务器环境变量读取，客户端无权设置。
6. 云函数只接收小程序调用，不创建 HTTP 触发器，也不与支付回调或定时任务混用；每次调用重新读取身份，避免缓存其他用户上下文。将来支付回调使用独立验签入口。
7. 接入 services/shop.ts，适配异步 store/categories、分页和错误结构，再在真实微信开发者工具及真机验证身份、规则、事务冲突与资源配额。把这部分结果另记入验证记录。

真实支付后续实现服务端预支付、独立回调验签和幂等、金额/订单/商户核验、主动查单及对账。付款与取消的竞态必须与支付关单和查单协同，不能直接沿用本轮模拟支付作为生产方案。生产店家完成订单需独立权限。SDK 安装成功、本地内存测试通过均不代表云端部署、真实身份或支付验收通过。

官方接口参考：[Node.js 服务端身份接口](https://docs.cloudbase.net/api-reference/server/node-sdk/auth)、[数据库事务](https://docs.cloudbase.net/database/transaction)、[云函数实例复用与身份上下文](https://docs.cloudbase.net/cloud-function/instance)。本地测试通过 `npm run test:cloud` 执行。

