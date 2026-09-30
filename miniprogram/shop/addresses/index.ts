import { addresses, deleteAddress } from '../../services/shop'
import { Address } from '../../core/types'
import { Tap, go, errorToast } from '../../utils/ui'
Page({
  data: { items: [] as Address[], select: false, error: false, loading: true },
  onLoad(q: Record<string, string>) {
    this.setData({ select: q.select === '1' })
  },
  onShow() {
    this.load()
  },
  async load() {
    try {
      this.setData({ items: await addresses(), error: false, loading: false })
    } catch (e) {
      this.setData({ error: true, loading: false })
      errorToast(e)
    }
  },
  add() {
    go('/shop/address-edit/index')
  },
  edit(e: Tap) {
    go('/shop/address-edit/index?id=' + e.currentTarget.dataset.id)
  },
  choose(e: Tap) {
    if (this.data.select) {
      wx.setStorageSync('fruitshop:selected-address', e.currentTarget.dataset.id)
      wx.navigateBack()
    }
  },
  remove(e: Tap) {
    const id = String(e.currentTarget.dataset.id)
    wx.showModal({
      title: '删除这个地址？',
      content: '已有订单中的地址不会改变。',
      confirmColor: '#d96b45',
      success: async (r) => {
        if (r.confirm)
          try {
            await deleteAddress(id)
            await this.load()
          } catch (e) {
            errorToast(e)
          }
      },
    })
  },
})
