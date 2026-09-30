import { cart } from '../services/shop'
Component({
  data: {
    selected: 0,
    count: 0,
    hidden: false,
    tabs: [
      { text: '首页', icon: 'shop', path: '/pages/index/index' },
      { text: '购物车', icon: 'cart', path: '/pages/cart/index' },
      { text: '我的', icon: 'user', path: '/pages/mine/index' },
    ],
  },
  methods: {
    switch(e: WechatMiniprogram.TouchEvent) {
      wx.switchTab({ url: this.data.tabs[Number(e.currentTarget.dataset.index)].path })
    },
    async refresh() {
      try {
        const rows = await cart()
        this.setData({ count: rows.reduce((s, x) => s + x.quantity, 0) })
      } catch (_) {}
    },
  },
})
