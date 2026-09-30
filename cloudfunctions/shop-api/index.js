'use strict'

const { createRepository } = require('./repository')
const { createHandler } = require('./service')
const { errorResponse } = require('./errors')
let app

exports.main = async (event) => {
  try {
    if (!app) {
      const cloudbase = require('@cloudbase/node-sdk')
      app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
    }
    // Resolve identity inside EVERY invocation; never cache it or read it from event.
    // Deploy as a mini-program callable function only, without an HTTP trigger.
    const { openId } = app.auth().getUserInfo()
    const handle = createHandler({
      repository: createRepository(app.database()),
      stage: process.env.APP_STAGE,
      enableDemo: process.env.ENABLE_DEMO_ACTIONS === 'true',
    })
    return await handle(event, { openId })
  } catch (error) {
    return errorResponse(error)
  }
}
