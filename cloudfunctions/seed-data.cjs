'use strict'

// Pure data definition. Loading this file never contacts or writes to a cloud environment.
// Derived from miniprogram/data/products.ts and miniprogram/config/shop.ts (2026-09-26).
const entries = [
  ['脆甜红富士', '一口清脆，满口苹果香', 1, '山东烟台', 1280, '4个装 / 约800g'],
  ['蜜甜小柑橘', '薄皮好剥，清甜多汁', 2, '广西桂林', 990, '500g / 份'],
  ['香甜香蕉', '软糯香甜，早餐好搭档', 3, '云南红河', 890, '约750g / 把'],
  ['阳光玫瑰葡萄', '清甜爽口，淡淡玫瑰香', 4, '云南大理', 2490, '500g / 盒'],
  ['清甜水蜜桃', '细腻果肉，温柔桃香', 0, '山东临沂', 1680, '4个装 / 约800g'],
  ['金钻菠萝', '浓郁果香，酸甜刚刚好', 3, '海南万宁', 1590, '1个 / 约1.2kg'],
  ['鲜摘蓝莓', '小小一颗，自然酸甜', 4, '云南昆明', 1990, '125g / 盒'],
  ['清爽西瓜', '水分充足，清甜解渴', 0, '山东潍坊', 1690, '半个 / 约1.5kg'],
  ['绿心猕猴桃', '酸甜平衡，满满果香', 0, '陕西周至', 1490, '6个装 / 约600g'],
  ['多汁秋月梨', '细嫩无渣，清甜润口', 1, '山东莱阳', 1590, '2个装 / 约900g'],
  ['香甜大芒果', '饱满果肉，浓浓热带香', 3, '海南三亚', 2290, '2个装 / 约800g'],
  ['红颜草莓', '红润鲜甜，留住好心情', 4, '辽宁丹东', 2690, '250g / 盒'],
]

function seedData() {
  const names = ['当季鲜果', '苹果梨类', '柑橘橙类', '热带水果', '葡萄浆果']
  const categories = names.map((name, i) => ({ _id: 'c' + i, name, sort: i, enabled: true }))
  const products = entries.map(([name, subtitle, category, origin], i) => ({
    _id: 'p' + i, name, subtitle, category: names[category], categoryId: 'c' + category,
    origin, image: i, enabled: true,
    description: subtitle + '。门店悉心挑选，新鲜打包。水果为自然生长，大小与外观略有差异，请以实物为准。',
    storage: ['香蕉', '菠萝', '芒果'].some((word) => name.includes(word))
      ? '置于阴凉通风处，成熟后尽快食用。'
      : '收到后冷藏保存，建议尽快食用，享受新鲜口感。',
  }))
  const skus = entries.flatMap((entry, i) => [
    { _id: 's' + i + 'a', productId: 'p' + i, label: entry[5], price: entry[4], stock: i === 11 ? 0 : 30, enabled: true },
    { _id: 's' + i + 'b', productId: 'p' + i, label: '双份装 · ' + entry[5], price: entry[4] * 2, stock: i === 11 ? 0 : 15, enabled: true },
  ])
  const settings = [{
    _id: 'store', name: '百果集', tagline: '把新鲜，带回日常。',
    description: '认真挑选每一份新鲜，附近的好水果，就在这里。', phone: '',
    address: '门店地址待配置', hours: '09:00–21:00', deliveryFee: 600,
    deliveryNote: '下单后由门店安排配送，具体送达时间请联系店家。',
  }]
  return { categories, products, skus, settings, carts: [], addresses: [], orders: [], order_requests: [] }
}

module.exports = { seedData }

// Output one collection as JSON Lines for later manual import into an EMPTY collection.
if (require.main === module) {
  const collections = seedData()
  const collection = process.argv[2]
  if (!Object.hasOwn(collections, collection)) {
    console.error('Usage: node cloudfunctions/seed-data.cjs <' + Object.keys(collections).join('|') + '>')
    process.exitCode = 1
  } else collections[collection].forEach((row) => console.log(JSON.stringify(row)))
}
