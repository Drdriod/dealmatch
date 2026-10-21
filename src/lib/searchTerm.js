// Text a person typed into a search box, made safe to place inside a PostgREST filter string
// such as `.or('name.ilike.%text%,email.ilike.%text%')`.
//
// In that string a comma starts the next condition, parentheses group, and an asterisk is a
// wildcard. Left in, they change what the query asks (or make it invalid, so a search for
// "Victoria Island, Lagos" fails outright). They are replaced with spaces, so the text can only
// ever be the thing being matched. Use it for every `.or()` built from user input.
export function cleanSearchTerm(raw) {
  return String(raw || '').replace(/[,()*"\\]/g, ' ').trim()
}
