import { getOrder, orderView, cancelOrder, shop } from '../../services/shop'
import { errorToast, go, contact } from '../../utils/ui'
Page({
  data: { shop, id: '', order: null as ReturnType<typeof orderView> | null, error: false, busy: false },
  onLoad(q: Record<string, string>) {
    this.setData({ id: q.id })
  },
  onShow() {
    this.load()
  },
  async load() {
    try {
      this.setData({ order: orderView(await getOrder(this.data.id)), error: false })
    } catch (e) {
      this.setData({ error: true })
      errorToast(e)
    }
  },
  pay() {
    go('/shop/payment/index?id=' + this.data.id)
  },
  cancel() {
    if (this.data.busy) return
    wx.showModal({
      title: '取消这笔订单？',
      content: '商品会释放库存，如需购买可重新下单。',
      confirmColor: '#d96b45',
      success: async (r) => {
        if (!r.confirm) return
        this.setData({ busy: true })
        try {
          await cancelOrder(this.data.id)
          await this.load()
        } catch (e) {
          errorToast(e)
        } finally {
          this.setData({ busy: false })
        }
      },
    })
  },
  contact,
})
