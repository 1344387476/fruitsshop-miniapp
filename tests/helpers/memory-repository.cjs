'use strict'

const copy = (value) => structuredClone(value)

function createMemoryRepository(seed = {}) {
  let state = copy(seed)
  let version = 0
  let commitFailure = null
  function documents(target) {
    return {
      async get(collection, id) {
        return copy((target[collection] || []).find((row) => row._id === id) || null)
      },
      async set(collection, id, value) {
        const rows = target[collection] ||= []
        const index = rows.findIndex((row) => row._id === id)
        const next = { ...copy(value), _id: id }
        if (index < 0) rows.push(next)
        else rows[index] = next
      },
    }
  }
  return {
    async get(collection, id) { return documents(state).get(collection, id) },
    async set(collection, id, value) {
      await documents(state).set(collection, id, value)
      version++
    },
    async list(collection, where = {}, { offset = 0, limit = 50, order = [['_id', 'asc']] } = {}) {
      return copy((state[collection] || [])
        .filter((row) => Object.entries(where).every(([key, value]) => row[key] === value))
        .sort((a, b) => {
          for (const [field, direction] of order) {
            const difference = a[field] === b[field] ? 0 : a[field] > b[field] ? 1 : -1
            if (difference) return direction === 'asc' ? difference : -difference
          }
          return 0
        }).slice(offset, offset + limit))
    },
    async transaction(work) {
      const readVersion = version
      const snapshot = copy(state)
      const result = await work(documents(snapshot))
      if (commitFailure) {
        const error = commitFailure
        commitFailure = null
        throw error
      }
      // Coarse optimistic isolation is intentional: tests expose conflicts, never serialize them away.
      if (readVersion !== version) {
        throw Object.assign(new Error('Concurrent commit'), { code: 'DATABASE_TRANSACTION_CONFLICT' })
      }
      state = snapshot
      version++
      return copy(result)
    },
    snapshot: () => copy(state),
    failNextCommit(error = new Error('Injected database failure')) { commitFailure = error },
  }
}

module.exports = { createMemoryRepository }
