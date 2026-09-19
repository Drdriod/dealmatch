import { CapacitorConfig } from '@capacitor/cli';

/**
 * DealMatch native app shells (Android + iOS), built with Capacitor.
 *
 * IMPORTANT ARCHITECTURE NOTE: this does NOT bundle the built dist/
 * output as the app's local content. Instead, `server.url` points the
 * native WebView directly at the live production site. This is
 * deliberate, not a placeholder:
 *
 *   - Every API call in this codebase (src/lib/*, src/modules/*) uses
 *     relative paths like fetch('/api/send-email'). Those only resolve
 *     correctly when the WebView's origin IS www.dealmatch.com.ng. If we
 *     bundled dist/ locally instead, the WebView's origin would be
 *     Capacitor's default (https://localhost or a custom scheme), and
 *     every relative /api/* call would silently point at a server that
 *     doesn't exist on-device -- login, escrow, matching, all of it,
 *     broken. Rewriting every relative call to an absolute
 *     VITE_API_BASE_URL is possible but a much larger, riskier change
 *     than this app needs just to ship to app stores.
 *   - This app is fundamentally server-backed (Supabase + the
 *     /api/platform.js serverless layer) with no meaningful offline
 *     mode today -- there's little to gain from true local bundling
 *     that "wrap the live site" doesn't already give you, and it means
 *     every web deploy (git push to main) is automatically what the
 *     native apps show too, with zero app-store resubmission needed for
 *     ordinary content/feature updates. Store resubmission is only
 *     needed when native config itself changes (icons, permissions,
 *     plugins) -- which is rare.
 *
 * If a genuine offline-first mode is wanted later, that's a real,
 * separate project (service worker caching strategy + local storage
 * fallback + an abstraction over every fetch() call), not a config
 * change here.
 */
const config: CapacitorConfig = {
  appId: 'com.dealmatch.app',
  appName: 'DealMatch',
  webDir: 'dist',
  server: {
    url: 'https://www.dealmatch.com.ng',
    cleartext: false,
  },
  android: {
    backgroundColor: '#FAF6F0',
  },
  ios: {
    backgroundColor: '#FAF6F0',
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#1A1210',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
