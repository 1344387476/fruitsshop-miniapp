import { cart, selectCart, updateCart, removeCart, money, shop } from '../../services/shop'
import { Tap, errorToast, go } from '../../utils/ui'
Page({
  data: {
    feeText: money(shop.deliveryFee),
    items: [] as Awaited<ReturnType<typeof cart>>,
    total: '0.00',
    count: 0,
    all: false,
    loading: true,
    error: false,
  },
  onShow() {
    this.load()
    const tab = this.getTabBar()
    if (tab) tab.setData({ selected: 1 })
  },
  async load() {
    try {
      const items = await cart()
      const chosen = items.filter((x) => x.selected)
      this.setData({
        items,
        total: money(chosen.reduce((s, x) => s + x.price * x.quantity, 0)),
        count: chosen.reduce((s, x) => s + x.quantity, 0),
        all: !!items.length && items.every((x) => x.selected),
        loading: false,
        error: false,
      })
      const tab = this.getTabBar()
      if (tab) tab.refresh()
    } catch (_) {
      this.setData({ loading: false, error: true })
    }
  },
  async select(e: Tap) {
    try {
      await selectCart(String(e.currentTarget.dataset.id), !e.currentTarget.dataset.selected)
      await this.load()
    } catch (e) {
      errorToast(e)
    }
  },
  async step(e: Tap) {
    try {
      await updateCart(
        String(e.currentTarget.dataset.id),
        Number(e.currentTarget.dataset.quantity) + Number(e.currentTarget.dataset.delta),
      )
      await this.load()
    } catch (e) {
      errorToast(e)
    }
  },
  remove(e: Tap) {
    const id = String(e.currentTarget.dataset.id)
    wx.showModal({
      title: '移除这份水果？',
      content: '之后还可以从首页重新添加。',
      confirmColor: '#d96b45',
      success: async (r) => {
        if (r.confirm)
          try {
            await removeCart(id)
            await this.load()
          } catch (e) {
            errorToast(e)
          }
      },
    })
  },
  browse() {
    wx.switchTab({ url: '/pages/index/index' })
  },
  checkout() {
    if (this.data.count) go('/shop/checkout/index')
  },
  detail(e: Tap) {
    go('/shop/detail/index?id=' + e.currentTarget.dataset.id)
  },
})
