import { product, addCart } from '../../services/shop'
import { errorToast, success, go, Tap } from '../../utils/ui'
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    productId: { type: String, value: '', observer: 'load' },
    buy: { type: Boolean, value: false },
  },
  data: { item: null as Awaited<ReturnType<typeof product>> | null, index: 0, quantity: 1, busy: false },
  methods: {
    async load(id: string) {
      if (!id) {
        this.setData({ item: null })
        return
      }
      try {
        const item = await product(id)
        this.setData({
          item,
          index: Math.max(
            0,
            item.skus.findIndex((s) => s.stock > 0),
          ),
          quantity: 1,
        })
      } catch (e) {
        errorToast(e)
        this.close()
      }
    },
    close() {
      this.triggerEvent('close')
    },
    noop() {},
    choose(e: Tap) {
      const index = Number(e.currentTarget.dataset.index)
      if (this.data.item!.skus[index].stock) this.setData({ index, quantity: 1 })
    },
    step(e: Tap) {
      const q = this.data.quantity + Number(e.currentTarget.dataset.delta)
      const sku = this.data.item!.skus[this.data.index]
      if (q >= 1 && q <= Math.min(99, sku.stock)) this.setData({ quantity: q })
    },
    async submit() {
      if (this.data.busy || !this.data.item) return
      this.setData({ busy: true })
      try {
        const sku = this.data.item.skus[this.data.index]
        if (!sku.stock) throw new Error('商品暂时售罄')
        if (this.data.buy) {
          go('/shop/checkout/index?sku=' + sku.id + '&quantity=' + this.data.quantity)
        } else {
          await addCart(sku.id, this.data.quantity)
          success('已加入购物车')
          this.triggerEvent('added')
        }
        this.close()
      } catch (e) {
        errorToast(e)
      } finally {
        this.setData({ busy: false })
      }
    },
  },
})
