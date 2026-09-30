Component({
  properties: { index: { type: Number, value: 0 }, label: { type: String, value: '新鲜水果' } },
  data: { failed: false },
  methods: {
    fail() {
      this.setData({ failed: true })
    },
  },
})
