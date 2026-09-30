'use strict'

const { createHash, randomUUID } = require('node:crypto')
const { fail, errorResponse } = require('./errors')
const MAX_LINES = 50
const MAX_ADDRESSES = 20
const hash = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
const copy = (value) => JSON.parse(JSON.stringify(value))

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', '参数必须是对象')
  return value
}
function text(value, name, max, allowEmpty = false) {
  if (typeof value !== 'string') fail('INVALID_INPUT', name + '格式错误')
  const result = value.trim()
  if ((!allowEmpty && !result) || result.length > max) fail('INVALID_INPUT', name + '长度不正确')
  return result
}
function id(value) {
  const result = text(value, 'ID', 128)
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) fail('INVALID_INPUT', 'ID 格式错误')
  return result
}
function integer(value, name, min, max, code = 'INVALID_INPUT') {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(code, name + '不在有效范围')
  return value
}
const quantity = (q) => integer(q, '数量', 1, 99)
const amount = (q) => integer(q, '金额', 0, Number.MAX_SAFE_INTEGER, 'DATA_INVALID')
function boolean(value) {
  if (typeof value !== 'boolean') fail('INVALID_INPUT', '请传入布尔值')
  return value
}
function contact(input, delivery = false) {
  const name = text(input.name, '联系人', 50)
  const phone = text(input.phone, '手机号', 11)
  if (!/^1[3-9]\d{9}$/.test(phone)) fail('INVALID_INPUT', '请填写正确的手机号')
  const detail = delivery ? text(input.detail, '详细地址', 300) : ''
  if (delivery && detail.length < 5) fail('INVALID_INPUT', '请填写完整地址（至少5个字）')
  return { name, phone, detail }
}
function mergedLines(input) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_LINES) {
    fail('INVALID_INPUT', '商品行数必须在 1–50 之间')
  }
  const merged = new Map()
  for (const raw of input) {
    const row = object(raw)
    const skuId = id(row.skuId)
    merged.set(skuId, quantity((merged.get(skuId) || 0) + quantity(row.quantity)))
  }
  return [...merged].sort(([a], [b]) => a.localeCompare(b)).map(([skuId, q]) => ({ skuId, quantity: q }))
}
function owned(document, openId) {
  if (!document || document.ownerId !== openId) fail('NOT_FOUND', '记录不存在')
  return document
}
function orderView(order) {
  const { _id, ownerId, ...result } = order
  return result
}
function productView(product, skus) {
  return {
    id: product._id, name: product.name, subtitle: product.subtitle,
    category: product.category, categoryId: product.categoryId, origin: product.origin,
    image: product.image, description: product.description, storage: product.storage,
    skus: skus.map((sku) => ({ id: sku._id, label: sku.label, price: amount(sku.price), stock: stock(sku) })),
  }
}
function stock(sku) {
  return integer(sku.stock, '库存', 0, Number.MAX_SAFE_INTEGER, 'DATA_INVALID')
}

function createHandler({ repository: repo, stage = 'production', enableDemo = false, now = Date.now, makeId = randomUUID }) {
  async function store(db) {
    const value = await db.get('settings', 'store')
    if (!value) fail('NOT_CONFIGURED', '门店信息尚未配置')
    amount(value.deliveryFee)
    return value
  }
  async function activeSku(db, skuId) {
    const sku = await db.get('skus', skuId)
    const product = sku && await db.get('products', sku.productId)
    if (!sku?.enabled || !product?.enabled) fail('UNAVAILABLE', '商品或规格已下架')
    amount(sku.price)
    stock(sku)
    return { sku, product }
  }
  async function quote(db, input) {
    if (!['delivery', 'pickup'].includes(input.fulfillment)) fail('INVALID_INPUT', '请选择配送方式')
    const settings = await store(db)
    const lines = []
    for (const row of mergedLines(input.lines)) {
      const { sku, product } = await activeSku(db, row.skuId)
      if (row.quantity > sku.stock) fail('OUT_OF_STOCK', product.name + '库存不足')
      lines.push({
        productId: product._id, skuId: row.skuId, name: product.name, spec: sku.label,
        image: product.image, price: sku.price, quantity: row.quantity,
      })
    }
    const subtotal = amount(lines.reduce((sum, row) => amount(sum + amount(row.price * row.quantity)), 0))
    const deliveryFee = input.fulfillment === 'delivery' ? settings.deliveryFee : 0
    return { lines, subtotal, deliveryFee, total: amount(subtotal + deliveryFee) }
  }
  async function book(db, openId) {
    const result = await db.get('addresses', hash(['user', openId]))
    return result ? owned(result, openId) : { ownerId: openId, items: [] }
  }
  async function cart(db, openId) {
    const result = await db.get('carts', hash(['user', openId]))
    return result ? owned(result, openId) : { ownerId: openId, items: [] }
  }
  async function saveUserDoc(db, collection, openId, value) {
    await db.set(collection, hash(['user', openId]), { ...value, updatedAt: now() })
  }
  const actions = {
    async catalog(input) {
      const offset = integer(input.offset ?? 0, 'offset', 0, 100000)
      const limit = integer(input.limit ?? 20, 'limit', 1, 50)
      const where = { enabled: true }
      if (input.categoryId) where.categoryId = id(input.categoryId)
      const products = await repo.list('products', where, { offset, limit: limit + 1 })
      const items = []
      for (const product of products.slice(0, limit)) {
        const skus = await repo.list('skus', { productId: product._id, enabled: true }, { limit: 100 })
        items.push(productView(product, skus))
      }
      return { items, nextOffset: products.length > limit ? offset + limit : null }
    },
    async categories() {
      return (await repo.list('categories', { enabled: true }, { limit: 100, order: [['sort', 'asc'], ['_id', 'asc']] }))
        .map((row) => ({ id: row._id, name: row.name, sort: row.sort }))
    },
    async store() {
      const value = await store(repo)
      return Object.fromEntries(['name', 'tagline', 'description', 'phone', 'address', 'hours', 'deliveryFee', 'deliveryNote']
        .map((key) => [key, value[key]]))
    },
    async product(input) {
      const value = await repo.get('products', id(input.id))
      if (!value?.enabled) fail('NOT_FOUND', '商品不存在或已下架')
      return productView(value, await repo.list('skus', { productId: value._id, enabled: true }, { limit: 100 }))
    },
    async cart(_, openId) {
      const value = await cart(repo, openId)
      const items = []
      for (const row of value.items) {
        const sku = await repo.get('skus', row.skuId)
        const product = sku && await repo.get('products', sku.productId)
        const available = !!(sku?.enabled && product?.enabled)
        items.push({ ...row, available, name: product?.name || '商品已下架', spec: sku?.label || '',
          image: product?.image ?? null, productId: product?._id ?? null,
          price: sku ? amount(sku.price) : 0, stock: available ? stock(sku) : 0 })
      }
      return items
    },
    async addCart(input, openId) {
      const skuId = id(input.skuId)
      const increment = quantity(input.quantity)
      return repo.transaction(async (db) => {
        const value = await cart(db, openId)
        const row = value.items.find((item) => item.skuId === skuId)
        const q = quantity((row?.quantity || 0) + increment)
        const { sku } = await activeSku(db, skuId)
        if (q > sku.stock) fail('OUT_OF_STOCK', '库存不足')
        if (row) row.quantity = q
        else {
          if (value.items.length >= MAX_LINES) fail('LIMIT_EXCEEDED', '购物车最多50种规格')
          value.items.push({ skuId, quantity: q, selected: true })
        }
        await saveUserDoc(db, 'carts', openId, value)
        return value.items
      })
    },
    async updateCart(input, openId) {
      const skuId = id(input.skuId)
      const q = quantity(input.quantity)
      return repo.transaction(async (db) => {
        const value = await cart(db, openId)
        const row = value.items.find((item) => item.skuId === skuId)
        if (!row) fail('NOT_FOUND', '购物车商品不存在')
        // Existing over-stock/off-shelf rows may be reduced or removed, but never bought.
        if (q >= row.quantity) {
          const { sku } = await activeSku(db, skuId)
          if (q > sku.stock) fail('OUT_OF_STOCK', '库存不足')
        }
        row.quantity = q
        await saveUserDoc(db, 'carts', openId, value)
        return value.items
      })
    },
    async selectCart(input, openId) {
      const skuId = id(input.skuId)
      const selected = boolean(input.selected)
      return repo.transaction(async (db) => {
        const value = await cart(db, openId)
        value.items.forEach((row) => { if (skuId === 'all' || row.skuId === skuId) row.selected = selected })
        await saveUserDoc(db, 'carts', openId, value)
        return value.items
      })
    },
    async removeCart(input, openId) {
      const skuId = id(input.skuId)
      return repo.transaction(async (db) => {
        const value = await cart(db, openId)
        value.items = value.items.filter((row) => row.skuId !== skuId)
        await saveUserDoc(db, 'carts', openId, value)
        return value.items
      })
    },
    async addresses(_, openId) { return (await book(repo, openId)).items },
    async saveAddress(input, openId) {
      const address = object(input.address)
      const existingId = address.id ? id(address.id) : ''
      const value = { ...contact(address, true), isDefault: boolean(address.isDefault), id: existingId || makeId() }
      return repo.transaction(async (db) => {
        const addresses = await book(db, openId)
        const old = addresses.items.find((row) => row.id === existingId)
        if (existingId && !old) fail('NOT_FOUND', '地址不存在')
        if (!old && addresses.items.length >= MAX_ADDRESSES) fail('LIMIT_EXCEEDED', '最多保存20个地址')
        if (!addresses.items.length || old?.isDefault) value.isDefault = true
        if (value.isDefault) addresses.items.forEach((row) => { row.isDefault = false })
        if (old) Object.assign(old, value)
        else addresses.items.push(value)
        await saveUserDoc(db, 'addresses', openId, addresses)
        return value.id
      })
    },
    async deleteAddress(input, openId) {
      const addressId = id(input.id)
      return repo.transaction(async (db) => {
        const addresses = await book(db, openId)
        addresses.items = addresses.items.filter((row) => row.id !== addressId)
        if (addresses.items.length && !addresses.items.some((row) => row.isDefault)) addresses.items[0].isDefault = true
        await saveUserDoc(db, 'addresses', openId, addresses)
        return null
      })
    },
    async quote(input) { return quote(repo, input) },
    async createOrder(input, openId) {
      const token = text(input.token, 'token', 128)
      const requestId = hash(['order', openId, token])
      return repo.transaction(async (db) => {
        const previous = await db.get('order_requests', requestId)
        if (previous) {
          owned(previous, openId)
          return orderView(owned(await db.get('orders', previous.orderId), openId))
        }
        const fromCart = boolean(input.fromCart)
        const priced = await quote(db, input)
        let deliveryContact
        if (input.fulfillment === 'delivery') {
          const addressId = id(input.addressId)
          const address = (await book(db, openId)).items.find((row) => row.id === addressId)
          if (!address) fail('NOT_FOUND', '请选择自己的收货地址')
          deliveryContact = contact(address, true)
        } else deliveryContact = contact(input)
        const orderId = 'FG_' + requestId
        const order = {
          id: orderId, ownerId: openId, token, status: 'pending', createdAt: now(),
          fulfillment: input.fulfillment, contact: deliveryContact, note: text(input.note ?? '', '备注', 200, true),
          paymentMode: 'none', ...priced,
        }
        for (const row of priced.lines) {
          const sku = await db.get('skus', row.skuId)
          await db.set('skus', row.skuId, { ...sku, stock: sku.stock - row.quantity })
        }
        if (fromCart) {
          const value = await cart(db, openId)
          for (const line of priced.lines) {
            const row = value.items.find((item) => item.skuId === line.skuId)
            if (row) row.quantity = Math.max(0, row.quantity - line.quantity)
          }
          value.items = value.items.filter((row) => row.quantity > 0)
          await saveUserDoc(db, 'carts', openId, value)
        }
        await db.set('orders', orderId, order)
        await db.set('order_requests', requestId, { ownerId: openId, orderId, createdAt: order.createdAt })
        return orderView(order)
      })
    },
    async getOrder(input, openId) { return orderView(owned(await repo.get('orders', id(input.id)), openId)) },
    async orders(input, openId) {
      const offset = integer(input.offset ?? 0, 'offset', 0, 100000)
      const limit = integer(input.limit ?? 20, 'limit', 1, 50)
      const rows = await repo.list('orders', { ownerId: openId }, {
        offset, limit: limit + 1, order: [['createdAt', 'desc'], ['_id', 'desc']],
      })
      return { items: rows.slice(0, limit).map(orderView), nextOffset: rows.length > limit ? offset + limit : null }
    },
    async cancelOrder(input, openId) {
      const orderId = id(input.id)
      return repo.transaction(async (db) => {
        const order = owned(await db.get('orders', orderId), openId)
        if (order.status === 'cancelled') return orderView(order)
        if (order.status !== 'pending') fail('INVALID_STATE', '已付款订单请联系店家处理')
        for (const row of order.lines) {
          const sku = await db.get('skus', row.skuId)
          if (!sku) fail('DATA_INVALID', '订单规格缺失，请联系店家')
          await db.set('skus', row.skuId, { ...sku, stock: amount(stock(sku) + quantity(row.quantity)) })
        }
        order.status = 'cancelled'
        order.cancelledAt = now()
        await db.set('orders', orderId, order)
        return orderView(order)
      })
    },
    async demoPay(input, openId) {
      requireDemo()
      if (!['success', 'fail', 'cancel'].includes(input.outcome)) fail('INVALID_INPUT', '支付结果无效')
      const orderId = id(input.id)
      return repo.transaction(async (db) => {
        const order = owned(await db.get('orders', orderId), openId)
        if (['paid', 'completed'].includes(order.status)) return orderView(order)
        if (order.status !== 'pending') fail('INVALID_STATE', '该订单无法支付')
        if (input.outcome === 'success') {
          order.status = 'paid'
          order.paymentMode = 'demo'
          order.paidAt = now()
          await db.set('orders', orderId, order)
        }
        return orderView(order)
      })
    },
    async demoCompleteOrder(input, openId) {
      requireDemo()
      const orderId = id(input.id)
      return repo.transaction(async (db) => {
        const order = owned(await db.get('orders', orderId), openId)
        if (order.paymentMode !== 'demo') fail('INVALID_STATE', '仅限模拟支付订单')
        if (order.status === 'completed') return orderView(order)
        if (order.status !== 'paid') fail('INVALID_STATE', '只能完成已付款订单')
        order.status = 'completed'
        order.completedAt = now()
        await db.set('orders', orderId, order)
        return orderView(order)
      })
    },
  }
  function requireDemo() {
    if (stage !== 'development' || enableDemo !== true) fail('DEMO_DISABLED', '模拟操作未启用')
  }
  return async (event, identity) => {
    try {
      const openId = text(identity?.openId ?? '', '用户身份', 128, true)
      if (!openId) fail('UNAUTHENTICATED', '未取得微信用户身份')
      object(event)
      if (typeof event.action !== 'string' || !Object.hasOwn(actions, event.action)) fail('UNKNOWN_ACTION', '不支持的操作')
      const data = object(event.data ?? {})
      return { ok: true, data: copy(await actions[event.action](data, openId)) }
    } catch (error) {
      return errorResponse(error)
    }
  }
}

module.exports = { createHandler }
