'use strict'

class BusinessError extends Error {
  constructor(code, message, retryable = false) {
    super(message)
    this.code = code
    this.retryable = retryable
  }
}

function fail(code, message) {
  throw new BusinessError(code, message)
}

function errorResponse(error) {
  if (error instanceof BusinessError) {
    return { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable } }
  }
  const conflict = error?.code === 'DATABASE_TRANSACTION_CONFLICT'
  return {
    ok: false,
    error: {
      code: conflict ? 'CONFLICT' : 'SERVICE_UNAVAILABLE',
      message: conflict ? '数据已更新，请重试；下单请复用原 token' : '服务暂不可用，请稍后重试',
      retryable: true,
    },
  }
}

module.exports = { BusinessError, fail, errorResponse }
