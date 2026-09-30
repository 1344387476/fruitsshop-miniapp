'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { createRepository } = require('../cloudfunctions/shop-api/repository')
const { BusinessError } = require('../cloudfunctions/shop-api/errors')

test('cloud repository: normal array reads, transactional object reads and exact-ID writes', async () => {
  const calls = []
  const db = {
    collection: (collection) => ({ doc: (id) => ({
      get: async () => ({ data: [{ _id: id, stock: 3 }] }),
      set: async (data) => { calls.push({ collection, id, data }); return { updated: 1 } },
    }) }),
    startTransaction: async () => ({
      collection: (collection) => ({ doc: (id) => ({
        get: async () => ({ data: { _id: id, stock: 3 } }),
        set: async (data) => { calls.push({ collection, id, data }); return { updated: 1 } },
      }) }),
      commit: async () => { calls.push('commit'); return {} },
      rollback: async () => { calls.push('rollback'); return {} },
    }),
  }
  const repo = createRepository(db)
  assert.deepEqual(await repo.get('skus', 's0a'), { _id: 's0a', stock: 3 })
  const result = await repo.transaction(async (tx) => {
    const sku = await tx.get('skus', 's0a')
    await tx.set('skus', 's0a', { ...sku, stock: 2 })
    return { stock: 2 }
  })
  assert.deepEqual(result, { stock: 2 })
  assert.deepEqual(calls, [{ collection: 'skus', id: 's0a', data: { stock: 2 } }, 'commit'])
})

test('cloud repository: missing documents differ from database and collection failures', async () => {
  let response = { data: [] }
  const repo = createRepository({ collection: () => ({ doc: () => ({ get: async () => response }) }) })
  assert.equal(await repo.get('carts', 'user'), null)
  response = { data: null }
  assert.equal(await repo.get('carts', 'user'), null)
  response = { code: 'DATABASE_DOCUMENT_NOT_EXIST' }
  assert.equal(await repo.get('carts', 'user'), null)
  response = { code: 'DATABASE_COLLECTION_NOT_EXIST' }
  await assert.rejects(repo.get('carts', 'user'), { code: 'DATABASE_COLLECTION_NOT_EXIST' })
  response = { code: 'DATABASE_PERMISSION_DENIED' }
  await assert.rejects(repo.get('carts', 'user'), { code: 'DATABASE_PERMISSION_DENIED' })
})

test('cloud repository: returned write errors abort without committing', async () => {
  let rolledBack = false
  let committed = false
  const repo = createRepository({ startTransaction: async () => ({
    collection: () => ({ doc: () => ({ set: async () => ({ code: 'DATABASE_REQUEST_FAILED' }) }) }),
    commit: async () => { committed = true },
    rollback: async () => { rolledBack = true },
  }) })
  await assert.rejects(repo.transaction((tx) => tx.set('orders', 'order', {})), { code: 'DATABASE_REQUEST_FAILED' })
  assert.equal(committed, false)
  assert.equal(rolledBack, true)
})

test('cloud repository: business error survives rollback failure', async () => {
  const failure = new BusinessError('OUT_OF_STOCK', '库存不足')
  const repo = createRepository({ startTransaction: async () => ({
    rollback: async () => { throw new Error('rollback failed') },
  }) })
  await assert.rejects(repo.transaction(async () => { throw failure }), (error) => error === failure)
})

test('cloud repository: commit conflict rolls back and is not silently retried', async () => {
  let starts = 0
  let rollbacks = 0
  const repo = createRepository({ startTransaction: async () => {
    starts++
    return {
      commit: async () => ({ code: 'DATABASE_TRANSACTION_CONFLICT' }),
      rollback: async () => { rollbacks++; return {} },
    }
  } })
  await assert.rejects(repo.transaction(async () => null), { code: 'DATABASE_TRANSACTION_CONFLICT' })
  assert.equal(starts, 1)
  assert.equal(rollbacks, 1)
})

test('cloud repository: list carries ownership filter, pagination and both sort keys', async () => {
  const calls = []
  const query = {
    where(value) { calls.push(['where', value]); return this },
    orderBy(...args) { calls.push(['orderBy', ...args]); return this },
    skip(value) { calls.push(['skip', value]); return this },
    limit(value) { calls.push(['limit', value]); return this },
    async get() { return { data: [{ _id: 'one' }] } },
  }
  const repo = createRepository({ collection: () => query })
  const rows = await repo.list('orders', { ownerId: 'alice' }, { offset: 20, limit: 21, order: [['createdAt', 'desc'], ['_id', 'desc']] })
  assert.deepEqual(rows, [{ _id: 'one' }])
  assert.deepEqual(calls, [
    ['where', { ownerId: 'alice' }], ['orderBy', 'createdAt', 'desc'], ['orderBy', '_id', 'desc'], ['skip', 20], ['limit', 21],
  ])
})

test('cloud entry: identity is resolved per invocation; event cannot forge it', async () => {
  const filename = require.resolve('../cloudfunctions/shop-api/index')
  const originalLoad = Module._load
  let currentUser = 'alice'
  let initializes = 0
  let reads = 0
  let gets = 0
  const fakeSdk = {
    SYMBOL_CURRENT_ENV: Symbol('test-env'),
    init(options) {
      initializes++
      assert.equal(options.env, fakeSdk.SYMBOL_CURRENT_ENV)
      return {
        auth: () => ({ getUserInfo: () => { reads++; return { openId: currentUser } } }),
        database: () => ({ collection: () => ({ doc: () => ({ get: async () => { gets++; return { data: [] } } }) }) }),
      }
    },
  }
  Module._load = function (request, ...rest) {
    if (request === '@cloudbase/node-sdk') return fakeSdk
    return originalLoad.call(this, request, ...rest)
  }
  delete require.cache[filename]
  try {
    const { main } = require(filename)
    assert.deepEqual(await main({ action: 'addresses' }), { ok: true, data: [] })
    currentUser = ''
    assert.equal((await main({ action: 'addresses', openId: 'alice' })).error.code, 'UNAUTHENTICATED')
    assert.equal(reads, 2)
    assert.equal(initializes, 1)
    assert.equal(gets, 1)
  } finally {
    Module._load = originalLoad
    delete require.cache[filename]
  }
})
