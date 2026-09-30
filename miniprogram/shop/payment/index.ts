import { getOrder, pay, money } from '../../services/shop'
import { errorToast } from '../../utils/ui'
Page({
  data: { id: '', total: '0.00', state: 'ready', busy: false, error: false },
  onLoad(q: Record<string, string>) {
    this.setData({ id: q.id })
    this.load()
  },
  async load() {
    try {
      const o = await getOrder(this.data.id)
      this.setData({
        total: money(o.total),
        state: o.status === 'pending' ? 'ready' : o.status === 'cancelled' ? 'closed' : 'success',
      })
    } catch (e) {
      this.setData({ error: true })
      errorToast(e)
    }
  },
  async outcome(outcome: string) {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await pay(this.data.id, outcome)
      this.setData({ state: outcome })
    } catch (e) {
      errorToast(e)
    } finally {
      this.setData({ busy: false })
    }
  },
  success() {
    this.outcome('success')
  },
  fail() {
    this.outcome('fail')
  },
  cancel() {
    this.outcome('cancel')
  },
  retry() {
    this.setData({ state: 'ready' })
  },
  order() {
    wx.redirectTo({ url: '/shop/order/index?id=' + this.data.id })
  },
  home() {
    wx.switchTab({ url: '/pages/index/index' })
  },
})
