# Environment Variable Audit: DealMatch

Based on the scan of the codebase and the provided Vercel deployment screenshot, here is the comparison of environment variables.

## 1. Variables Present in Vercel (from Screenshot)
The following **10** variables are already configured in Vercel:
- `PAYSTACK_WEBHOOK_SECRET`
- `VITE_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_SECRET_KEY`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_NAME`
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 2. Missing Variables (Required by Code but NOT in Vercel)
The following variables are used in the codebase but are **missing** from the Vercel screenshot:

| Variable Name | Purpose | Impact if Missing |
|---------------|---------|-------------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis connection URL | **High**: Server-side rate limiting and caching will be disabled. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token | **High**: Server-side rate limiting and caching will be disabled. |
| `VITE_SENTRY_DSN` | Sentry error tracking DSN | **Medium**: Error tracking and crash reporting will not work. |
| `VITE_POSTHOG_KEY` | PostHog analytics key | **Medium**: Product analytics and user tracking will not work. |
| `VITE_POSTHOG_HOST` | PostHog API host (optional) | **Low**: Defaults to `https://app.posthog.com`. |

## 3. Recommendations
- **Add Missing Keys**: Please add the `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `VITE_SENTRY_DSN`, and `VITE_POSTHOG_KEY` to your Vercel Project Settings.
- **Auth Note**: The project has been updated to use Supabase's built-in email service. Ensure that your Supabase project has email confirmation enabled.
