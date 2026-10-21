// In-memory stand-in for the Supabase client, for unit tests only. It supports the
// query shapes the payment and API code uses: select, insert, update, eq, in, is,
// not (is null), gte, gt, lt, lte, ilike (% wildcards), order, limit, maybeSingle,
// single, upsert (onConflict + ignoreDuplicates), and await. It does not check
// column lists: select() returns whole rows.
//
// tables: { tableName: [rows...] }. Rows are mutated in place, so a test can
// inspect them afterwards. Reads return copies. `log.inserts` records every insert.
export function fakeSupabase(tables = {}) {
  const log = { inserts: [] }

  const svc = {
    log,
    tables,
    from(table) {
      const state = { table, filters: [], op: 'select', patch: null, insertRows: null, single: false, order: null, limit: null }
      const builder = {
        select() { return builder },
        update(patch) { state.op = 'update'; state.patch = patch; return builder },
        insert(rows) { state.op = 'insert'; state.insertRows = rows; return builder },
        upsert(rows, opts = {}) { state.op = 'upsert'; state.insertRows = rows; state.upsertOpts = opts; return builder },
        eq(col, val) { state.filters.push((r) => r[col] === val); return builder },
        in(col, vals) { state.filters.push((r) => vals.includes(r[col])); return builder },
        is(col, val) { state.filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return builder },
        not(col, op, val) {
          if (op !== 'is' || val !== null) throw new Error(`fakeSupabase: .not(${col}, ${op}) is not supported`)
          state.filters.push((r) => r[col] != null)
          return builder
        },
        gte(col, val) { state.filters.push((r) => r[col] >= val); return builder },
        gt(col, val) { state.filters.push((r) => r[col] > val); return builder },
        lt(col, val) { state.filters.push((r) => r[col] < val); return builder },
        lte(col, val) { state.filters.push((r) => r[col] <= val); return builder },
        ilike(col, pattern) {
          const re = new RegExp(
            '^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i')
          state.filters.push((r) => re.test(String(r[col] ?? '')))
          return builder
        },
        order(col, opts = {}) { state.order = { col, ascending: opts.ascending !== false }; return builder },
        limit(n) { state.limit = n; return builder },
        maybeSingle() { state.single = true; return builder },
        single() { state.single = true; return builder },
        then(resolve, reject) {
          try { resolve(execute(state)) } catch (e) { reject(e) }
        },
      }
      return builder
    },
  }

  function execute(state) {
    const rows = tables[state.table] || (tables[state.table] = [])
    if (state.op === 'insert') {
      const list = Array.isArray(state.insertRows) ? state.insertRows : [state.insertRows]
      const stored = list.map((r, i) => ({ id: r.id ?? `${state.table}-${rows.length + i + 1}`, ...r }))
      rows.push(...stored)
      log.inserts.push({ table: state.table, rows: stored })
      return { data: state.single ? stored[0] : stored, error: null }
    }
    if (state.op === 'upsert') {
      const list = Array.isArray(state.insertRows) ? state.insertRows : [state.insertRows]
      const key = state.upsertOpts.onConflict
      const stored = []
      for (const r of list) {
        const hit = key ? rows.find((x) => x[key] === r[key]) : null
        if (hit) {
          if (!state.upsertOpts.ignoreDuplicates) Object.assign(hit, r)
          continue
        }
        const row = { id: r.id ?? `${state.table}-${rows.length + 1}`, ...r }
        rows.push(row)
        stored.push(row)
      }
      log.inserts.push({ table: state.table, rows: stored })
      return { data: stored, error: null }
    }
    let matched = rows.filter((r) => state.filters.every((f) => f(r)))
    if (state.op === 'update') {
      matched.forEach((r) => Object.assign(r, state.patch))
      return { data: matched.map((r) => ({ id: r.id })), error: null }
    }
    if (state.order) {
      const { col, ascending } = state.order
      matched = [...matched].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1))
    }
    if (state.limit != null) matched = matched.slice(0, state.limit)
    // Reads return copies, as a real client does: a caller keeps the value it read,
    // even if the row changes afterwards.
    const copy = (r) => ({ ...r })
    return { data: state.single ? (matched[0] ? copy(matched[0]) : null) : matched.map(copy), error: null }
  }

  return svc
}
