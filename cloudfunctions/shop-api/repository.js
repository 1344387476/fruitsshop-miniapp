'use strict'

// @cloudbase/node-sdk uses set(document), not wx-server-sdk's set({ data }).
function checked(result) {
  if (result?.code) throw Object.assign(new Error('Database request failed'), { code: result.code })
  return result
}

function documents(database) {
  return {
    async get(collection, id) {
      try {
        const result = checked(await database.collection(collection).doc(id).get())
        return (Array.isArray(result.data) ? result.data[0] : result.data) || null
      } catch (error) {
        if (error.code === 'DATABASE_DOCUMENT_NOT_EXIST') return null
        throw error
      }
    },
    async set(collection, id, value) {
      const { _id, ...data } = value
      checked(await database.collection(collection).doc(id).set(data))
    },
  }
}

function createRepository(database) {
  return {
    ...documents(database),
    async list(collection, where = {}, { offset = 0, limit = 50, order = [['_id', 'asc']] } = {}) {
      let query = database.collection(collection).where(where)
      for (const [field, direction] of order) query = query.orderBy(field, direction)
      return checked(await query.skip(offset).limit(limit).get()).data
    },
    async transaction(work) {
      // Explicit commit/rollback preserves business errors; callers retry with the same token.
      const transaction = await database.startTransaction()
      try {
        const result = await work(documents(transaction))
        checked(await transaction.commit())
        return result
      } catch (error) {
        try {
          await transaction.rollback()
        } catch (_) {
          // Preserve the original error (commit may already have succeeded or aborted).
        }
        throw error
      }
    },
  }
}

module.exports = { createRepository }
