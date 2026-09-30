import { catalog, categories, shop } from '../../services/shop'
import { go, errorToast, Tap } from '../../utils/ui'
Page({
  data: {
    shop,
    categories,
    active: '全部',
    all: [] as Awaited<ReturnType<typeof catalog>>,
    items: [] as Awaited<ReturnType<typeof catalog>>,
    loading: true,
    error: false,
    picker: '',
  },
  onShow() {
    this.load()
    const tab = this.getTabBar()
    if (tab) {
      tab.setData({ selected: 0, hidden: false })
      tab.refresh()
    }
  },
  async load() {
    try {
      const all = await catalog()
      this.setData({
        all,
        items: this.data.active === '全部' ? all : all.filter((p) => p.category === this.data.active),
        loading: false,
        error: false,
      })
    } catch (_) {
      this.setData({ loading: false, error: true })
    }
  },
  filter(e: Tap) {
    const active = String(e.currentTarget.dataset.category)
    this.setData({
      active,
      items: active === '全部' ? this.data.all : this.data.all.filter((p) => p.category === active),
    })
  },
  detail(e: Tap) {
    go('/shop/detail/index?id=' + e.currentTarget.dataset.id)
  },
  add(e: Tap) {
    if (!e.currentTarget.dataset.stock) {
      errorToast(new Error('今天已售罄，看看其他水果吧'))
      return
    }
    this.setData({ picker: String(e.currentTarget.dataset.id) })
    const tab = this.getTabBar()
    if (tab) tab.setData({ hidden: true })
  },
  close() {
    this.setData({ picker: '' })
    const tab = this.getTabBar()
    if (tab) tab.setData({ hidden: false })
  },
  added() {
    const tab = this.getTabBar()
    if (tab) tab.refresh()
  },
  browse() {
    wx.pageScrollTo({ selector: '#goods', duration: 260 })
  },
  async onPullDownRefresh() {
    await this.load()
    wx.stopPullDownRefresh()
  },
})
