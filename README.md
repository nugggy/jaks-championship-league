# Jak's Championship League

A draw-your-play football game for Android, inspired by Soccer Superstar. When your team has the ball the game freezes and you draw the play. End a line on a team-mate to pass, inside the goal to shoot, or in space to dribble. Bend the line to curl the ball. Without the ball the game runs live and you defend in real time.

## Download

Get the latest APK from the [releases page](https://github.com/nugggy/jaks-championship-league/releases/latest), or use this direct link, which always points to the newest version:

https://github.com/nugggy/jaks-championship-league/releases/latest/download/jaks-championship-league.apk

On Android you may need to allow installs from your browser or file manager the first time.

## Features

- All 20 Premier League clubs for 2026/27 with current squads, crests and player photos.
- A full 38 game Premier League season with a live table, fixtures, results, top scorers and squad stats.
- Jak's Cup, a 16 team knockout. Drawn ties go to a playable penalty shootout.
- Quick matches, a Finishing Challenge and standalone shootouts.
- Formations (4-3-3, 4-4-2, 4-2-3-1, 3-5-2) and line-up changes before every match.
- Goal replays, commentary, half-time and full-time stats, and player of the match.
- A trophy room with records, season history and 17 achievements.
- Four difficulty levels, adjustable match length and camera distance, and a battery saver graphics mode.
- An update check on every launch, plus a share button that sends the latest APK link.

## How updates work

The app reads `https://api.github.com/repos/nugggy/jaks-championship-league/releases/latest` on launch. If that release's tag is newer than the installed version, it offers to download the APK attached to the release. Android then asks the player to confirm the install. Saved seasons and records are kept, because every release is signed with the same key.

## Development

```
npm install
npm run dev        # browser preview at http://localhost:5173
npm test           # season logic and club data checks
npm run build      # production web build into dist/
npm run sync       # build and copy into the Android project
```

Building the APK locally needs Android SDK 36 and JDK 21 (Android Studio's bundled JBR works). Release signing reads these environment variables: `JCL_KEYSTORE_PATH`, `JCL_KEYSTORE_PASSWORD`, `JCL_KEY_ALIAS` and `JCL_KEY_PASSWORD`. Without them Gradle produces an unsigned release build.

Helper scripts:

- `node scripts/icons.mjs`, then `npx capacitor-assets generate --android`, regenerates the launcher icon and splash.
- `node scripts/webp.mjs` converts any new PNG crests or headshots to WebP and updates the club data.

## Releasing a new version

1. Optionally add notes in `release-notes/vX.Y.Z.md`.
2. Run `npm version patch` (or `minor` / `major`). This bumps `package.json` and creates the `vX.Y.Z` tag.
3. Run `git push --follow-tags`.

The GitHub Actions workflow tests, builds and signs the APK. It then publishes a release with `jaks-championship-league.apk` attached, and every installed copy will offer the update on its next launch.

The workflow needs two repository secrets:

- `JCL_KEYSTORE_B64`: the release keystore, base64 encoded.
- `JCL_KEYSTORE_PASSWORD`: its password. The key alias is `jcl`.

Keep a backup of the keystore. If it is lost, existing installs cannot be updated in place and players will need to uninstall first.

## Legal

This is an unofficial, non-commercial fan project. It is not affiliated with, endorsed by or connected to the Premier League or any club. Club names, crests and player images are trademarks or copyright of their respective owners and are used here for identification only. Rights holders can open an issue to request removal of any material. Player ratings are estimates made for gameplay.
