// In-memory stand-in for the Supabase client, for unit tests only. It supports the
// query shapes the payment code uses: select, insert, update, eq, in, gte, lt,
// gt, maybeSingle, single, and await.
//
// tables: { tableName: [rows...] }. Rows are mutated in place, so a test can
// inspect them afterwards. `log.inserts` records every insert.
export function fakeSupabase(tables = {}) {
  const log = { inserts: [] }

  const svc = {
    log,
    tables,
    from(table) {
      const state = { table, filters: [], op: 'select', patch: null, insertRows: null, single: false }
      const builder = {
        select() { return builder },
        update(patch) { state.op = 'update'; state.patch = patch; return builder },
        insert(rows) { state.op = 'insert'; state.insertRows = rows; return builder },
        eq(col, val) { state.filters.push((r) => r[col] === val); return builder },
        in(col, vals) { state.filters.push((r) => vals.includes(r[col])); return builder },
        gte(col, val) { state.filters.push((r) => r[col] >= val); return builder },
        gt(col, val) { state.filters.push((r) => r[col] > val); return builder },
        lt(col, val) { state.filters.push((r) => r[col] < val); return builder },
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
    const matched = rows.filter((r) => state.filters.every((f) => f(r)))
    if (state.op === 'update') {
      matched.forEach((r) => Object.assign(r, state.patch))
      return { data: matched.map((r) => ({ id: r.id })), error: null }
    }
    return { data: state.single ? (matched[0] ?? null) : matched, error: null }
  }

  return svc
}
