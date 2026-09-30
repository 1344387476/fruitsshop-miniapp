// Layout QA using the actual WXML, WXSS and Page data. This is NOT the WeChat runtime.
require('./register-ts.cjs')
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http')
const { parseDocument } = require('htmlparser2')
const { chromium } = require('playwright-core')
const root = path.resolve('miniprogram'),
  out = path.resolve('artifacts/visual')
let captured
const memory = {}
global.Page = (o) => (captured = o)
global.wx = {
  getStorageSync: (k) => memory[k],
  setStorageSync: (k, v) => (memory[k] = JSON.parse(JSON.stringify(v))),
  showToast() {},
  getWindowInfo: () => ({ statusBarHeight: 24, windowWidth: 375 }),
}
const api = require('../miniprogram/services/shop.ts')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const escape = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')
function evaluate(code, data) {
  try {
    return Function('scope', 'with(scope){return (' + code + ')}')(data)
  } catch {
    return undefined
  }
}
function value(s, data) {
  if (!s) return s
  const exact = s.match(/^{{([^{}]*?)}}$/)
  if (exact) return evaluate(exact[1], data)
  return s.replace(/{{([\s\S]*?)}}/g, (_, x) => String(evaluate(x, data) ?? ''))
}
function children(nodes, data) {
  let branch = false,
    chain = false
  return (nodes || [])
    .map((n) => {
      if (n.type === 'text') return escape(value(n.data, data))
      if (n.type !== 'tag') return ''
      const a = n.attribs || {}
      if ('wx:if' in a) {
        chain = true
        branch = !!value(a['wx:if'], data)
        if (!branch) return ''
      } else if ('wx:elif' in a) {
        if (branch) return ''
        branch = !!value(a['wx:elif'], data)
        if (!branch) return ''
      } else if ('wx:else' in a) {
        if (chain && branch) return ''
        branch = true
      } else {
        branch = false
        chain = false
      }
      if ('wx:for' in a) {
        const list = value(a['wx:for'], data) || []
        return list
          .map((item, index) =>
            render(n, { ...data, [a['wx:for-item'] || 'item']: item, [a['wx:for-index'] || 'index']: index }),
          )
          .join('')
      }
      return render(n, data)
    })
    .join('')
}
function markup(file, data) {
  return children(parseDocument(read(file), { xmlMode: true, decodeEntities: false }).children, data)
}
function render(n, data) {
  const a = n.attribs || {},
    v = (k) => value(a[k], data)
  if (n.name === 'block') return children(n.children, data)
  if (n.name === 'nav')
    return (
      '<div class="nav" style="padding-top:24px"><div class="bar" style="height:44px;padding-right:95px">' +
      (v('back') === false ? '' : '<button class="back">‹</button>') +
      '<span class="' +
      (v('back') === false ? 'brand' : '') +
      '">' +
      escape(v('title')) +
      '</span></div></div>'
    )
  if (n.name === 'fruit-image')
    return (
      '<div class="fruit-host">' +
      markup('components/fruit-image/index.wxml', {
        index: v('index') || 0,
        label: v('label'),
        failed: false,
      }) +
      '</div>'
    )
  if (n.name === 't-icon')
    return (
      '<i class="t-icon t-icon-' +
      v('name') +
      '" style="font-size:' +
      (v('size') || 20) +
      'px;' +
      (v('color') ? 'color:' + v('color') : '') +
      '"></i>'
    )
  if (n.name === 'sku-picker') return ''
  if (n.name === 'switch') return '<input type="checkbox" ' + (v('checked') ? 'checked' : '') + '>'
  const tag = { view: 'div', text: 'span', image: 'img', 'scroll-view': 'div' }[n.name] || n.name
  let attrs = ''
  for (const k of ['class', 'style', 'placeholder', 'maxlength', 'type', 'aria-label'])
    if (k in a) attrs += ' ' + k + '="' + escape(v(k)) + '"'
  if ('disabled' in a && v('disabled')) attrs += ' disabled'
  if (tag === 'img') attrs += ' src="' + escape(v('src')) + '"'
  if (tag === 'input') attrs += ' value="' + escape(v('value')) + '"'
  if (n.name === 'scroll-view') attrs = attrs.replace('class="', 'class="scroll-view ')
  return (
    '<' +
    tag +
    attrs +
    '>' +
    (tag === 'textarea' ? escape(v('value') || '') : children(n.children, data)) +
    '</' +
    tag +
    '>'
  )
}
function css(file) {
  return read(file)
    .replace(/@import\s+['"]([^'"]+)['"];?/g, (_, p) =>
      css(path.posix.normalize(path.posix.join(path.posix.dirname(file), p))),
    )
    .replace(/(-?[\d.]+)rpx/g, 'calc($1 * var(--rpx))')
    .replace(/(?<![.\w-])page(?=[\s,{])/g, 'body')
    .replace(/(?<![.\w-])view(?=[\s,:>+.{])/g, 'div')
    .replace(/(?<![.\w-])text(?=[\s,:>+.{])/g, 'span')
    .replace(/:host/g, '.fruit-host')
}
function page(file) {
  const full = path.join(root, file + '.ts')
  delete require.cache[full]
  require(full)
  return {
    ...captured,
    data: JSON.parse(JSON.stringify(captured.data)),
    setData(x) {
      Object.assign(this.data, x)
    },
    getTabBar() {
      return { setData() {}, refresh() {} }
    },
  }
}
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  await api.resetDemo()
  await api.addCart('s0a', 2)
  await api.addCart('s1a', 1)
  const aid = await api.saveAddress({
    id: '',
    name: '陈女士',
    phone: '13800138000',
    detail: '测试城市新鲜街道阳光花园3栋1201室',
    isDefault: true,
  })
  const pages = []
  for (const file of [
    'pages/index/index',
    'pages/cart/index',
    'pages/mine/index',
    'shop/detail/index',
    'shop/checkout/index',
    'shop/addresses/index',
    'shop/address-edit/index',
  ]) {
    const p = page(file)
    if (file === 'shop/detail/index') await p.load('p0')
    else if (file === 'shop/checkout/index') {
      await p.onLoad({})
      await p.onShow()
    } else if (file === 'shop/address-edit/index') await p.onLoad({ id: aid })
    else if (p.load) await p.load()
    else if (p.onShow) await p.onShow()
    pages.push({ file, data: JSON.parse(JSON.stringify(p.data)) })
    if (file === 'shop/checkout/index') {
      await p.mode({ currentTarget: { dataset: { mode: 'pickup' } } })
      pages.push({ file, name: 'pickup', data: { ...p.data, name: '陈女士', phone: '13800138000' } })
    }
  }
  const order = await api.createOrder({
    token: 'visual',
    lines: [{ skuId: 's0a', quantity: 2 }],
    fulfillment: 'delivery',
    addressId: aid,
    note: '请放在门口，谢谢',
    fromCart: false,
  })
  await api.pay(order.id, 'success')
  for (const file of ['shop/orders/index', 'shop/order/index', 'shop/payment/index']) {
    const p = page(file)
    if (p.data.id !== undefined) p.data.id = order.id
    await p.load()
    pages.push({ file, data: JSON.parse(JSON.stringify(p.data)) })
  }
  const home = pages[0],
    item = await api.product('p0')
  pages.push({
    file: home.file,
    name: 'sku',
    data: home.data,
    overlay: markup('components/sku-picker/index.wxml', {
      productId: 'p0',
      item,
      index: 0,
      quantity: 1,
      busy: false,
      buy: false,
    }),
  })
  const common =
    css('app.wxss') +
    css('components/nav/index.wxss') +
    css('components/fruit-image/index.wxss') +
    css('custom-tab-bar/index.wxss') +
    css('miniprogram_npm/tdesign-miniprogram/icon/icon.wxss')
  for (const p of pages) {
    const tab = p.file.startsWith('pages/')
      ? markup('custom-tab-bar/index.wxml', {
          selected: p.file.includes('/cart/') ? 1 : p.file.includes('/mine/') ? 2 : 0,
          count: 3,
          tabs: [
            { text: '首页', icon: 'shop' },
            { text: '购物车', icon: 'cart' },
            { text: '我的', icon: 'user' },
          ],
        })
      : ''
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--rpx:calc(100vw / 750)}*{box-sizing:border-box}body{margin:0}button,input,textarea{border:0;font:inherit;outline:0}button{cursor:pointer}span{white-space:pre-wrap}.t-icon{font-style:normal}.scroll-view{overflow-x:auto;scrollbar-width:none}.fruit-host{width:100%;height:100%;display:block}' +
      common +
      css(p.file + '.wxss') +
      '</style></head><body>' +
      markup(p.file + '.wxml', p.data) +
      tab +
      (p.overlay || '') +
      '</body></html>'
    p.slug = p.name || p.file.split('/').slice(-2, -1)[0]
    if (p.file === 'pages/index/index') p.slug = p.name || 'home'
    fs.writeFileSync(path.join(out, p.slug + '.html'), html)
  }
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0],
      file = url.startsWith('/assets/')
        ? path.join(root, url)
        : path.join(out, url === '/' ? 'home.html' : url)
    if (!file.startsWith(root) && !file.startsWith(out)) {
      res.writeHead(403).end()
      return
    }
    try {
      res.setHeader('Content-Type', file.endsWith('.jpg') ? 'image/jpeg' : 'text/html; charset=utf-8')
      res.end(fs.readFileSync(file))
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  })
  const results = []
  for (const width of [375, 320, 430]) {
    const tab = await browser.newPage({ viewport: { width, height: 812 }, deviceScaleFactor: 1 })
    for (const p of pages) {
      await tab.goto('http://127.0.0.1:' + port + '/' + p.slug + '.html')
      await tab.evaluate(() => document.fonts.ready)
      await tab.screenshot({
        path: path.join(out, p.slug + '-' + width + '.png'),
        fullPage: true,
        animations: 'disabled',
      })
      if (width === 375 && ['home', 'cart', 'checkout'].includes(p.slug))
        await tab.screenshot({
          path: path.join(out, p.slug + '-preview.png'),
          fullPage: false,
          animations: 'disabled',
        })
      const overflow = await tab.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
      results.push({ page: p.slug, width, overflow })
    }
    await tab.close()
  }
  fs.writeFileSync(path.join(out, 'layout-results.json'), JSON.stringify(results, null, 2))
  await browser.close()
  server.close()
  console.log(
    '浏览器布局检查完成（不等同微信运行时）：' +
      results.length +
      ' 张截图；水平溢出 ' +
      results.filter((x) => x.overflow).length +
      ' 项',
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
