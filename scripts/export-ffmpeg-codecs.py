#!/usr/bin/env python3
"""Write src/lib/cadence/ffmpeg-build.ts from a configured FFmpeg tree.

The enabled decoder and demuxer macros come from config_components.h of the
LGPL build (scripts/build-ffmpeg-lgpl.sh). A container is listed only when
that demuxer is enabled and at least one of its audio decoders is enabled.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG_SRC = Path(os.environ.get("FFMPEG_SRC", "/tmp/ffmpeg-src"))
OUT = ROOT / "src" / "lib" / "cadence" / "ffmpeg-build.ts"

# Extra MIME types browsers understand. These are probes for canPlayType,
# not evidence that FFmpeg was built with a codec.
BROWSER_MIME = {
    "mp3": ["audio/mpeg", "audio/mp3"],
    "wav": ["audio/wav", "audio/wave", "audio/x-wav"],
    "ogg": [
        "audio/ogg",
        "audio/ogg; codecs=vorbis",
        "audio/ogg; codecs=opus",
        "audio/opus",
    ],
    "flac": ["audio/flac", "audio/x-flac"],
    "aac": ["audio/aac", "audio/aacp", "audio/x-aac"],
    "mov": ["audio/mp4", "audio/mp4; codecs=mp4a.40.2", "audio/x-m4a", "audio/m4a"],
    "matroska": ["audio/webm", "audio/webm; codecs=opus", "audio/webm; codecs=vorbis"],
    "ac3": ["audio/ac3"],
    "aiff": ["audio/aiff", "audio/x-aiff"],
    "au": ["audio/basic"],
    "asf": ["audio/x-ms-wma", "audio/x-ms-asf"],
    "amr": ["audio/amr"],
    "caf": ["audio/x-caf"],
}

# Decoders that make a shared container worth offering. A container is kept
# only when the demuxer is enabled and one of these decoders is enabled.
CONTAINER_DECODERS = {
    "ogg": ["vorbis", "opus", "flac", "speex"],
    "mov": ["aac", "alac", "mp3", "ac3"],
    "matroska": ["opus", "vorbis", "aac", "flac", "mp3"],
    "asf": ["wmav1", "wmav2", "wmapro", "wmavoice"],
    "wav": ["pcm_s16le", "pcm_s16be", "pcm_u8", "mp3", "aac"],
    "aiff": ["pcm_s16be", "pcm_s16le"],
    "caf": ["pcm_s16le", "pcm_s16be", "alac", "aac"],
    "au": ["pcm_s16be", "pcm_s8", "pcm_alaw", "pcm_mulaw"],
    "w64": ["pcm_s16le"],
    "mp3": ["mp3", "mp2", "mp1"],
}

# Extensions to drop from mixed containers. They are in the demuxer's own
# extension list, but they are video or image files rather than audio.
SKIP_EXTENSIONS = {
    "mkv",
    "mk3d",
    "mks",
    "wmv",
    "avi",
    "3gp",
    "3g2",
    "mj2",
    "ogv",
    "avif",
    "ism",
    "ismv",
    "isma",
    "f4v",
    "psp",
    "swf",
}

LABELS = {
    "mp3": "MP3",
    "wav": "WAV",
    "ogg": "Ogg",
    "flac": "FLAC",
    "aac": "AAC",
    "asf": "WMA",
    "mov": "M4A",
    "matroska": "WebM",
    "aiff": "AIFF",
    "au": "AU",
    "wv": "WavPack",
    "ape": "APE",
    "ac3": "AC-3",
    "eac3": "E-AC-3",
    "amr": "AMR",
    "caf": "CAF",
    "tta": "TTA",
    "mpc": "Musepack",
    "w64": "Wave64",
    "gsm": "GSM",
    "mlp": "MLP",
    "truehd": "TrueHD",
    "oma": "OMA",
    "voc": "VOC",
    "g722": "G.722",
    "g729": "G.729",
    "ilbc": "iLBC",
    "shorten": "Shorten",
}


def field(body: str, key: str) -> str | None:
    match = re.search(
        rf'\.{key}\s*=\s*(?:NULL_IF_CONFIG_SMALL\("([^"]*)"\)|"([^"]*)")',
        body,
    )
    if not match:
        return None
    return match.group(1) or match.group(2)


def raw_codec(body: str) -> str | None:
    match = re.search(r"\.raw_codec_id\s*=\s*AV_CODEC_ID_([A-Z0-9_]+)", body)
    return match.group(1).lower() if match else None


def audio_codec(body: str) -> str | None:
    match = re.search(r"\.audio_codec\s*=\s*AV_CODEC_ID_([A-Z0-9_]+)", body)
    return match.group(1).lower() if match else None


def brace_body(text: str, start: int) -> str:
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1 : index]
    return ""


def main() -> None:
    cfg = (FFMPEG_SRC / "config_components.h").read_text()
    enabled_dec = {
        match.group(1).lower()
        for match in re.finditer(r"#define CONFIG_([A-Z0-9_]+)_DECODER 1\b", cfg)
    }
    enabled_dmx = {
        match.group(1).lower()
        for match in re.finditer(r"#define CONFIG_([A-Z0-9_]+)_DEMUXER 1\b", cfg)
    }
    desc = (FFMPEG_SRC / "libavcodec" / "codec_desc.c").read_text()
    audio_names: set[str] = set()
    id_to_name: dict[str, str] = {}
    for block in re.split(r"\n    \{", desc):
        if "AVMEDIA_TYPE_AUDIO" not in block:
            continue
        name = re.search(r'\.name\s*=\s*"([^"]+)"', block)
        codec_id = re.search(r"\.id\s*=\s*AV_CODEC_ID_([A-Z0-9_]+)", block)
        if not name:
            continue
        audio_names.add(name.group(1))
        if codec_id:
            id_to_name[codec_id.group(1).lower()] = name.group(1)

    def enabled_decoder(codec_id: str | None) -> str | None:
        if not codec_id:
            return None
        described = id_to_name.get(codec_id, codec_id)
        for candidate in (described, described.replace("_", ""), codec_id, codec_id.replace("_", "")):
            if candidate in enabled_dec:
                return candidate
        return None

    demux: dict[str, dict] = {}
    mux_by_file: dict[str, list[dict]] = {}
    mux_by_name: dict[str, dict] = {}
    for path in (FFMPEG_SRC / "libavformat").glob("*.c"):
        text = path.read_text(errors="replace")
        for match in re.finditer(r"const AVInputFormat ff_([a-z0-9_]+)_demuxer = \{", text):
            body = brace_body(text, match.end() - 1)
            demux[match.group(1)] = {
                "ext": field(body, "extensions"),
                "mime": field(body, "mime_type"),
                "long": field(body, "long_name"),
                "raw": raw_codec(body),
                "file": path.name,
            }
        for match in re.finditer(r"const AVOutputFormat ff_([a-z0-9_]+)_muxer = \{", text):
            body = brace_body(text, match.end() - 1)
            video = re.search(r"\.video_codec\s*=\s*AV_CODEC_ID_([A-Z0-9_]+)", body)
            record = {
                "name": match.group(1),
                "ext": field(body, "extensions"),
                "mime": field(body, "mime_type"),
                "audio": audio_codec(body),
                "video": video.group(1) if video else None,
                "file": path.name,
            }
            mux_by_file.setdefault(path.name, []).append(record)
            mux_by_name[match.group(1)] = record

    listed = re.findall(
        r"&ff_([a-z0-9_]+)_demuxer",
        (FFMPEG_SRC / "libavformat" / "demuxer_list.c").read_text(),
    )
    rows = []
    for name in listed:
        if name not in enabled_dmx or name not in demux:
            continue
        info = demux[name]
        extensions = split_ext(info.get("ext"))
        mimes = split_mime(info.get("mime"))
        same = mux_by_name.get(name)
        allowed = {enabled_decoder(item) or item for item in CONTAINER_DECODERS.get(name, [])}
        related = []
        if same:
            related.append(same)
            related.extend(mux_by_file.get(same["file"], []))
        for mux in related:
            codec = enabled_decoder(mux["audio"])
            video = mux["video"]
            if mux["name"] == name:
                extensions.extend(split_ext(mux["ext"]))
                mimes.extend(split_mime(mux["mime"]))
                continue
            if video and video != "none":
                continue
            if codec and codec in allowed:
                extensions.extend(split_ext(mux["ext"]))
                mimes.extend(split_mime(mux["mime"]))
        extensions = unique(ext for ext in extensions if ext not in SKIP_EXTENSIONS)
        if not extensions:
            continue
        raw = info.get("raw")
        declared = enabled_decoder(raw) if raw else None
        if declared:
            decoders = [declared]
        elif name in CONTAINER_DECODERS:
            decoders = [item for item in CONTAINER_DECODERS[name] if item in enabled_dec]
        elif same and enabled_decoder(same.get("audio")):
            decoders = [enabled_decoder(same.get("audio"))]
        elif name in enabled_dec:
            decoders = [name]
        else:
            decoders = []
        if not decoders:
            continue
        blob = " ".join([info.get("long") or "", info.get("mime") or "", name]).lower()
        audioish = (
            any(mime.startswith("audio/") for mime in mimes)
            or (raw in audio_names if raw else False)
            or name in audio_names
            or any(
                token in blob
                for token in (
                    "audio",
                    "wave",
                    "aiff",
                    "flac",
                    "ogg",
                    "musepack",
                    "wavpack",
                    "amr",
                    "voice",
                    "core audio",
                    "sun au",
                )
            )
            or any(ext in {"wma", "m4a", "m4b", "mka", "opus", "oga"} for ext in extensions)
        )
        if not audioish:
            continue
        if name in {"avi", "swf", "cavsvideo", "daud", "bit"}:
            continue
        mimes.extend(BROWSER_MIME.get(name, []))
        rows.append(
            {
                "id": name,
                "label": LABELS.get(name, clean_label(info.get("long") or name)),
                "demuxer": name,
                "extensions": unique(extensions),
                "mimeTypes": unique(mime.lower() for mime in mimes if mime),
                "decoders": unique(decoders),
            }
        )

    rows.sort(key=lambda row: row["label"].lower())
    write(rows)
    print(f"wrote {len(rows)} formats to {OUT}")


def split_ext(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip().lower() for part in value.split(",") if part.strip()]


def split_mime(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def unique(items) -> list[str]:
    seen: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.append(item)
    return seen


def clean_label(value: str) -> str:
    value = value.split("(")[0].strip()
    return value[:32] if value else "Audio"


def ts_array(values: list[str]) -> str:
    if not values:
        return "[]"
    inner = ", ".join(f'"{value}"' for value in values)
    return f"[{inner}]"


def write(rows: list[dict]) -> None:
    lines = [
        "// Generated by scripts/export-ffmpeg-codecs.py from the LGPL FFmpeg build.",
        "// Do not edit by hand. Re-run the script after scripts/build-ffmpeg-lgpl.sh.",
        "",
        "export type FfmpegAudioFormat = {",
        "  id: string;",
        "  label: string;",
        "  demuxer: string;",
        "  extensions: readonly string[];",
        "  mimeTypes: readonly string[];",
        "  /** Enabled audio decoders that make this demuxer usable. */",
        "  decoders: readonly string[];",
        "};",
        "",
        "export const FFMPEG_AUDIO_FORMATS: readonly FfmpegAudioFormat[] = [",
    ]
    for row in rows:
        lines.append("  {")
        lines.append(f'    id: "{row["id"]}",')
        lines.append(f'    label: "{row["label"]}",')
        lines.append(f'    demuxer: "{row["demuxer"]}",')
        lines.append(f"    extensions: {ts_array(row['extensions'])},")
        lines.append(f"    mimeTypes: {ts_array(row['mimeTypes'])},")
        lines.append(f"    decoders: {ts_array(row['decoders'])},")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    OUT.write_text("\n".join(lines))


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError as err:
        print(err, file=sys.stderr)
        sys.exit(1)
