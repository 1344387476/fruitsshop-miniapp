import { ShopEngine, initialState, money } from '../core/engine'
import { products, categories } from '../data/products'
import { shop } from '../config/shop'
import { State, CheckoutInput, Address, Order } from '../core/types'
export { shop, categories, money }
const KEY = 'fruitshop:v1'
let engine: ShopEngine
function get() {
  if (!engine) {
    const saved = wx.getStorageSync(KEY) as State
    engine = new ShopEngine(products, shop.deliveryFee, saved?.version === 1 ? saved : initialState())
  }
  return engine
}
async function write<T>(fn: (e: ShopEngine) => T): Promise<T> {
  const e = get(),
    backup = JSON.parse(JSON.stringify(e.state)) as State
  try {
    const result = fn(e)
    wx.setStorageSync(KEY, e.state)
    return result
  } catch (error) {
    e.state = backup
    throw error
  }
}
export const catalog = async () =>
  products.map((p) => ({
    ...p,
    priceText: money(p.skus[0].price),
    stock: p.skus.reduce((sum, s) => sum + get().sku(s.id).stock, 0),
  }))
export const product = async (id: string) => {
  const p = products.find((x) => x.id === id)
  if (!p) throw new Error('商品不存在')
  return {
    ...p,
    skus: p.skus.map((s) => ({ ...s, stock: get().sku(s.id).stock, priceText: money(s.price) })),
  }
}
export const cart = async () =>
  get().state.cart.map((row) => {
    const { product: p, sku, stock } = get().sku(row.skuId)
    return {
      ...row,
      name: p.name,
      image: p.image,
      spec: sku.label,
      price: sku.price,
      priceText: money(sku.price),
      productId: p.id,
      stock,
    }
  })
export const addCart = (id: string, q: number) => write((e) => e.add(id, q))
export const updateCart = (id: string, q: number) => write((e) => e.updateCart(id, q))
export const selectCart = (id: string, s: boolean) => write((e) => e.select(id, s))
export const removeCart = (id: string) => write((e) => e.remove(id))
export const addresses = async () => JSON.parse(JSON.stringify(get().state.addresses)) as Address[]
export const saveAddress = (a: Address) => write((e) => e.saveAddress(a))
export const deleteAddress = (id: string) => write((e) => e.deleteAddress(id))
export const quote = async (lines: { skuId: string; quantity: number }[], mode: string) =>
  get().quote(lines, mode)
export const createOrder = (input: CheckoutInput) => write((e) => e.create(input))
export const getOrder = async (id: string) => JSON.parse(JSON.stringify(get().order(id))) as Order
export const orders = async () => JSON.parse(JSON.stringify(get().state.orders)) as Order[]
export const pay = (id: string, outcome: string) => write((e) => e.pay(id, outcome))
export const cancelOrder = (id: string) => write((e) => e.cancel(id))
export const completeOrder = (id: string) => write((e) => e.complete(id))
export const resetDemo = () =>
  write((e) => {
    e.state = initialState()
  })
export const statusText = (o: Order) =>
  ({
    pending: '待支付',
    paid: o.fulfillment === 'delivery' ? '待配送' : '待自提',
    completed: '已完成',
    cancelled: '已取消',
  })[o.status]
export const orderView = (o: Order) => ({
  ...o,
  totalText: money(o.total),
  subtotalText: money(o.subtotal),
  feeText: money(o.deliveryFee),
  statusText: statusText(o),
  dateText: new Date(o.createdAt).toLocaleString(),
  lines: o.lines.map((x) => ({ ...x, priceText: money(x.price) })),
})
