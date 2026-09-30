import { orders, orderView, completeOrder, resetDemo } from '../../services/shop'
import { Tap, errorToast, success } from '../../utils/ui'
Page({
  data: { items: [] as ReturnType<typeof orderView>[], busy: false },
  onShow() {
    this.load()
  },
  async load() {
    try {
      this.setData({ items: (await orders()).filter((x) => x.status === 'paid').map(orderView) })
    } catch (e) {
      errorToast(e)
    }
  },
  async complete(e: Tap) {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await completeOrder(String(e.currentTarget.dataset.id))
      success('订单已完成')
      await this.load()
    } catch (e) {
      errorToast(e)
    } finally {
      this.setData({ busy: false })
    }
  },
  reset() {
    wx.showModal({
      title: '重置本地演示数据？',
      content: '仅清空此小程序的演示购物车、地址和订单，并恢复演示库存。此操作不可撤销。',
      confirmColor: '#d96b45',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await resetDemo()
          wx.removeStorageSync('fruitshop:selected-address')
          await this.load()
          success('已重置')
        } catch (e) {
          errorToast(e)
        }
      },
    })
  },
})
