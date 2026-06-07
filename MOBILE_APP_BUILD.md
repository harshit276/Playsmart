# Atheonics Mobile App — Build & Host Guide

Two delivery paths for the mobile app:

1. **PWA (live now)** — users install from any browser via the in-app prompt or `/download`. Zero infra.
2. **Capacitor Android APK** — wraps the web app in a native Android shell. Hosted on `atheonics.com/download`.

---

## Part 1 — PWA (already deployed)

The PWA is automatic. When users visit on:
- **Android Chrome** → in-app install prompt + `/download` page
- **iOS Safari** → `/download` page shows Add-to-Home-Screen steps
- **Desktop Chrome / Edge** → install icon in URL bar + `/download` page

Service worker (`frontend/public/service-worker.js`):
- App shell + JSON data cached
- Network-first for HTML, cache-first for assets, stale-while-revalidate for `/data/*.json`
- Update prompt fires automatically when a new version deploys

Bump `CACHE_VERSION` in `service-worker.js` whenever you change cache strategy or shell assets.

---

## Part 2 — Building the Android APK (Capacitor)

### One-time setup (on your dev machine)

1. **Install Android Studio** (Windows): https://developer.android.com/studio
   - Open Android Studio → Tools → SDK Manager → install:
     - Android SDK Platform 34 (or newer)
     - Android SDK Build-Tools
     - Android SDK Command-line Tools
2. **Install JDK 17+** (Android Studio bundles one, but make it global):
   - Set `JAVA_HOME` to the JDK path (e.g. `C:\Program Files\Android\Android Studio\jbr`)
3. **Set `ANDROID_HOME`** env var to your SDK path (usually `C:\Users\<you>\AppData\Local\Android\Sdk`)
4. Verify:
   ```bash
   echo $JAVA_HOME    # bash
   $env:JAVA_HOME     # PowerShell
   ```

### Generate a signing key (one time, keep safe!)

```bash
cd frontend/android/app
keytool -genkey -v -keystore atheonics-release.keystore \
  -alias athlyticai -keyalg RSA -keysize 2048 -validity 10000
```

Answer the prompts. **Save the keystore password somewhere safe** — losing it = can't update the app.

Add to `frontend/android/app/build.gradle` inside the `android { ... }` block:

```gradle
signingConfigs {
    release {
        storeFile file('atheonics-release.keystore')
        storePassword 'YOUR_STORE_PASSWORD'
        keyAlias 'athlyticai'
        keyPassword 'YOUR_KEY_PASSWORD'
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

**Better:** put passwords in `gradle.properties` (gitignored) and reference them.

### Build the APK

From `frontend/`:

```bash
# Debug build (no signing needed, ~quick smoke test)
npm run cap:build:debug
# → APK at: frontend/android/app/build/outputs/apk/debug/app-debug.apk

# Release build (signed, what users install)
npm run cap:build
# → APK at: frontend/android/app/build/outputs/apk/release/app-release.apk
```

### Test on a real phone

```bash
adb install frontend/android/app/build/outputs/apk/release/app-release.apk
```

Or transfer the APK file, tap it, allow "install from unknown sources".

### Refresh app content (no rebuild needed for web changes)

The Capacitor config points at `atheonics.com`, so most updates are LIVE — users get them on next app open without any APK update. Only rebuild the APK when:
- Native plugin added/changed
- App icon / splash changed
- Server URL changed
- Permissions changed

---

## Part 3 — Hosting the APK on the website

### Where to put it

After building, rename and drop in `frontend/public/`:
```bash
cp android/app/build/outputs/apk/release/app-release.apk \
   public/athlyticai-v1.0.0.apk
```

Then ship: `vercel --prod` (or push to git).

### Wire the link

Edit `frontend/src/pages/DownloadPage.jsx`:

Find the Android section and add a direct APK download button:
```jsx
<a
  href="/athlyticai-v1.0.0.apk"
  download
  className="..."
>
  <Download /> Download APK ({size} MB)
</a>
```

Pair it with version + changelog so you can track adoption.

### Version-update prompt inside the app

When you ship a new APK:
1. Drop the new file at `/athlyticai-v1.0.1.apk`
2. Bump `LATEST_ANDROID_VERSION` in a JSON file: `frontend/public/data/app-version.json`
3. The app reads this on launch, compares to `VERSION_CODE` in `build.gradle`, and shows an in-app "Update available" toast linking to the new APK

(That ping check is ~10 lines of code — wire it once and shipping updates is a single APK swap.)

---

## Part 4 — Common issues

| Problem | Fix |
|---|---|
| `gradlew` permission denied (Linux/Mac) | `chmod +x frontend/android/gradlew` |
| `SDK location not found` | Create `frontend/android/local.properties` with `sdk.dir=C:\\Users\\you\\AppData\\Local\\Android\\Sdk` |
| Splash screen wrong color | Edit `capacitor.config.json` → `SplashScreen.backgroundColor` → re-run `npm run cap:sync` |
| App opens to white screen | Check `server.hostname` in `capacitor.config.json` matches your production domain |
| Want to test against localhost | Change `server.url` to `http://10.0.2.2:3000` (Android emulator) and `allowMixedContent: true` |

---

## Part 5 — When to go Play Store

PWA + direct APK covers v1 perfectly. Consider Play Store when:
- You need push notifications on iOS (Apple bans this for sideloaded apps)
- You want App Store search discoverability
- You want one-tap auto-updates
- Marketing benefits from "Available on Google Play" badge

When ready:
1. Change build to AAB (Android App Bundle): `gradlew bundleRelease`
2. Upload to Play Console → Internal Testing → invite testers
3. Promote to Closed Testing (12-20 testers, 14 days — see Help for current rules)
4. Promote to Production

The Capacitor config + signing key transfer cleanly. No code changes needed.
