#!/usr/bin/env bash
# Media FS: the content-addressed store at /zap/media plus the project dir
# hardlink target at /zap/fs and the optional skills store.
set -euo pipefail

install -d -m 0755 /zap/media/image /zap/media/audio /zap/media/video /zap/media/3d
install -d -m 0755 /zap/fs
install -d -m 0755 /zap/skills
