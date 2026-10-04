# DealMatch - Android & iOS App Setup (August 2026)

## What's actually in this package

Both native app projects are fully scaffolded, configured, and branded - but **neither has been compiled into an installable binary**, and that's not something I could do from here regardless of how this package was prepared. Read the "Why" section before assuming something's missing.

- `capacitor.config.ts` - the bridge config. Points both native WebViews at **the live production site** (`https://www.dealmatch.com.ng`), not a locally bundled copy. See the long comment in that file for exactly why - short version: every API call in this codebase uses relative paths (`fetch('/api/...')`), which only resolve correctly when the WebView's origin is the real domain.
- `android/` - full Android Studio project. Real app icons (all 5 densities, adaptive icon foreground/background), real splash screens (all 11 density/orientation variants), camera permission declared, hardware back-button wired to behave like a normal Android app instead of Capacitor's default (which just exits on any back press).
- `ios/` - full Xcode project. Real 1024×1024 App Store icon, real launch screen images, `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription` added to `Info.plist` (without these, iOS **kills the app instantly** the first time it touches the camera or photo library - this isn't optional, it's an OS-level requirement, not just an App Store guideline).
- `public/brand/` - the source logo assets everything above was generated from, in case you need other sizes later.

## Why there's no `.apk`/`.aab`/`.ipa` in this package

I tried, and I want to show you exactly what happened rather than just assert a limitation:

```
$ cd android && ./gradlew tasks
Downloading https://services.gradle.org/distributions/gradle-8.14.3-all.zip
Exception in thread "main" java.io.IOException: Server returned HTTP response code: 403
```

The sandbox I work in only has network access to a specific allowlist of package registries (npm, PyPI, crates.io, GitHub). It doesn't include `services.gradle.org` or Google's Maven repository (`dl.google.com`), both of which any Android build needs - even just to resolve the project, before compiling a single line of code. iOS is a harder wall: Xcode only runs on macOS, full stop, no sandbox or emulation gets around that.

**This is specific to my environment, not a problem with the project.** On any normal machine with regular internet access, the commands in the next section should just work.

## Finishing the Android build (needs Android Studio, any machine)

1. Install [Android Studio](https://developer.android.com/studio) if you don't have it.
2. Open the `android/` folder from this package as a project (File → Open).
3. Let Gradle sync - this is the step that failed in my sandbox; on your machine with normal internet it downloads everything it needs automatically.
4. **Generate a signing key** (required for Play Store - a debug-signed APK can't be published):
   ```bash
   keytool -genkey -v -keystore dealmatch-release.keystore -alias dealmatch -keyalg RSA -keysize 2048 -validity 10000
   ```
   Store this file and its password somewhere safe and backed up - **if you lose it, you can never update the app again** under the same listing; Google ties your app's identity to this key permanently.
5. Configure `android/app/build.gradle` with your signing config (Android Studio's Build → Generate Signed Bundle/APK wizard will do this for you interactively - easier than hand-editing).
6. Build → Generate Signed Bundle/APK → choose **Android App Bundle (.aab)** - Play Store requires `.aab`, not `.apk`, for new apps as of a few years ago.
7. Test the signed build on a real device or emulator before uploading - specifically test: sign-in, browsing a listing, the camera-based identity verification flow, and that back-button behavior feels normal.

## Finishing the iOS build (needs a Mac with Xcode - no substitute)

1. On a Mac, install Xcode from the App Store (free, but large - several GB).
2. Open `ios/App/App.xcworkspace` (the `.xcworkspace`, **not** `.xcodeproj` - Capacitor uses CocoaPods, which requires opening the workspace file).
3. Run `pod install` inside `ios/App/` first if Xcode doesn't do it automatically.
4. In Xcode, set your **Team** (Signing & Capabilities tab) - this requires an active Apple Developer Program membership (see below).
5. Set the bundle identifier if you want something other than `com.dealmatch.app`.
6. Product → Archive, then use the Organizer window to upload to App Store Connect.
7. Test on a real device first (the iOS Simulator can't test camera access, which this app depends on for verification flows).

## Store accounts and costs - the part I genuinely can't do for you

Neither store submission can happen without these, and they require a human with legal authority over the business (bank details, ID verification, signing agreements):

| | Google Play | Apple App Store |
|---|---|---|
| Account | [Google Play Console](https://play.google.com/console) | [Apple Developer Program](https://developer.apple.com/programs/) |
| Cost | $25 one-time | $99/year |
| Verification | ID + sometimes org verification | ID + D-U-N-S number if registering as an organization (can take 1-2 weeks) |
| Review time | Usually hours to a few days | Usually 1-3 days, can be longer on first submission |

## A real risk worth knowing about before you submit to Apple

Apple's App Store review (guideline 4.2, "Minimum Functionality") has a history of rejecting apps that are, in the reviewer's judgment, "just a website wrapped in a WebView" with no meaningful native functionality. This app *is* architecturally a wrapped website by design (see the capacitor.config.ts reasoning above) - that was the right call for how DealMatch actually works, but it's worth knowing it's the exact shape Apple sometimes scrutinizes. Google Play is meaningfully more permissive of this pattern (they have an official "Trusted Web Activity" pattern for it) - Android is very unlikely to have this problem.

What helps on the Apple side, some of which is already done and some of which is a judgment call for you:
- ✅ Native camera integration (done - the file-input camera capture works through the native permission system now, not just a generic web file picker)
- ✅ Native back-button/app lifecycle behavior (done)
- Push notifications would meaningfully strengthen the "native app" case if you want them later - this package doesn't include them (would need `@capacitor/push-notifications` + Firebase Cloud Messaging setup, a separate piece of work)
- If Apple rejects on 4.2, the standard response is emphasizing what's native/device-integrated in your reply to the reviewer, not resubmitting the identical build hoping for a different reviewer

**One more Apple-specific thing worth verifying yourself, not taking my word for it**: Apple's guideline 3.1.1 requires *digital goods/services* to go through Apple's own in-app purchase system (with Apple's cut). *Physical* goods and real-world services are explicitly exempt and can keep using your own payment processor. DealMatch's escrow payments are for real estate, real-world services, and physical goods - which should mean Paystack payments are fine to keep as-is - but I'm not able to give you a legal guarantee on Apple's current guideline interpretation, and this is a common, expensive-to-get-wrong rejection reason. Worth a direct read of Apple's current guideline text (it does change) before your first submission, not just my summary of it.

## Store listing assets you'll need to prepare yourself

Neither store will accept a submission without these, and they're editorial/business decisions I shouldn't make unilaterally on your behalf:

- App screenshots at required device sizes (both stores have specific pixel-dimension requirements per device class)
- A short description, full description, and keywords
- A **privacy policy URL** (both stores require this, no exceptions - check `src/pages/Legal/` in the main codebase, there may already be one live on the website you can just link to)
- Content rating questionnaire answers (both stores ask about violence, gambling, user-generated content, etc. - DealMatch's escrow/marketplace nature means answering these accurately matters)
- Category selection (Play Store and App Store categorize apps slightly differently - "Business" or "Lifestyle" are the likely fits, not "Shopping," since this is a matching/marketplace platform, not a storefront)

## What I'd suggest doing next

Given the Apple review risk above, if you want to derisk this, I'd suggest starting with the **Android/Play Store submission first** - it's cheaper, faster to review, and has essentially zero risk of the "wrapped website" rejection. Get that live, gather real usage data, and use the extra runway to decide whether push notifications or other native-feeling features are worth adding before the iOS submission.
