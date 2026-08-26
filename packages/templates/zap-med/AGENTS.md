# zap-med runtime

This VM is a Zap med-weight runtime: zap-light plus the AI/gen-media gateway,
the content-addressed media filesystem, and ffmpeg presets.

- Media objects live at `/zap/media/<kind>/<sha256[0:2]>/<sha256>.<ext>` with a
  `.json` sidecar next to each object. Never rename or edit stored objects;
  `put` new bytes instead.
- Project files live under `/zap/fs`; link media into projects with the media
  FS `link` (hardlink) API, never by copying.
- FFmpeg work goes through the `ffmpeg` lane presets listed in
  `/zap/ffmpeg-presets.json`. Do not shell out to ffmpeg directly.
- Plan-only is the default: paid gateway calls require an explicit live run
  with a resolvable payer.
- Provider keys arrive at runtime through the gateway env allowlist; nothing
  in this snapshot contains a secret, and none should ever be written into it.
- Optional skills live under `/zap/skills/<name>/SKILL.md`.
