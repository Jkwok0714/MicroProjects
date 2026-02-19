# Pianyi Resection

Pianyi Resection is a macOS-first Tauri + React desktop utility for single-segment
in-place video removal.

## Capabilities (v1)

- MP4/MOV input scope
- Video preview with scrubbing
- `Set In` / `Set Out` markers from playhead
- Editable timestamp fields (`HH:MM:SS.mmm`)
- Stream-copy first pass for fidelity
- Optional exact-boundary re-encode fallback (prompted)
- Validation before replacement (duration + stream checks)
- Atomic replacement with rollback backup (backup removed on success)
- Processing progress + cancel support

## Commands

- `npm install`
- `npm run dev`
- `npm run tauri dev`
- `npm run test`
- `cargo test --manifest-path src-tauri/Cargo.toml`

## FFmpeg sidecar setup

`src-tauri/bin/ffmpeg` and `src-tauri/bin/ffprobe` are currently development wrappers
that delegate to system binaries from `PATH`.

For packaged release builds, replace those files with pinned distributable binaries
and keep license notices aligned with the shipped artifacts.

## Known limitations

- v1 supports one cut segment per operation.
- Fallback re-encode targets primary video/audio streams.
- Subtitles and non-primary auxiliary streams may not be preserved in fallback mode.
