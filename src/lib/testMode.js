// Tester run switch. True only on the Preview deployment that points at the staging
// database (VITE_TEST_MODE=true). Production never sets it, so none of the test
// pages or the test banner exist there.
export const isTestMode = import.meta.env.VITE_TEST_MODE === 'true'

// Optional: link to the shared sheet where testers write down problems.
export const testReportUrl = import.meta.env.VITE_TEST_REPORT_URL || ''
