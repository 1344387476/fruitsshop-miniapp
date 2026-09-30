import { addresses, saveAddress } from '../../services/shop'
import { Input, errorToast, success } from '../../utils/ui'
Page({
  data: {
    id: '',
    name: '',
    phone: '',
    detail: '',
    isDefault: false,
    busy: false,
    loading: false,
    error: false,
  },
  async onLoad(q: Record<string, string>) {
    if (q.id) {
      this.setData({ loading: true })
      try {
        const a = (await addresses()).find((x) => x.id === q.id)
        if (!a) throw new Error('地址不存在')
        this.setData(a)
      } catch (e) {
        this.setData({ error: true })
        errorToast(e)
      } finally {
        this.setData({ loading: false })
      }
    }
  },
  input(e: Input) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },
  toggle(e: WechatMiniprogram.SwitchChange) {
    this.setData({ isDefault: e.detail.value })
  },
  async save() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const id = await saveAddress({
        id: this.data.id,
        name: this.data.name,
        phone: this.data.phone,
        detail: this.data.detail,
        isDefault: this.data.isDefault,
      })
      wx.setStorageSync('fruitshop:selected-address', id)
      success('地址已保存')
      wx.navigateBack()
    } catch (e) {
      errorToast(e)
    } finally {
      this.setData({ busy: false })
    }
  },
})
