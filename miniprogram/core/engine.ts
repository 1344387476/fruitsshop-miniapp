import { Product, State, CheckoutInput, Order, Address } from './types'
export const money = (value: number) => (value / 100).toFixed(2)
export const initialState = (): State => ({ version: 1, cart: [], addresses: [], orders: [], stock: {} })
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
export class ShopEngine {
  state: State
  constructor(
    public products: Product[],
    private fee: number,
    state?: State,
  ) {
    this.state = state ? copy(state) : initialState()
  }
  sku(id: string) {
    const product = this.products.find((p) => p.skus.some((s) => s.id === id))
    if (!product) throw new Error('商品已下架')
    const sku = product.skus.find((s) => s.id === id)!
    return { product, sku, stock: this.state.stock[id] ?? sku.stock }
  }
  quantity(q: number) {
    if (!Number.isInteger(q) || q < 1 || q > 99) throw new Error('数量需在 1–99 之间')
  }
  add(id: string, q: number) {
    this.quantity(q)
    const found = this.state.cart.find((x) => x.skuId === id)
    const quantity = (found?.quantity || 0) + q
    this.quantity(quantity)
    if (quantity > this.sku(id).stock) throw new Error('库存不足')
    if (found) found.quantity = quantity
    else this.state.cart.push({ skuId: id, quantity, selected: true })
  }
  updateCart(id: string, q: number) {
    this.quantity(q)
    const row = this.state.cart.find((x) => x.skuId === id)
    if (q > this.sku(id).stock && (!row || q >= row.quantity)) throw new Error('库存不足')
    if (row) row.quantity = q
  }
  select(id: string, selected: boolean) {
    this.state.cart.forEach((x) => {
      if (id === 'all' || x.skuId === id) x.selected = selected
    })
  }
  remove(id: string) {
    this.state.cart = this.state.cart.filter((x) => x.skuId !== id)
  }
  quote(lines: { skuId: string; quantity: number }[], fulfillment: string) {
    if (!['delivery', 'pickup'].includes(fulfillment)) throw new Error('请选择配送方式')
    if (!lines.length) throw new Error('请先选择商品')
    const merged: Record<string, number> = {}
    lines.forEach((x) => {
      this.quantity(x.quantity)
      merged[x.skuId] = (merged[x.skuId] || 0) + x.quantity
    })
    const result = Object.keys(merged).map((id) => {
      const quantity = merged[id]
      this.quantity(quantity)
      const { product, sku, stock } = this.sku(id)
      if (quantity > stock) throw new Error(product.name + '库存不足')
      return {
        productId: product.id,
        skuId: id,
        name: product.name,
        spec: sku.label,
        image: product.image,
        price: sku.price,
        quantity,
      }
    })
    const subtotal = result.reduce((sum, x) => sum + x.price * x.quantity, 0)
    const deliveryFee = fulfillment === 'delivery' ? this.fee : 0
    return { lines: result, subtotal, deliveryFee, total: subtotal + deliveryFee }
  }
  contact(name: string, phone: string) {
    if (!name.trim()) throw new Error('请填写联系人')
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请填写正确的手机号')
  }
  saveAddress(input: Address) {
    input = { ...input, name: input.name.trim(), phone: input.phone.trim(), detail: input.detail.trim() }
    this.contact(input.name, input.phone)
    if (input.detail.length < 5) throw new Error('请填写完整地址（至少5个字）')
    const old = this.state.addresses.find((x) => x.id === input.id)
    if (!old) input.id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    if (!this.state.addresses.length) input.isDefault = true
    if (old?.isDefault) input.isDefault = true
    if (input.isDefault) this.state.addresses.forEach((x) => (x.isDefault = false))
    if (old) Object.assign(old, input)
    else this.state.addresses.push(input)
    return input.id
  }
  deleteAddress(id: string) {
    this.state.addresses = this.state.addresses.filter((x) => x.id !== id)
    if (this.state.addresses.length && !this.state.addresses.some((x) => x.isDefault))
      this.state.addresses[0].isDefault = true
  }
  create(input: CheckoutInput): Order {
    if (!input.token) throw new Error('结算已失效，请重新进入')
    const existing = this.state.orders.find((x) => x.token === input.token)
    if (existing) return copy(existing)
    const quote = this.quote(input.lines, input.fulfillment)
    let contact = { name: (input.name || '').trim(), phone: (input.phone || '').trim(), detail: '' }
    if (input.fulfillment === 'delivery') {
      const address = this.state.addresses.find((x) => x.id === input.addressId)
      if (!address) throw new Error('请选择收货地址')
      contact = { name: address.name, phone: address.phone, detail: address.detail }
    }
    this.contact(contact.name, contact.phone)
    const order: Order = {
      id: 'FG' + Date.now().toString() + Math.random().toString(36).slice(2, 5).toUpperCase(),
      token: input.token,
      createdAt: Date.now(),
      status: 'pending',
      fulfillment: input.fulfillment,
      contact,
      note: input.note.trim().slice(0, 200),
      ...quote,
    }
    quote.lines.forEach((x) => {
      this.state.stock[x.skuId] = this.sku(x.skuId).stock - x.quantity
    })
    this.state.orders.unshift(order)
    if (input.fromCart) {
      for (const line of quote.lines) {
        const row = this.state.cart.find((x) => x.skuId === line.skuId)
        if (row) {
          row.quantity -= line.quantity
          if (row.quantity <= 0) this.remove(row.skuId)
        }
      }
    }
    return copy(order)
  }
  order(id: string) {
    const o = this.state.orders.find((x) => x.id === id)
    if (!o) throw new Error('订单不存在')
    return o
  }
  pay(id: string, outcome: string) {
    const order = this.order(id)
    if (order.status === 'paid' || order.status === 'completed') return
    if (order.status !== 'pending') throw new Error('该订单无法支付')
    if (!['success', 'fail', 'cancel'].includes(outcome)) throw new Error('支付结果无效')
    if (outcome === 'success') order.status = 'paid'
  }
  cancel(id: string) {
    const order = this.order(id)
    if (order.status === 'cancelled') return
    if (order.status !== 'pending') throw new Error('已付款订单请联系店家处理')
    order.lines.forEach((x) => {
      this.state.stock[x.skuId] = this.sku(x.skuId).stock + x.quantity
    })
    order.status = 'cancelled'
  }
  complete(id: string) {
    const order = this.order(id)
    if (order.status !== 'paid') throw new Error('只能完成已付款订单')
    order.status = 'completed'
  }
}
