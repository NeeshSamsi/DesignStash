---

## Installing the beta (testers)

This beta is **not signed or notarized yet**, so macOS will warn you the first time. It runs on Apple Silicon Macs.

1. Download `DesignStash-<version>-arm64.dmg` below and open it.
2. Drag **DesignStash** into **Applications**.
3. Open DesignStash from Applications. macOS says it can't verify the app. Click **Done**.
   - On macOS 14 and earlier, right-click the app, choose **Open**, then **Open** again.
4. On macOS 15 and later, open **System Settings > Privacy & Security**, scroll to **Security**, click **Open Anyway** next to DesignStash and confirm with your password.

You only do this once. If you prefer Terminal: `xattr -dr com.apple.quarantine /Applications/DesignStash.app`

DesignStash can't update itself while it's unsigned. When a new version is out, the app tells you in a notice and in Settings > About, with a Download link to the release page. Install it over the old one; your library stays where it is.
