# CastCharm Feature Changelog - 2026-10-12

This document summarizes the feature work implemented across the CastCharm server and CastCharm Android app during this development session. It is written for review by a human maintainer, not as a low-level commit log.

## Overview

The work adds smart playlist support, improves offline playback behavior on Android, adds Android Auto playlist support, and introduces cleanup options for played episodes. The main user-facing example is a default smart playlist called **New Releases**, backed by editable filters on the server and read-only filter visibility in the Android app.

## Server Features

### Smart Playlists

- Added support for server-side smart playlists alongside existing manual/custom playlists.
- Added a default smart playlist named **New Releases**.
- Smart playlists can be configured with these filters:
  - Podcast/feed selection.
  - Release date window.
  - Sort order, ascending or descending.
  - Episode status, such as all, played, unplayed, or in progress.
  - Download status, such as any, pending, queued, downloading, downloaded, failed, or skipped.
- Smart playlist results are computed from current episode metadata instead of manually stored membership.
- Smart playlists are distinguished from manual playlists in the web UI with a smart-list badge/icon.
- The redundant **Example** label was removed from the default smart playlist.
- The default New Releases description now reads: "Recently released episodes matching your smart filters."

### Smart Playlist Management UI

- Added server UI support for creating and editing smart playlist filter criteria.
- Added a filter criteria panel on smart playlist detail pages.
- Added compact criteria pills in the playlist list and detail view so reviewers can see how a smart playlist is built.
- Added an edit-filters entry point from smart playlist cards and detail pages.

### Feed Setting: Delete Played Episodes

- Added a feed-level setting to automatically delete played episodes from both the phone and server.
- Extended feed models, schemas, and update handling to persist the setting.
- Added the setting to the server feed settings UI.

### Played Episode Cleanup

- Added server-side support for cleanup triggered by playback/played-state changes.
- Ensured played-state changes can drive removal from relevant smart playlists when filters exclude played episodes.

## Android Features

### Playlists on Android

- Added playlist support to the Android app, including list and detail screens.
- Added support for manual/custom, feed-backed, and smart playlists.
- Added local Room database storage for playlists and ordered playlist episode references.
- Added playlist membership state so episode cards know whether an episode is already in a playlist.
- Added playlist play actions that queue downloaded episodes in playlist order.

### Smart Playlist Display

- Smart playlists are visually distinguished from manual playlists in the Android app.
- The default **New Releases** smart playlist no longer shows a redundant **Example** label.
- Smart playlist detail pages show the filter criteria at the top of the list.
- Android filter criteria are read-only and labelled: **Filter criteria (modify filters on the server)**.
- The criteria pills were made compact so they take less vertical space on the phone screen.
- Smart playlist criteria remain visible even when no episodes match the filters.

### Local Smart Playlist Filtering

- Android now applies smart playlist filters locally after merging server episodes with local offline state.
- This prevents episodes from reappearing in an unplayed smart playlist when the phone knows they have already been played offline but the server has not caught up yet.
- Near-complete playback is treated as effectively played for local smart filtering.

### Offline Playback and Sync

- Offline playback progress and played state are recorded locally with pending sync flags.
- When the app reconnects, pending played and playback progress changes sync back to the server.
- Reconnect sync now works in the local development setup that uses `adb reverse` and `http://127.0.0.1:8000`, even when Android does not report a validated network connection.
- The app preserves pending local played/progress state when server episode rows are refreshed.
- Offline playlist views no longer fail with a server connection error just because the server is unreachable.
- Offline users now get a choice between **Downloads** and **Playlists** instead of being forced into the Downloads area.

### Downloads to Phone

- Added or improved phone download scheduling from playlist and episode surfaces.
- Added visible download-to-phone actions without requiring the episode card to be expanded.
- Added display of phone download progress and in-progress states.
- Improved handling for local server URLs so download workers can run in the ADB reverse development setup.
- Added local artwork handling so downloaded episodes and feeds retain useful artwork offline.

### Delete Played Episodes on Android

- Android now understands the feed-level auto-delete-played setting from the server.
- Playback and played-state changes can trigger local cleanup for feeds configured to delete played episodes.
- Cleanup behavior accounts for both phone and server deletion flows.

### Android Auto

- Added Android Auto support for browsing playlists.
- Android Auto now exposes playlists in both online and offline browsing flows.
- Offline Android Auto playlist playback uses local downloaded files and respects playlist order.
- Smart playlists are labelled as smart lists in Android Auto, with the redundant **Example** wording removed.

### Reconnect and Offline UX

- Improved reconnect behavior so the app can recover when the local development server becomes available again.
- Reduced misleading reconnect/offline errors when the app can still use local cached content.
- Added handling so playlist and download screens remain useful when the server is temporarily unavailable.

## Validation Performed

The following checks were run during implementation:

- Server Python syntax checks for touched router code.
- Server playlist JavaScript syntax checks with `node --check`.
- Android Kotlin compilation with `compileDebugKotlin`.
- Android debug builds with `assembleDebug`.
- Android installation to a physical `moto g(9) play` device with `installDebug`.
- ADB reverse connectivity checks against the local server at `http://127.0.0.1:8000`.
- Browser verification of the server playlist detail UI.
- Direct phone database checks to confirm pending offline played/progress rows sync and clear after reconnect.
- Server database spot checks to confirm synced played/progress state reached the server.

## Notes for Reviewers

- The server and Android app should be reviewed together because the Android smart playlist experience depends on server playlist metadata and smart filter configuration.
- The implementation intentionally keeps smart filter editing on the server. Android shows the criteria but does not edit them.
- Offline-first behavior is designed around preserving local playback truth until the server can be updated.
- The local development setup uses `adb reverse tcp:8000 tcp:8000`; worker constraints were adjusted so localhost server access can work even if Android reports no normal network.
