// The loading logic behind the dashboard data hooks, with no React in it so it can be tested.
//
// A page used to call its repository, copy `data` into state and ignore `error`. A failed query
// then looked exactly like an empty account: "0 listings", "0 matches". This keeps three things
// separate: the data, whether a load is running, and the error from the last attempt.
//
// Rules it enforces:
//   - The newest request wins. If an older one finishes later, its result is dropped, so a slow
//     answer for an old filter cannot overwrite the current one.
//   - A failed load keeps the data already on screen and records the error.
//   - A silent reload (after a realtime event, or after the person saved something) does not turn
//     `loading` on, so the page does not flash a spinner.
//   - After `cancel()` (the page was left) nothing is reported.

// Supabase returns { data, error }. This returns data, or throws the error, so a loader can
// treat a failed query as a failure.
export function unwrap(result) {
  if (result?.error) throw result.error
  return result?.data
}

export function createLoader(load, onChange) {
  let run = 0
  let state = { data: undefined, error: null, loading: true }
  const set = (next) => { state = next; onChange(next) }
  return {
    get state() { return state },
    async execute({ silent = false } = {}) {
      const id = ++run
      if (!silent) set({ ...state, loading: true, error: null })
      try {
        const data = await load()
        if (id === run) set({ data, error: null, loading: false })
      } catch (error) {
        if (id === run) set({ data: state.data, error, loading: false })
      }
    },
    cancel() { run++ },
  }
}
