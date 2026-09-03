# Signed APK builds on GitHub

The manual `Build signed Android APK` workflow builds the release package `cc.fishese.postkeeper`, then signs/verifies it on a separate GitHub-hosted runner. No signing secrets reach npm/Gradle build processes. It uploads the APK and SHA-256 checksum as a workflow artifact; it does not publish a GitHub Release or submit to Google Play. Run only from `main`.

The workflow and M6 sources are published on `main` (`c32aae9`, with SDK path fix `f5d139c`). All four repository secret names were confirmed on 2026-09-03 after the user saved them. Saving secrets alone does not start a build. The agent did not request or display their values; signing uses the key only inside the GitHub signing job.

## Current public download: 0.6.2

[PostKeeper 0.6.2 preview](https://github.com/fishese/postkeeper/releases/tag/v0.6.2) hosts the signed [APK](https://github.com/fishese/postkeeper/releases/download/v0.6.2/postkeeper-release.apk) and checksum. It bundles the extension guide and About link. Web/native version 0.6.2 uses Android versionCode **8**; extension version remains 0.1.1. The existing 0.6.1 release is preserved.

[Run 33790304910](https://github.com/fishese/postkeeper/actions/runs/33790304910) built/signed source `c970d594bb3077904ef942415ee68548323bfcb6`: build **2m30s**, sign **19s**, artifact **postkeeper-signed-apk-5**, ID **9907147786**. Full hosted validation (112 tests), Android JVM/lint/release gates and signing passed. Independently verified package `cc.fishese.postkeeper`, non-debuggable, API 28 minimum / 36 target, v3 signature and unchanged certificate from 0.6.1. The bundled guide contains the correct extension and APK links. APK size **2,982,531 bytes**; SHA-256 `19a76ac6757467258508901e4ca0e55ce9d9d7477ff24f29e9cf035c04d55d9a`.

Pages run **33790303712** succeeded. A fresh Chrome 152.0.7977.65 profile followed the live Settings → About APK link and anonymously downloaded matching bytes/hash. Local copy: `apps/android/app/build/outputs/apk/github-33790304910/postkeeper-signed-apk-5/postkeeper-release.apk`. No signing values were read/displayed or changed. No device installation or Play Store submission occurred; PDF/Drive limitations remain.

## Previous public download: 0.6.1

[PostKeeper 0.6.1 preview](https://github.com/fishese/postkeeper/releases/tag/v0.6.1) hosts the signed [APK](https://github.com/fishese/postkeeper/releases/download/v0.6.1/postkeeper-release.apk) and [checksum](https://github.com/fishese/postkeeper/releases/download/v0.6.1/SHA256SUMS.txt). The web app links it under **Settings → About → Download for Android**. This versioned release asset works without a GitHub login and does not expire with Actions artifacts. The release was uploaded manually after verification; the signing workflow itself still only creates artifacts.

[Run 33785611302](https://github.com/fishese/postkeeper/actions/runs/33785611302) built/signed commit `081389f5c48b442d163cab9dafa396848f574ded`; artifact **postkeeper-signed-apk-4**, ID `9905378918`. APK: **2,978,363 bytes**, version **0.6.1**, versionCode **7**, package `cc.fishese.postkeeper`, minimum API 28, target API 36, non-debuggable. Its v3 signature verifies and its signing certificate matches 0.6.0. SHA-256: `b5568b45e8f19b79f5783800ef4e6659bfbfaf1464e86d714811ed075aadf3a8`. Independent anonymous download through the live site's link matched that checksum.

Local copy: `apps/android/app/build/outputs/apk/github-33785611302/postkeeper-signed-apk-4/postkeeper-release.apk`. Pages deployment `33785609975` passed. The earlier follow-up run `33785440977` was deliberately cancelled before signing so the final print-table correction could be included. No signing-secret or identity change was needed. The release remains a development preview; native PDF/Drive and localization limits are documented separately. No release-package installation or Play Store submission occurred.

For future versions, increment the web package version and Android versionCode/versionName, build/sign from the corresponding source, verify, and attach `postkeeper-release.apk` plus `SHA256SUMS.txt` to the matching `v<version>` release. About derives the download tag from the web package version; it does not use GitHub's latest-release redirect because this is a prerelease.

## Previous successful build: 0.6.0

[Run 33764185135](https://github.com/fishese/postkeeper/actions/runs/33764185135) passed build and signing on 2026-09-03, from `f5d139c142af738542d18216d9f09aad00047952`. Download artifact **postkeeper-signed-apk-2** (artifact ID `9896865867`, retention through 2026-10-03). It contains `postkeeper-release.apk` and `SHA256SUMS.txt`.

The downloaded APK is **2,945,427 bytes**, package `cc.fishese.postkeeper`, version **0.6.0**, versionCode **6**, minimum Android API 28, target API 36. Independent local verification passed its checksum, v3 signature, and non-debuggable release flag. SHA-256: `7caec7b6b86ddbd3f20eab5168b587fa493097a43d670a329fb053da82aacb48`.

Local copy: `apps/android/app/build/outputs/apk/github-33764185135/postkeeper-signed-apk-2/postkeeper-release.apk`. This is generated/ignored output; keep a separate copy if needed beyond build cleanup or artifact expiration. No device install was performed as part of this GitHub build verification.

The first run (`33763991596`) stopped before signing because `sdkmanager` was absent from PATH. `f5d139c` uses the installed `$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager` in both jobs; the retry passed. The four user-saved secrets worked without changes.

## 1. Create or reuse a release keystore

If PostKeeper already has a release signing key, reuse it. Otherwise open `apps/android` in Android Studio, then **Build → Generate Signed Bundle / APK → APK → Next → Create new**.

Save the keystore outside the repository, for example `C:\Users\Selena\Documents\PostKeeperSigning\postkeeper-release.jks` (create the folder first). Choose alias `postkeeper`, a strong password, and validity of at least 25 years. Use the same password for the keystore and the key, as Android's guide recommends. Fill in the certificate fields and create the key; completing a local release build is not required to save the GitHub secrets.

Keep a separate secure backup of the keystore, alias, and password. They identify future APK updates; this signing key is separate from your PostKeeper library recovery key. Never use the Android debug keystore for releases. See [Android app signing](https://developer.android.com/studio/publish/app-signing).

## 2. Save four repository secrets

Open [PostKeeper Actions secrets](https://github.com/fishese/postkeeper/settings/secrets/actions): **Settings → Secrets and variables → Actions → Secrets → New repository secret**. Add each name exactly:

| Secret                      | Value                                                                   |
| --------------------------- | ----------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64 text encoding the entire keystore file, using the command below. |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password.                                                  |
| `ANDROID_KEY_ALIAS`         | `postkeeper`, or the alias of your existing key.                        |
| `ANDROID_KEY_PASSWORD`      | The key's password; same as the keystore password if created as above.  |

All four go in **Secrets**, not the Variables tab. No additional repository variables, Google OAuth credentials, or personal access token are required. Leave the existing Pages `GDRIVEWEBID` variable unchanged. These are repository secrets, not secrets attached to the `github-pages` environment.

Run this yourself in PowerShell after creating the file, changing the path if needed:

```powershell
$pkKeystore = 'C:\Users\Selena\Documents\PostKeeperSigning\postkeeper-release.jks'
[Convert]::ToBase64String([IO.File]::ReadAllBytes($pkKeystore)) | Set-Clipboard
```

Paste directly into the `ANDROID_KEYSTORE_BASE64` secret value and click **Add secret**. Base64 is an encoding, not encryption; do not paste it into chat, a repository variable, an issue, or a committed file. Clear the clipboard after use. GitHub does not display secret values again; retain your own backup. See [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

## 3. Run and download

Open **Actions → Build signed Android APK → Run workflow**, select `main`, and run. When both jobs pass, open the run's **Artifacts** and download `postkeeper-signed-apk-<run number>`. Extract `postkeeper-release.apk`; `SHA256SUMS.txt` accompanies it. The earlier unsigned artifact is only an intermediate build.

The signing job reconstructs the keystore only in runner temporary storage, passes passwords to `apksigner` through environment variables, removes the temporary key, and verifies the signature before upload. It never uploads the keystore. See [apksigner](https://developer.android.com/tools/apksigner).

The signed app uses the release package ID, separate from **PostKeeper Dev**, and has its own library. Increment `versionCode` in `apps/android/app/build.gradle` for later releases and keep the same signing identity. Signing does not change the M6 capture, native PDF, or Google Drive limitations documented in `ANDROID_SETUP.md`. Play Store signing/enrollment and automated public releases are outside this workflow.
