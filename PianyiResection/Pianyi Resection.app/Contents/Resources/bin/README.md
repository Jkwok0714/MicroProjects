# FFmpeg Sidecar Notes

This folder is bundled into the app package and is expected to contain executable
`ffmpeg` and `ffprobe` binaries for distribution.

For local development in this repo, the included shell scripts forward to system
`ffmpeg`/`ffprobe` binaries from `PATH`.

Before shipping signed builds, replace these scripts with pinned macOS binaries
that satisfy your LGPL-focused distribution requirements and include matching
license notices.
