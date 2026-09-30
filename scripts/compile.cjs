// Official miniprogram-ci native WXML/WXSS compilers; local only, no upload/signing.
const fs = require('node:fs'),
  path = require('node:path')
const wcc = require('miniprogram-ci/dist/modules/fullcompiler/trans/wcc/lib/wcc')
const wcsc = require('miniprogram-ci/dist/modules/fullcompiler/trans/wcc/lib/wcsc')
const root = path.resolve('miniprogram'),
  out = path.resolve('artifacts/compile')
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
const app = json(path.join(root, 'app.json'))
const pages = [...app.pages, ...app.subPackages.flatMap((p) => p.pages.map((x) => p.root + '/' + x))]
const nodes = new Set(pages),
  styles = new Set(['app.wxss']),
  templates = new Set()
function rel(p) {
  return p.replaceAll('\\', '/')
}
function component(ref, from = '') {
  const base = rel(ref.startsWith('/') ? ref.slice(1) : path.posix.normalize(path.posix.join(from, ref)))
  if (nodes.has(base)) return
  nodes.add(base)
  const cfg = json(path.join(root, base + '.json'))
  for (const next of Object.values(cfg.usingComponents || {})) component(next, path.posix.dirname(base))
}
for (const p of pages)
  for (const r of Object.values(json(path.join(root, p + '.json')).usingComponents || {}))
    component(r, path.posix.dirname(p))
for (const r of Object.values(app.usingComponents)) component(r)
component('/custom-tab-bar/index')
function style(file) {
  if (styles.has(file) && file !== 'app.wxss') return
  styles.add(file)
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  for (const m of source.matchAll(/@import\s+['"]([^'"]+)['"]/g))
    style(rel(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]))))
}
for (const p of nodes) {
  templates.add(p + '.wxml')
  style(p + '.wxss')
}
style('app.wxss')
;(async () => {
  fs.mkdirSync(out, { recursive: true })
  await wcc({ cwd: root, files: [...templates], output: path.join(out, 'wxml.js') })
  await wcsc({ cwd: root, files: [...styles], pageCount: pages.length, output: path.join(out, 'wxss.json') })
  fs.writeFileSync(
    path.join(out, 'result.json'),
    JSON.stringify(
      {
        pages: pages.length,
        templates: templates.size,
        styles: styles.size,
        wxmlCompiler: wcc.version,
        wxssCompiler: wcsc.version,
      },
      null,
      2,
    ),
  )
  console.log(
    '官方编译器验证通过：' + templates.size + ' 个 WXML、' + styles.size + ' 个 WXSS。未上传或发布。',
  )
})().catch((e) => {
  if (e.code === 'ERR_DLOPEN_FAILED')
    console.error(
      '本机无法加载微信原生编译模块（Windows 构建依赖 node.dll）。请使用已安装的微信开发者工具完成编译；npm run check 与 npm run build:npm 可独立运行。',
    )
  console.error(e.message)
  process.exitCode = 1
})
