export type Fulfillment = 'delivery' | 'pickup'
export type OrderStatus = 'pending' | 'paid' | 'completed' | 'cancelled'
export interface SKU {
  id: string
  label: string
  price: number
  stock: number
}
export interface Product {
  id: string
  name: string
  subtitle: string
  category: string
  image: number
  origin: string
  description: string
  storage: string
  skus: SKU[]
}
export interface CartItem {
  skuId: string
  quantity: number
  selected: boolean
}
export interface Address {
  id: string
  name: string
  phone: string
  detail: string
  isDefault: boolean
}
export interface OrderLine {
  productId: string
  skuId: string
  name: string
  spec: string
  image: number
  price: number
  quantity: number
}
export interface Order {
  id: string
  token: string
  createdAt: number
  status: OrderStatus
  fulfillment: Fulfillment
  contact: { name: string; phone: string; detail: string }
  note: string
  lines: OrderLine[]
  subtotal: number
  deliveryFee: number
  total: number
}
export interface CheckoutInput {
  token: string
  lines: { skuId: string; quantity: number }[]
  fulfillment: Fulfillment
  addressId?: string
  name?: string
  phone?: string
  note: string
  fromCart: boolean
}
export interface State {
  version: 1
  cart: CartItem[]
  addresses: Address[]
  orders: Order[]
  stock: Record<string, number>
}
