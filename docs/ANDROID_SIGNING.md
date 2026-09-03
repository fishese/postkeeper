# Signed APK builds on GitHub

The manual `Build signed Android APK` workflow builds the release package `cc.fishese.postkeeper`, then signs/verifies it on a separate GitHub-hosted runner. No signing secrets reach npm/Gradle build processes. It uploads the APK and SHA-256 checksum as a workflow artifact; it does not publish a GitHub Release or submit to Google Play. Run only from `main`.

The workflow and M6 sources are currently local and must be committed/pushed before GitHub can run them. Saving secrets alone does not start a build. No real release signing key has been generated, read, or uploaded by the agent.

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

After the workflow and Android sources are pushed to `main`, open **Actions → Build signed Android APK → Run workflow**, select `main`, and run. When both jobs pass, open the run's **Artifacts** and download `postkeeper-signed-apk-<run number>`. Extract `postkeeper-release.apk`; `SHA256SUMS.txt` accompanies it. The earlier unsigned artifact is only an intermediate build.

The signing job reconstructs the keystore only in runner temporary storage, passes passwords to `apksigner` through environment variables, removes the temporary key, and verifies the signature before upload. It never uploads the keystore. See [apksigner](https://developer.android.com/tools/apksigner).

The signed app uses the release package ID, separate from **PostKeeper Dev**, and has its own library. Increment `versionCode` in `apps/android/app/build.gradle` for later releases and keep the same signing identity. Signing does not change the M6 capture, native PDF, or Google Drive limitations documented in `ANDROID_SETUP.md`. Play Store signing/enrollment and automated public releases are outside this workflow.
