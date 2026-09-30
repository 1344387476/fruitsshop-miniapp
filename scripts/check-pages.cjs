const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const root = path.resolve('miniprogram')
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
const app = json(path.join(root, 'app.json'))
const pages = [...app.pages, ...app.subPackages.flatMap((p) => p.pages.map((x) => p.root + '/' + x))]
const components = new Set(),
  all = new Set(pages)
function visit(ref, from = root) {
  const base = ref.startsWith('/') ? path.join(root, ref.slice(1)) : path.resolve(from, ref)
  if (components.has(base)) return
  components.add(base)
  for (const ext of ['json', 'js', 'wxml', 'wxss'])
    if (ext !== 'js') assert(fs.existsSync(base + '.' + ext), '缺少组件 ' + base + '.' + ext)
  const config = json(base + '.json')
  for (const ref of Object.values(config.usingComponents || {})) visit(ref, path.dirname(base))
}
for (const p of pages) {
  for (const ext of ['ts', 'json', 'wxml', 'wxss'])
    assert(fs.existsSync(path.join(root, p + '.' + ext)), '缺少页面 ' + p + '.' + ext)
  const config = json(path.join(root, p + '.json'))
  for (const ref of Object.values(config.usingComponents || {})) visit(ref, path.dirname(path.join(root, p)))
}
for (const ref of Object.values(app.usingComponents)) visit(ref)
visit('/custom-tab-bar/index')
for (const base of components) if (!base.includes('miniprogram_npm')) all.add(path.relative(root, base))
for (const p of all) {
  const markup = fs.readFileSync(path.join(root, p + '.wxml'), 'utf8')
  const code = fs.readFileSync(path.join(root, p + '.ts'), 'utf8')
  for (const match of markup.matchAll(/(?:bind|catch)(?::)?[a-z]+="([\w]+)"/g)) {
    assert(new RegExp('\\b' + match[1] + '\\b').test(code), p + ' 缺少事件 ' + match[1])
  }
  assert(!/<br\b/.test(markup), p + ' 不能使用 HTML br 标签')
  for (const [, expression] of markup.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    assert(!/[\r\n]/.test(expression), p + ' 的 WXML 表达式不能被格式化拆行')
  }
  for (const [tag] of markup.matchAll(/<[\w-]+\s(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
    assert(
      !(/\swx:for\s*=/.test(tag) && /\swx:(?:else|elif)(?:\s|=|>)/.test(tag)),
      p + ' 的 wx:else/wx:elif 必须包在外层 block，不能与 wx:for 放在同一节点',
    )
  }
}
for (const tab of app.tabBar.list) assert(app.pages.includes(tab.pagePath), 'tab 页必须在主包')
assert(fs.statSync(path.join(root, 'assets/fruit-catalog.jpg')).size < 400000, '图集过大')
console.log(pages.length + ' 个页面、' + components.size + ' 个组件的路由、依赖、事件绑定检查通过')
