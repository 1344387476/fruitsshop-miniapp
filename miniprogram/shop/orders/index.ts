import { orders, orderView } from '../../services/shop'
import { Tap, errorToast, go } from '../../utils/ui'
Page({
  data: {
    filter: 'all',
    items: [] as ReturnType<typeof orderView>[],
    tabs: [
      { id: 'all', name: '全部' },
      { id: 'pending', name: '待支付' },
      { id: 'paid', name: '待配送 / 自提' },
      { id: 'completed', name: '已完成' },
      { id: 'cancelled', name: '已取消' },
    ],
    loading: true,
    error: false,
  },
  onLoad(q: Record<string, string>) {
    this.setData({ filter: q.filter || 'all' })
  },
  onShow() {
    this.load()
  },
  async load() {
    try {
      const list = await orders()
      this.setData({
        items: list.filter((x) => this.data.filter === 'all' || x.status === this.data.filter).map(orderView),
        loading: false,
        error: false,
      })
    } catch (e) {
      this.setData({ loading: false, error: true })
      errorToast(e)
    }
  },
  filter(e: Tap) {
    this.setData({ filter: String(e.currentTarget.dataset.id) })
    this.load()
  },
  detail(e: Tap) {
    go('/shop/order/index?id=' + e.currentTarget.dataset.id)
  },
  home() {
    wx.switchTab({ url: '/pages/index/index' })
  },
})
