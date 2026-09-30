import * as api from '../../services/shop'
import { Address, Fulfillment } from '../../core/types'
import { Tap, Input, errorToast, go } from '../../utils/ui'
Page({
  data: {
    shop: api.shop,
    mode: 'delivery' as Fulfillment,
    address: null as Address | null,
    name: '',
    phone: '',
    note: '',
    lines: [] as { skuId: string; quantity: number }[],
    viewLines: [] as Record<string, unknown>[],
    subtotal: '0.00',
    fee: api.money(api.shop.deliveryFee),
    total: '0.00',
    busy: false,
    loading: true,
    error: '',
    token: '',
    fromCart: true,
  },
  async onLoad(q: Record<string, string>) {
    this.setData({ token: Date.now().toString(36) + Math.random().toString(36).slice(2), fromCart: !q.sku })
    try {
      const lines = q.sku
        ? [{ skuId: q.sku, quantity: Number(q.quantity) }]
        : (await api.cart()).filter((x) => x.selected).map((x) => ({ skuId: x.skuId, quantity: x.quantity }))
      this.setData({ lines })
      await this.recalculate()
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '加载失败' })
    }
  },
  async onShow() {
    try {
      const list = await api.addresses()
      const chosen = wx.getStorageSync('fruitshop:selected-address') as string
      const address =
        list.find((x) => x.id === chosen) ||
        list.find((x) => x.id === this.data.address?.id) ||
        list.find((x) => x.isDefault) ||
        list[0] ||
        null
      this.setData({ address })
    } catch (e) {
      errorToast(e)
    }
  },
  async recalculate() {
    try {
      const quote = await api.quote(this.data.lines, this.data.mode)
      this.setData({
        viewLines: quote.lines.map((x) => ({ ...x, priceText: api.money(x.price) })),
        subtotal: api.money(quote.subtotal),
        fee: api.money(quote.deliveryFee),
        total: api.money(quote.total),
        loading: false,
        error: '',
      })
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '结算失败' })
    }
  },
  async mode(e: Tap) {
    this.setData({ mode: e.currentTarget.dataset.mode as Fulfillment })
    await this.recalculate()
  },
  input(e: Input) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },
  address() {
    go('/shop/addresses/index?select=1')
  },
  async submit() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const order = await api.createOrder({
        token: this.data.token,
        lines: this.data.lines,
        fulfillment: this.data.mode,
        addressId: this.data.address?.id,
        name: this.data.name,
        phone: this.data.phone,
        note: this.data.note,
        fromCart: this.data.fromCart,
      })
      wx.redirectTo({ url: '/shop/payment/index?id=' + order.id })
    } catch (e) {
      errorToast(e)
    } finally {
      this.setData({ busy: false })
    }
  },
})
