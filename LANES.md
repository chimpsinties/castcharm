# CastCharm Server Lanes

Use separate server lanes so schema changes, downloaded files, and auto-delete behavior can be tested without touching your real library.

## Dev Lane

Use this for experiments and active testing.

```powershell
.\scripts\run-dev.ps1
adb reverse tcp:8001 tcp:8001
```

Android server URL:

```text
http://127.0.0.1:8001
```

This lane uses:

```text
data/castcharm-dev.db
downloads-dev
downloads-dev/clean-rss
```

## Personal Lane

Use this for your stable daily-driver fork after testing changes in dev.

```powershell
.\scripts\run-personal.ps1
adb reverse tcp:8002 tcp:8002
```

Android server URL:

```text
http://127.0.0.1:8002
```

This lane uses:

```text
data/castcharm-personal.db
downloads-personal
downloads-personal/clean-rss
```

## Original Lane

Keep the original developer's app and server separate. Treat that install as your comparison and fallback, not as a place to test this fork's schema or cleanup behavior.