require('../scripts/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ShopEngine, money } = require('../miniprogram/core/engine.ts')
const { products } = require('../miniprogram/data/products.ts')
const fresh = () => new ShopEngine(products, 600)
const input = (extra = {}) => ({
  token: 'one',
  lines: [{ skuId: 's0a', quantity: 2 }],
  fulfillment: 'pickup',
  name: '小林',
  phone: '13800138000',
  note: '',
  fromCart: false,
  ...extra,
})
test('报价使用整数分，自提免费，配送固定600分', () => {
  const e = fresh()
  assert.equal(e.quote(input().lines, 'pickup').total, 2560)
  assert.equal(e.quote(input().lines, 'delivery').total, 3160)
  assert.equal(money(1999), '19.99')
  assert.equal(
    e.quote(
      [
        { skuId: 's0a', quantity: 1 },
        { skuId: 's0b', quantity: 2 },
      ],
      'delivery',
    ).subtotal,
    6400,
  )
})
test('数量合并、边界和售罄校验', () => {
  const e = fresh()
  e.add('s0a', 2)
  e.add('s0a', 3)
  assert.equal(e.state.cart[0].quantity, 5)
  for (const q of [0, -1, 1.2, NaN, 100]) assert.throws(() => e.add('s0a', q))
  assert.throws(() => e.add('s11a', 1), /库存不足/)
  assert.throws(
    () =>
      e.quote(
        [
          { skuId: 's0a', quantity: 20 },
          { skuId: 's0a', quantity: 20 },
        ],
        'pickup',
      ),
    /库存不足/,
  )
  assert.throws(() => e.quote([], 'pickup'))
})
test('默认地址维护、手机号和详细地址验证', () => {
  const e = fresh()
  assert.throws(() =>
    e.saveAddress({ id: '', name: '张', phone: '123', detail: '北京市海淀区', isDefault: false }),
  )
  const a = e.saveAddress({
    id: '',
    name: '小林',
    phone: '13800138000',
    detail: '北京市海淀区一号院',
    isDefault: false,
  })
  const b = e.saveAddress({
    id: '',
    name: '小王',
    phone: '13900139000',
    detail: '北京市海淀区二号院',
    isDefault: true,
  })
  assert.equal(e.state.addresses.find((x) => x.id === a).isDefault, false)
  e.deleteAddress(b)
  assert.equal(e.state.addresses[0].isDefault, true)
})
test('配送需要地址，自提需要有效联系人', () => {
  const e = fresh()
  assert.throws(() => e.create(input({ fulfillment: 'delivery' })), /地址/)
  assert.throws(() => e.create(input({ phone: 'abc' })), /手机号/)
  assert.throws(() => e.create(input({ name: ' ' })), /联系人/)
  assert.equal(e.state.orders.length, 0)
  assert.equal(e.sku('s0a').stock, 30)
})
test('下单防重复、库存预占和选中购物车清理', () => {
  const e = fresh()
  e.add('s0a', 2)
  e.add('s1a', 3)
  e.select('s1a', false)
  const a = e.create(input({ fromCart: true })),
    b = e.create(input({ fromCart: true }))
  assert.equal(a.id, b.id)
  assert.equal(e.state.orders.length, 1)
  assert.equal(e.sku('s0a').stock, 28)
  assert.deepEqual(e.state.cart, [{ skuId: 's1a', quantity: 3, selected: false }])
})
test('立即购买不影响购物车，订单保留地址与价格快照', () => {
  const e = fresh()
  e.add('s0a', 2)
  const a = e.saveAddress({
    id: '',
    name: '小林',
    phone: '13800138000',
    detail: '北京市海淀区旧地址',
    isDefault: true,
  })
  const o = e.create(input({ fulfillment: 'delivery', addressId: a }))
  e.saveAddress({ id: a, name: '小王', phone: '13900139000', detail: '北京市海淀区新地址', isDefault: true })
  assert.equal(e.state.cart[0].quantity, 2)
  assert.equal(e.order(o.id).contact.detail, '北京市海淀区旧地址')
  o.lines[0].price = 1
  assert.equal(e.order(o.id).lines[0].price, 1280)
})
test('支付失败和取消可重试，成功幂等，已付款不能直接取消', () => {
  const e = fresh(),
    o = e.create(input())
  e.pay(o.id, 'fail')
  assert.equal(e.order(o.id).status, 'pending')
  e.pay(o.id, 'cancel')
  e.pay(o.id, 'success')
  e.pay(o.id, 'success')
  assert.equal(e.order(o.id).status, 'paid')
  assert.throws(() => e.cancel(o.id))
  e.complete(o.id)
  assert.equal(e.order(o.id).status, 'completed')
  assert.throws(() => e.complete(o.id))
})
test('取消待支付释放库存，取消操作幂等', () => {
  const e = fresh(),
    o = e.create(input())
  e.cancel(o.id)
  e.cancel(o.id)
  assert.equal(e.sku('s0a').stock, 30)
  assert.throws(() => e.pay(o.id, 'success'))
  assert.throws(() => e.complete(o.id))
})
test('重启恢复订单、购物车和预占库存', () => {
  const e = fresh()
  e.add('s1a', 3)
  const o = e.create(input())
  const restored = new ShopEngine(products, 600, JSON.parse(JSON.stringify(e.state)))
  assert.equal(restored.order(o.id).total, 2560)
  assert.equal(restored.state.cart[0].quantity, 3)
  assert.equal(restored.sku('s0a').stock, 28)
  restored.cancel(o.id)
  assert.equal(restored.sku('s0a').stock, 30)
})
test('库存减少后仍可逐步调低购物车数量，结算继续校验库存', () => {
  const e = fresh()
  e.add('s0a', 5)
  e.create(input({ lines: [{ skuId: 's0a', quantity: 27 }] }))
  e.updateCart('s0a', 4)
  assert.equal(e.state.cart[0].quantity, 4)
  assert.throws(() => e.quote([{ skuId: 's0a', quantity: 4 }], 'pickup'), /库存不足/)
  assert.throws(() => e.updateCart('s0a', 5), /库存不足/)
  e.updateCart('s0a', 3)
  assert.equal(e.quote([{ skuId: 's0a', quantity: 3 }], 'pickup').subtotal, 3840)
})

test('最后一份库存无法被重复订单超卖', () => {
  const e = fresh()
  e.create(input({ lines: [{ skuId: 's0a', quantity: 30 }] }))
  assert.throws(() => e.create(input({ token: 'two' })), /库存不足/)
  assert.equal(e.state.orders.length, 1)
})
test('服务层本地持久化失败会回滚，不留下半笔订单', async () => {
  let fail = false
  const memory = {}
  global.wx = {
    getStorageSync: (key) => memory[key],
    setStorageSync: (key, value) => {
      if (fail) throw new Error('磁盘已满')
      memory[key] = JSON.parse(JSON.stringify(value))
    },
  }
  const api = require('../miniprogram/services/shop.ts')
  await api.addCart('s0a', 2)
  fail = true
  await assert.rejects(() => api.createOrder(input({ fromCart: true })), /磁盘已满/)
  assert.equal((await api.orders()).length, 0)
  assert.equal((await api.cart())[0].quantity, 2)
  fail = false
  const o = await api.createOrder(input({ fromCart: true }))
  await api.pay(o.id, 'success')
  assert.equal((await api.getOrder(o.id)).status, 'paid')
  assert.equal(memory['fruitshop:v1'].orders.length, 1)
})
