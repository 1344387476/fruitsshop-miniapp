require('../scripts/register-ts.cjs')
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path')
let captured,
  storage = {},
  navigations = []
global.Page = (o) => {
  captured = o
}
global.wx = {
  getStorageSync: (k) => storage[k],
  setStorageSync: (k, v) => (storage[k] = JSON.parse(JSON.stringify(v))),
  removeStorageSync: (k) => delete storage[k],
  showToast: () => {},
  showModal: ({ success }) => success && success({ confirm: true }),
  navigateTo: ({ url }) => navigations.push(url),
  redirectTo: ({ url }) => navigations.push(url),
  navigateBack: () => {},
  switchTab: ({ url }) => navigations.push(url),
  stopPullDownRefresh: () => {},
}
function page(file) {
  const full = path.resolve('miniprogram/' + file + '.ts')
  delete require.cache[full]
  require(full)
  const p = {
    ...captured,
    data: JSON.parse(JSON.stringify(captured.data)),
    setData(v) {
      Object.assign(this.data, v)
    },
    getTabBar() {
      return { setData() {}, refresh() {} }
    },
  }
  return p
}
const tap = (data) => ({ currentTarget: { dataset: data } })
const api = require('../miniprogram/services/shop.ts')
test('实际页面方法走通配送下单、支付重试及订单完成', async () => {
  await api.resetDemo()
  storage = {}
  navigations = []
  const home = page('pages/index/index')
  await home.load()
  assert.equal(home.data.items.length, 12)
  home.filter(tap({ category: '柑橘橙类' }))
  assert.equal(home.data.items.length, 1)
  await api.addCart('s1a', 2)
  const cart = page('pages/cart/index')
  await cart.load()
  assert.equal(cart.data.total, '19.80')
  cart.checkout()
  assert.equal(navigations.at(-1), '/shop/checkout/index')
  const checkout = page('shop/checkout/index')
  await checkout.onLoad({})
  await checkout.onShow()
  assert.equal(checkout.data.total, '25.80')
  await checkout.submit()
  assert.equal((await api.orders()).length, 0)
  const edit = page('shop/address-edit/index')
  Object.assign(edit.data, { name: '小林', phone: '13800138000', detail: '测试城市幸福路三号楼501' })
  await edit.save()
  await checkout.onShow()
  assert.ok(checkout.data.address)
  await checkout.submit()
  assert.equal((await api.orders()).length, 1)
  assert.equal((await api.cart()).length, 0)
  const o = (await api.orders())[0],
    payment = page('shop/payment/index')
  payment.data.id = o.id
  await payment.load()
  assert.equal(payment.data.total, '25.80')
  await payment.outcome('fail')
  assert.equal(payment.data.state, 'fail')
  payment.retry()
  await payment.outcome('success')
  const detail = page('shop/order/index')
  detail.data.id = o.id
  await detail.load()
  assert.equal(detail.data.order.statusText, '待配送')
  const demo = page('shop/demo/index')
  await demo.load()
  await demo.complete(tap({ id: o.id }))
  await detail.load()
  assert.equal(detail.data.order.statusText, '已完成')
})
test('自提切换移除运费、立即购买不清购物车、支付取消保持订单', async () => {
  await api.resetDemo()
  await api.addCart('s0a', 1)
  const checkout = page('shop/checkout/index')
  await checkout.onLoad({ sku: 's2a', quantity: '3' })
  assert.equal(checkout.data.total, '32.70')
  await checkout.mode(tap({ mode: 'pickup' }))
  assert.equal(checkout.data.total, '26.70')
  checkout.data.name = '小张'
  checkout.data.phone = '13900139000'
  await checkout.submit()
  const o = (await api.orders())[0]
  assert.equal(o.fulfillment, 'pickup')
  assert.equal(o.deliveryFee, 0)
  assert.equal((await api.cart()).length, 1)
  const p = page('shop/payment/index')
  p.data.id = o.id
  await p.outcome('cancel')
  assert.equal((await api.getOrder(o.id)).status, 'pending')
  await api.pay(o.id, 'success')
  const detail = page('shop/order/index')
  detail.data.id = o.id
  await detail.load()
  assert.equal(detail.data.order.statusText, '待自提')
})
test('地址删除后结算刷新选择，购物车全选及调整数量同步', async () => {
  const addresses = await api.addresses()
  for (const a of addresses) await api.deleteAddress(a.id)
  const c = page('shop/checkout/index')
  await c.onLoad({})
  await c.onShow()
  assert.equal(c.data.address, null)
  const cart = page('pages/cart/index')
  await cart.load()
  await cart.select(tap({ id: 'all', selected: true }))
  assert.equal(cart.data.count, 0)
  await cart.select(tap({ id: 'all', selected: false }))
  await cart.step(tap({ id: 's0a', quantity: 1, delta: 1 }))
  assert.equal(cart.data.total, '25.60')
})
