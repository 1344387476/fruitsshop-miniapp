Component({
  properties: { title: { type: String, value: '' }, back: { type: Boolean, value: true } },
  data: { top: 20, height: 44, right: 90 },
  lifetimes: {
    attached() {
      const w = wx.getWindowInfo()
      const r = wx.getMenuButtonBoundingClientRect()
      this.setData({
        top: w.statusBarHeight,
        height: (r.top - w.statusBarHeight) * 2 + r.height,
        right: w.windowWidth - r.left + 8,
      })
    },
  },
  methods: {
    back() {
      if (getCurrentPages().length > 1) wx.navigateBack()
      else wx.switchTab({ url: '/pages/index/index' })
    },
  },
})
