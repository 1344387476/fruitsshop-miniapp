import { product } from '../../services/shop'
import { Tap, errorToast, contact } from '../../utils/ui'
Page({
  data: { item: null as Awaited<ReturnType<typeof product>> | null, picker: '', buy: false, error: false },
  onLoad(q: Record<string, string>) {
    this.load(q.id)
  },
  async load(id: string) {
    try {
      this.setData({ item: await product(id), error: false })
    } catch (e) {
      this.setData({ error: true })
      errorToast(e)
    }
  },
  open(e: Tap) {
    if (this.data.item) this.setData({ picker: this.data.item.id, buy: !!e.currentTarget.dataset.buy })
  },
  close() {
    this.setData({ picker: '' })
  },
  contact,
  cart() {
    wx.switchTab({ url: '/pages/cart/index' })
  },
})
