# GitHub Actions — Android APK Build

This workflow builds an APK for Atheonics in the cloud — no Android Studio needed on your laptop.

## How to trigger a build

**Option A — Manual (use this to test):**
1. Go to your repo on GitHub → **Actions** tab
2. Click **"Build Android APK"** in the left sidebar
3. Click **"Run workflow"** → choose `debug` (no signing) or `release` (needs secrets, see below)
4. Wait ~5-7 min
5. Open the finished run → scroll to **Artifacts** → download `athlyticai-<sha>.zip` → unzip → install on your phone

**Option B — Release tag:**
```bash
git tag v1.0.0
git push --tags
```
Builds a signed release APK + auto-creates a GitHub Release with the APK attached.

**Option C — Automatic on push:**
Every push to `main` that touches `frontend/**` builds a debug APK.

---

## First-time setup for RELEASE (signed) builds

Debug builds work immediately. Release builds need a keystore. One-time steps:

### 1. Generate the keystore (locally, just once)

You need Java installed. If you don't have it: download JDK 17 from https://adoptium.net (~200 MB).

```bash
keytool -genkey -v -keystore atheonics-release.keystore \
  -alias athlyticai -keyalg RSA -keysize 2048 -validity 10000
```

Set a strong password. Answer the prompts (CN, OU, O, L, S, C — these become public).

**KEEP THIS FILE SAFE.** If you lose it, you can never update the app on the Play Store later.

### 2. Encode it to base64 (so GitHub Secrets can hold it)

PowerShell:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("atheonics-release.keystore")) | Set-Clipboard
```

Bash / Git Bash:
```bash
base64 -w 0 atheonics-release.keystore | clip
```

The base64 string is now in your clipboard.

### 3. Add the secrets to GitHub

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add these 4 secrets:

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | (paste the base64 string from step 2) |
| `ANDROID_KEYSTORE_PASSWORD` | (the password you set in step 1) |
| `ANDROID_KEY_ALIAS` | `athlyticai` |
| `ANDROID_KEY_PASSWORD` | (same as keystore password unless you set a different one) |

### 4. Done — trigger a release build

Either push a tag (`git tag v1.0.0 && git push --tags`) OR run the workflow manually with `build_type: release`.

---

## Wiring the APK into the download page

Once a build finishes:

1. Download the APK from the Actions artifact (or release page if tagged)
2. Copy it into `frontend/public/`:
   ```
   frontend/public/athlyticai-v1.0.0.apk
   ```
3. Edit `frontend/public/data/app-version.json`:
   ```json
   {
     "android": {
       "latest_version": "1.0.0",
       "latest_version_code": 1,
       "apk_url": "/athlyticai-v1.0.0.apk",
       "release_notes": "First public release"
     }
   }
   ```
4. Deploy frontend (push to main → Vercel auto-deploys)
5. `/download` page now shows a green **"Download APK v1.0.0"** button on Android

**Better alternative for bigger APKs (>25 MB):** point `apk_url` at the GitHub Release download URL instead of hosting in `/public/`:
```
"apk_url": "https://github.com/harshit276/Playsmart/releases/download/v1.0.0/app-release.apk"
```
This keeps your Vercel bundle small.

---

## Troubleshooting

| Error | Fix |
|---|---|
| Workflow doesn't appear in Actions tab | Make sure `.github/workflows/android-apk.yml` is committed AND pushed to the default branch |
| `ANDROID_KEYSTORE_BASE64 secret is missing` | You're trying a release build but haven't added the secrets yet (steps 1-3 above) |
| Build fails on Capacitor sync | Run `cd frontend && npx cap sync android` locally first to confirm it works |
| APK installs but app shows white screen | Check `capacitor.config.json` → `server.hostname` matches your live domain |
| First release build needs ~6 min | Subsequent builds are faster (~3 min) due to gradle caching |
