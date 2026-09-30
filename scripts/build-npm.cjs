const path = require('node:path')
const ci = require('miniprogram-ci')
;(async () => {
  await ci.packNpmManually({
    packageJsonPath: path.resolve('package.json'),
    miniprogramNpmDistDir: path.resolve('miniprogram'),
  })
  console.log('小程序 npm 构建完成')
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
