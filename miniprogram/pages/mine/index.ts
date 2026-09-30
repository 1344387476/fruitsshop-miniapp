import { shop, orders } from '../../services/shop'
import { Tap, go, contact, errorToast } from '../../utils/ui'
Page({
  data: { shop, pending: 0, paid: 0, completed: 0 },
  async onShow() {
    const tab = this.getTabBar()
    if (tab) {
      tab.setData({ selected: 2 })
      tab.refresh()
    }
    try {
      const list = await orders()
      this.setData({
        pending: list.filter((x) => x.status === 'pending').length,
        paid: list.filter((x) => x.status === 'paid').length,
        completed: list.filter((x) => x.status === 'completed').length,
      })
    } catch (e) {
      errorToast(e)
    }
  },
  orders(e: Tap) {
    go('/shop/orders/index?filter=' + (e.currentTarget.dataset.filter || 'all'))
  },
  addresses() {
    go('/shop/addresses/index')
  },
  contact,
  demo() {
    go('/shop/demo/index')
  },
})
