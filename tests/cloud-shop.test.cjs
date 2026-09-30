'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHandler } = require('../cloudfunctions/shop-api/service')
const { seedData } = require('../cloudfunctions/seed-data.cjs')
const { createMemoryRepository } = require('./helpers/memory-repository.cjs')
const input = (extra = {}) => ({
  token: 'one', lines: [{ skuId: 's0a', quantity: 2 }], fulfillment: 'pickup',
  name: '小明', phone: '13800138000', note: '', fromCart: false, ...extra,
})
const address = (extra = {}) => ({
  id: '', name: '小明', phone: '13800138000', detail: '测试城市幸福路一号楼', isDefault: false, ...extra,
})
function fixture(options = {}) {
  const repository = createMemoryRepository(seedData())
  const handle = createHandler({ repository, ...options })
  const call = (action, data = {}, openId = 'alice') => handle({ action, data }, { openId })
  return {
    repository, handle, call,
    async ok(action, data, openId) {
      const result = await call(action, data, openId)
      assert.equal(result.ok, true, JSON.stringify(result))
      return result.data
    },
    async error(code, action, data, openId) {
      const result = await call(action, data, openId)
      assert.equal(result.ok, false)
      assert.equal(result.error.code, code, JSON.stringify(result))
      return result.error
    },
  }
}

test('cloud: catalog pagination, categories, disabled products and store projections', async () => {
  const f = fixture()
  const first = await f.ok('catalog', { limit: 5 })
  const second = await f.ok('catalog', { limit: 5, offset: first.nextOffset })
  const last = await f.ok('catalog', { limit: 5, offset: second.nextOffset })
  assert.equal(new Set([...first.items, ...second.items, ...last.items].map((p) => p.id)).size, 12)
  assert.equal(last.nextOffset, null)
  const filtered = await f.ok('catalog', { categoryId: 'c2' })
  assert.deepEqual(filtered.items.map((p) => p.id), ['p1'])
  assert.equal((await f.ok('categories')).length, 5)
  assert.equal((await f.ok('store')).phone, '')
  const product = await f.repository.get('products', 'p0')
  await f.repository.set('products', 'p0', { ...product, enabled: false, privateData: 'hidden' })
  await f.error('NOT_FOUND', 'product', { id: 'p0' })
  await f.error('UNAVAILABLE', 'addCart', { skuId: 's0a', quantity: 1 })
  assert.equal((await f.ok('catalog')).items.length, 11)
})

test('cloud: integer pricing and authoritative delivery fee ignore client totals', async () => {
  const f = fixture()
  const result = await f.ok('quote', { ...input(), total: 1, deliveryFee: 1 })
  assert.equal(result.total, 2560)
  assert.equal((await f.ok('quote', input({ fulfillment: 'delivery' }))).total, 3160)
  const settings = await f.repository.get('settings', 'store')
  await f.repository.set('settings', 'store', { ...settings, deliveryFee: 800 })
  assert.equal((await f.ok('quote', input({ fulfillment: 'delivery' }))).total, 3360)
  const order = await f.ok('createOrder', input({ price: 1, total: 1, status: 'paid' }))
  assert.equal(order.total, 2560)
  assert.equal(order.status, 'pending')
})

test('cloud: invalid quantities, merged quantities, sold out and invalid mode rejected', async () => {
  const f = fixture()
  for (const q of [0, -1, 1.2, NaN, Infinity, 100, '1', null]) {
    await f.error('INVALID_INPUT', 'quote', input({ lines: [{ skuId: 's0a', quantity: q }] }))
  }
  await f.error('INVALID_INPUT', 'quote', input({ lines: [] }))
  await f.error('INVALID_INPUT', 'quote', input({ fulfillment: 'express' }))
  await f.error('OUT_OF_STOCK', 'quote', input({ lines: [{ skuId: 's11a', quantity: 1 }] }))
  await f.error('OUT_OF_STOCK', 'quote', input({ lines: [{ skuId: 's0a', quantity: 20 }, { skuId: 's0a', quantity: 20 }] }))
  const merged = await f.ok('quote', input({ lines: [{ skuId: 's0a', quantity: 1 }, { skuId: 's0a', quantity: 2 }] }))
  assert.equal(merged.lines.length, 1)
  assert.equal(merged.lines[0].quantity, 3)
  const sku = await f.repository.get('skus', 's0a')
  await f.repository.set('skus', 's0a', { ...sku, stock: 100 })
  await f.error('INVALID_INPUT', 'quote', input({ lines: [{ skuId: 's0a', quantity: 99 }, { skuId: 's0a', quantity: 1 }] }))
  await f.repository.set('skus', 's0a', { ...sku, price: Number.MAX_SAFE_INTEGER })
  await f.error('DATA_INVALID', 'quote', input())
})

test('cloud: cart shared by identity, isolated across users and projected with current stock', async () => {
  const f = fixture()
  await f.ok('addCart', { skuId: 's0a', quantity: 3 })
  await f.ok('addCart', { skuId: 's0a', quantity: 2 })
  const otherDevice = createHandler({ repository: f.repository })
  assert.equal((await otherDevice({ action: 'cart' }, { openId: 'alice' })).data[0].quantity, 5)
  assert.deepEqual(await f.ok('cart', {}, 'bob'), [])
  await f.ok('selectCart', { skuId: 'all', selected: false })
  assert.equal((await f.ok('cart'))[0].selected, false)
  const sku = await f.repository.get('skus', 's0a')
  await f.repository.set('skus', 's0a', { ...sku, stock: 2 })
  await f.ok('updateCart', { skuId: 's0a', quantity: 4 })
  await f.error('OUT_OF_STOCK', 'updateCart', { skuId: 's0a', quantity: 5 })
  await f.error('OUT_OF_STOCK', 'quote', input({ lines: [{ skuId: 's0a', quantity: 4 }] }))
  await f.repository.set('skus', 's0a', { ...sku, enabled: false })
  assert.equal((await f.ok('cart'))[0].available, false)
  await f.ok('removeCart', { skuId: 's0a' })
  assert.deepEqual(await f.ok('cart'), [])
})

test('cloud: default addresses, validation and cross-user address protection', async () => {
  const f = fixture()
  await f.error('INVALID_INPUT', 'saveAddress', { address: address({ phone: '123' }) })
  await f.error('INVALID_INPUT', 'saveAddress', { address: address({ detail: '短' }) })
  const a = await f.ok('saveAddress', { address: address() })
  const b = await f.ok('saveAddress', { address: address({ name: '小红', isDefault: true }) })
  let rows = await f.ok('addresses')
  assert.equal(rows.filter((row) => row.isDefault).length, 1)
  assert.equal(rows.find((row) => row.isDefault).id, b)
  await f.error('NOT_FOUND', 'saveAddress', { address: address({ id: a }) }, 'bob')
  await f.ok('deleteAddress', { id: a }, 'bob')
  assert.equal((await f.ok('addresses')).length, 2)
  await f.error('NOT_FOUND', 'createOrder', input({ fulfillment: 'delivery', addressId: a }), 'bob')
  await f.ok('deleteAddress', { id: b })
  rows = await f.ok('addresses')
  assert.equal(rows[0].isDefault, true)
  assert.equal(rows[0].id, a)
})

test('cloud: order validates contact before committing any stock or cart changes', async () => {
  const f = fixture()
  await f.error('INVALID_INPUT', 'createOrder', input({ phone: '123' }))
  await f.error('INVALID_INPUT', 'createOrder', input({ name: ' ' }))
  await f.error('INVALID_INPUT', 'createOrder', input({ fulfillment: 'delivery' }))
  assert.equal((await f.repository.get('skus', 's0a')).stock, 30)
  assert.deepEqual((await f.ok('orders')).items, [])
})

test('cloud: idempotent order, user-scoped token, partial cart deduction', async () => {
  const f = fixture()
  await f.ok('addCart', { skuId: 's0a', quantity: 5 })
  await f.ok('addCart', { skuId: 's1a', quantity: 3 })
  await f.ok('selectCart', { skuId: 's1a', selected: false })
  const a = await f.ok('createOrder', input({ fromCart: true }))
  const repeated = await f.ok('createOrder', { token: 'one' })
  assert.equal(a.id, repeated.id)
  assert.equal((await f.repository.get('skus', 's0a')).stock, 28)
  const cart = await f.ok('cart')
  assert.equal(cart[0].quantity, 3)
  assert.equal(cart[1].quantity, 3)
  assert.equal(cart[1].selected, false)
  const bob = await f.ok('createOrder', input(), 'bob')
  assert.notEqual(a.id, bob.id)
  assert.equal((await f.ok('orders')).items.length, 1)
  assert.equal((await f.ok('orders', {}, 'bob')).items.length, 1)
})

test('cloud: order snapshots survive address, SKU and product edits', async () => {
  const f = fixture()
  const addressId = await f.ok('saveAddress', { address: address() })
  const order = await f.ok('createOrder', input({ fulfillment: 'delivery', addressId }))
  await f.ok('saveAddress', { address: address({ id: addressId, detail: '另一条街道二号楼', phone: '13900139000' }) })
  const sku = await f.repository.get('skus', 's0a')
  await f.repository.set('skus', 's0a', { ...sku, price: 1, label: '新规格', enabled: false })
  const product = await f.repository.get('products', 'p0')
  await f.repository.set('products', 'p0', { ...product, name: '新商品名' })
  const saved = await f.ok('getOrder', { id: order.id })
  assert.deepEqual(saved, order)
  saved.lines[0].price = 2
  assert.equal((await f.ok('getOrder', { id: order.id })).lines[0].price, 1280)
  await f.ok('cancelOrder', { id: order.id })
  assert.equal((await f.repository.get('skus', 's0a')).stock, 30)
})

test('cloud: write failure rolls back stock, cart, order and idempotency marker', async () => {
  const f = fixture()
  await f.ok('addCart', { skuId: 's0a', quantity: 2 })
  const before = f.repository.snapshot()
  f.repository.failNextCommit(new Error('private database error with credentials'))
  const error = await f.error('SERVICE_UNAVAILABLE', 'createOrder', input({ fromCart: true }))
  assert.equal(error.retryable, true)
  assert.ok(!error.message.includes('credentials'))
  assert.deepEqual(f.repository.snapshot(), before)
  const order = await f.ok('createOrder', input({ fromCart: true }))
  assert.equal(order.status, 'pending')
  assert.deepEqual(await f.ok('cart'), [])
})

test('cloud: concurrent last-unit purchases never oversell; conflict retry revalidates stock', async () => {
  const f = fixture()
  const sku = await f.repository.get('skus', 's0a')
  await f.repository.set('skus', 's0a', { ...sku, stock: 1 })
  const orderInput = input({ lines: [{ skuId: 's0a', quantity: 1 }] })
  const results = await Promise.all([f.call('createOrder', orderInput, 'alice'), f.call('createOrder', orderInput, 'bob')])
  assert.equal(results.filter((r) => r.ok).length, 1)
  const loser = results[0].ok ? 'bob' : 'alice'
  assert.equal(results.find((r) => !r.ok).error.code, 'CONFLICT')
  await f.error('OUT_OF_STOCK', 'createOrder', orderInput, loser)
  assert.equal((await f.repository.get('skus', 's0a')).stock, 0)
  assert.equal(f.repository.snapshot().orders.length, 1)
})

test('cloud: concurrent same-token requests converge to one order after retry', async () => {
  const f = fixture()
  const results = await Promise.all([f.call('createOrder', input()), f.call('createOrder', input())])
  assert.equal(results.filter((r) => r.ok).length, 1)
  const retry = await f.ok('createOrder', input())
  assert.equal(retry.id, results.find((r) => r.ok).data.id)
  assert.equal(f.repository.snapshot().orders.length, 1)
  assert.equal((await f.repository.get('skus', 's0a')).stock, 28)
})

test('cloud: cancellation releases once, and cancellation failures roll back', async () => {
  const f = fixture({ stage: 'development', enableDemo: true })
  const order = await f.ok('createOrder', input())
  f.repository.failNextCommit()
  await f.error('SERVICE_UNAVAILABLE', 'cancelOrder', { id: order.id })
  assert.equal((await f.repository.get('skus', 's0a')).stock, 28)
  const results = await Promise.all([f.call('cancelOrder', { id: order.id }), f.call('cancelOrder', { id: order.id })])
  assert.equal(results.filter((r) => r.ok).length, 1)
  await f.ok('cancelOrder', { id: order.id })
  assert.equal((await f.repository.get('skus', 's0a')).stock, 30)
  await f.error('INVALID_STATE', 'demoPay', { id: order.id, outcome: 'success' })
})

test('cloud: demo failures/cancel preserve pending; success and completion are idempotent', async () => {
  const f = fixture({ stage: 'development', enableDemo: true })
  const order = await f.ok('createOrder', input())
  for (const outcome of ['fail', 'cancel']) {
    assert.equal((await f.ok('demoPay', { id: order.id, outcome })).status, 'pending')
  }
  await f.error('INVALID_STATE', 'demoCompleteOrder', { id: order.id })
  await f.ok('demoPay', { id: order.id, outcome: 'success' })
  await f.ok('demoPay', { id: order.id, outcome: 'success' })
  await f.error('INVALID_STATE', 'cancelOrder', { id: order.id })
  assert.equal((await f.ok('demoCompleteOrder', { id: order.id })).status, 'completed')
  assert.equal((await f.ok('demoCompleteOrder', { id: order.id })).status, 'completed')
})

test('cloud: demo requires both server switches and never permits another user order', async () => {
  for (const options of [{}, { stage: 'development' }, { enableDemo: true }, { stage: 'production', enableDemo: true }]) {
    const f = fixture(options)
    await f.error('DEMO_DISABLED', 'demoPay', { id: 'any', outcome: 'success', stage: 'development', enableDemo: true })
    await f.error('DEMO_DISABLED', 'demoCompleteOrder', { id: 'any' })
  }
  const f = fixture({ stage: 'development', enableDemo: true })
  const order = await f.ok('createOrder', input())
  for (const action of ['getOrder', 'cancelOrder', 'demoPay', 'demoCompleteOrder']) {
    await f.error('NOT_FOUND', action, { id: order.id, outcome: 'success', ownerId: 'alice' }, 'bob')
  }
})

test('cloud: payment/cancellation race settles on one legal state without double releasing', async () => {
  const f = fixture({ stage: 'development', enableDemo: true })
  const order = await f.ok('createOrder', input())
  const results = await Promise.all([
    f.call('cancelOrder', { id: order.id }), f.call('demoPay', { id: order.id, outcome: 'success' }),
  ])
  assert.equal(results.filter((r) => r.ok).length, 1)
  const saved = await f.ok('getOrder', { id: order.id })
  assert.equal((await f.repository.get('skus', 's0a')).stock, saved.status === 'paid' ? 28 : 30)
})

test('cloud: malformed envelopes, absent identity and prototype action injection', async () => {
  const f = fixture()
  assert.equal((await f.handle({ action: 'orders', openId: 'alice', data: { openId: 'alice' } }, {})).error.code, 'UNAUTHENTICATED')
  for (const action of ['constructor', 'toString', '__proto__', 'resetDemo', 'completeOrder', 'pay', 'unknown']) {
    await f.error('UNKNOWN_ACTION', action)
  }
  assert.equal((await f.handle(null, { openId: 'alice' })).error.code, 'INVALID_INPUT')
  await f.error('INVALID_INPUT', 'quote', [])
  await f.error('INVALID_INPUT', 'orders', { limit: 1000 })
  await f.error('INVALID_INPUT', 'selectCart', { skuId: 'all', selected: 'true' })
})

test('cloud: read failure never becomes an empty user dataset', async () => {
  const handle = createHandler({ repository: { get: async () => { throw new Error('private error') } } })
  const result = await handle({ action: 'addresses' }, { openId: 'alice' })
  assert.equal(result.error.code, 'SERVICE_UNAVAILABLE')
  assert.equal(Object.hasOwn(result, 'data'), false)
})

test('cloud: order pagination uses deterministic tie-break and never leaks owner identity', async () => {
  const f = fixture({ now: () => 12345 })
  for (const token of ['one', 'two', 'three']) await f.ok('createOrder', input({ token }))
  const first = await f.ok('orders', { limit: 2 })
  const second = await f.ok('orders', { limit: 2, offset: first.nextOffset })
  assert.equal(new Set([...first.items, ...second.items].map((o) => o.id)).size, 3)
  assert.equal(second.nextOffset, null)
  assert.equal(Object.hasOwn(first.items[0], 'ownerId'), false)
})

test('cloud: seed data matches existing demo product/spec/price definitions', () => {
  require('../scripts/register-ts.cjs')
  const { products } = require('../miniprogram/data/products.ts')
  const { shop } = require('../miniprogram/config/shop.ts')
  const seed = seedData()
  for (const product of products) {
    const actual = seed.products.find((row) => row._id === product.id)
    assert.equal(actual.name, product.name)
    assert.equal(actual.image, product.image)
    for (const sku of product.skus) {
      const seeded = seed.skus.find((row) => row._id === sku.id)
      assert.equal(seeded.price, sku.price)
      assert.equal(seeded.stock, sku.stock)
      assert.equal(seeded.label, sku.label)
    }
  }
  const { _id, ...settings } = seed.settings[0]
  assert.deepEqual(settings, shop)
})
