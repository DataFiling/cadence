#!/bin/bash
# Rebuild the single-thread LGPL FFmpeg core used as CADENCE's upload fallback.
#
# This is the published ffmpeg.wasm glue (v0.12.10) linked against FFmpeg n5.1.4
# configured without --enable-gpl, --enable-nonfree, or any GPL library
# (no libx264, libx265, libxvid, or postproc). The only encoder is pcm_s16le
# and the only muxer is WAV.
#
# Requires Emscripten 3.1.40, the toolchain ffmpeg.wasm v0.12.10 was built with:
#   git clone https://github.com/emscripten-core/emsdk.git
#   ./emsdk install 3.1.40 && ./emsdk activate 3.1.40
#   source ./emsdk_env.sh
#
# Sources, if not already on disk:
#   FFmpeg n5.1.4          https://github.com/FFmpeg/FFmpeg/archive/refs/tags/n5.1.4.tar.gz
#   ffmpeg.wasm v0.12.10   https://github.com/ffmpegwasm/ffmpeg.wasm/archive/refs/tags/v0.12.10.tar.gz
#
# Output: vendor/ffmpeg-lgpl/ffmpeg-core.js and ffmpeg-core.wasm

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EMSDK_DIR="${EMSDK_DIR:-/tmp/emsdk}"
FFMPEG_SRC="${FFMPEG_SRC:-/tmp/ffmpeg-src}"
WASM_SRC="${WASM_SRC:-/tmp/ffmpeg.wasm}"
JOBS="${JOBS:-2}"

if [[ ! -f "$EMSDK_DIR/emsdk_env.sh" ]]; then
  echo "Emscripten SDK not found at $EMSDK_DIR" >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh"

if [[ ! -f "$FFMPEG_SRC/configure" ]]; then
  echo "FFmpeg n5.1.4 source not found at $FFMPEG_SRC" >&2
  exit 1
fi
if [[ ! -f "$WASM_SRC/src/bind/ffmpeg/bind.js" ]]; then
  echo "ffmpeg.wasm v0.12.10 source not found at $WASM_SRC" >&2
  exit 1
fi

mkdir -p "$FFMPEG_SRC/src"
rm -rf "$FFMPEG_SRC/src/bind" "$FFMPEG_SRC/src/fftools"
cp -a "$WASM_SRC/src/bind" "$FFMPEG_SRC/src/bind"
cp -a "$WASM_SRC/src/fftools" "$FFMPEG_SRC/src/fftools"

python3 - "$FFMPEG_SRC/src/fftools/opt_common.c" << 'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
old_inc = """#include "libpostproc/postprocess.h"\n#include "libpostproc/version.h"\n"""
new_inc = """#if CONFIG_POSTPROC\n#include "libpostproc/postprocess.h"\n#include "libpostproc/version.h"\n#endif\n"""
old_print = "    PRINT_LIB_INFO(postproc,   POSTPROC,   flags, level);\n"
new_print = "#if CONFIG_POSTPROC\n    PRINT_LIB_INFO(postproc,   POSTPROC,   flags, level);\n#endif\n"
if old_inc not in text or old_print not in text:
    raise SystemExit("opt_common.c did not contain the expected postproc lines")
path.write_text(text.replace(old_inc, new_inc, 1).replace(old_print, new_print, 1))
PY

cd "$FFMPEG_SRC"
export INSTALL_DIR="${INSTALL_DIR:-$FFMPEG_SRC/lgpl-prefix}"
mkdir -p "$INSTALL_DIR"
export CFLAGS="${CFLAGS:--O2}"
export LDFLAGS="${LDFLAGS:-}"
export FFMPEG_ST=1
unset FFMPEG_MT || true

emconfigure ./configure \
  --target-os=none \
  --arch=x86_32 \
  --enable-cross-compile \
  --disable-asm \
  --disable-stripping \
  --disable-programs \
  --disable-doc \
  --disable-debug \
  --disable-runtime-cpudetect \
  --disable-autodetect \
  --disable-network \
  --disable-pthreads \
  --disable-w32threads \
  --disable-os2threads \
  --disable-gpl \
  --disable-nonfree \
  --disable-postproc \
  --disable-encoders \
  --enable-encoder=pcm_s16le \
  --disable-muxers \
  --enable-muxer=wav \
  --nm=emnm \
  --ar=emar \
  --ranlib=emranlib \
  --cc=emcc \
  --cxx=em++ \
  --objcc=emcc \
  --dep-cc=emcc \
  --extra-cflags="$CFLAGS" \
  --extra-cxxflags="$CFLAGS"

if ! grep -q '#define CONFIG_GPL 0' config.h; then
  echo "CONFIG_GPL was not disabled" >&2
  exit 1
fi
if ! grep -q '#define CONFIG_LIBX264 0' config.h && grep -q 'CONFIG_LIBX264 1' config.h; then
  echo "libx264 was enabled" >&2
  exit 1
fi

emmake make -j"$JOBS"

mkdir -p dist/esm
emcc \
  -I. \
  -I./src/fftools \
  -I"$INSTALL_DIR/include" \
  -L"$INSTALL_DIR/lib" \
  -Llibavcodec \
  -Llibavdevice \
  -Llibavfilter \
  -Llibavformat \
  -Llibavutil \
  -Llibswresample \
  -Llibswscale \
  -lavcodec \
  -lavdevice \
  -lavfilter \
  -lavformat \
  -lavutil \
  -lswresample \
  -lswscale \
  -Wno-deprecated-declarations \
  $LDFLAGS \
  -sWASM_BIGINT \
  -sMODULARIZE \
  -sEXPORT_ES6 \
  -sINITIAL_MEMORY=32MB \
  -sALLOW_MEMORY_GROWTH \
  -sEXPORT_NAME=createFFmpegCore \
  -sEXPORTED_FUNCTIONS="$(node src/bind/ffmpeg/export.js)" \
  -sEXPORTED_RUNTIME_METHODS="$(node src/bind/ffmpeg/export-runtime.js)" \
  -lworkerfs.js \
  -O2 \
  --pre-js src/bind/ffmpeg/bind.js \
  src/fftools/cmdutils.c \
  src/fftools/ffmpeg.c \
  src/fftools/ffmpeg_filter.c \
  src/fftools/ffmpeg_hw.c \
  src/fftools/ffmpeg_mux.c \
  src/fftools/ffmpeg_opt.c \
  src/fftools/opt_common.c \
  -o dist/esm/ffmpeg-core.js

python3 - "$FFMPEG_SRC/dist/esm/ffmpeg-core.wasm" << 'PY'
import pathlib, sys
data = pathlib.Path(sys.argv[1]).read_bytes()
# The H.264 decoder mentions x264 in SEI strings and fourccs. Those are not
# the GPL encoder. Fail only if the encoder library itself was linked.
for banned in (b"x264_encoder_open", b"x264_param_default", b"x265_encoder_open"):
    if banned in data:
        raise SystemExit(f"LGPL core links {banned.decode()}")
if b"--disable-gpl" not in data:
    raise SystemExit("configuration string is missing --disable-gpl")
if b"pcm_s16le" not in data:
    raise SystemExit("pcm_s16le encoder missing from LGPL core")
print("LGPL core ok", len(data), "bytes")
PY

OUT="$ROOT/vendor/ffmpeg-lgpl"
mkdir -p "$OUT"
cp "$FFMPEG_SRC/dist/esm/ffmpeg-core.js" "$FFMPEG_SRC/dist/esm/ffmpeg-core.wasm" "$OUT/"
cp "$FFMPEG_SRC/COPYING.LGPLv2.1" "$OUT/COPYING.LGPLv2.1"
echo "Wrote $OUT/ffmpeg-core.js and ffmpeg-core.wasm"
