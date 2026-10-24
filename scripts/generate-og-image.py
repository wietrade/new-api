#!/usr/bin/env python3
"""生成社交分享图 web/public/og-image.png（1200x630）。

用法：python scripts/generate-og-image.py
依赖：Pillow；中文字形使用系统字体（Windows: msyhbd/msyh，Linux: Noto Sans CJK）。
仅在品牌文案或配色调整时需要重新生成，产物会随前端一起构建。
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "web" / "public"
LOGO = PUBLIC / "brand" / "nowhub-logo.png"
OUT = PUBLIC / "og-image.png"

W, H = 1200, 630
GREEN = (46, 156, 69)
INK = (31, 35, 40)
MUTED = (87, 96, 106)
BG = (255, 255, 255)

FONT_CANDIDATES_BOLD = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]
FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyh.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    print("未找到可用字体，回退到 Pillow 默认字体（中文会显示为方块）", file=sys.stderr)
    return ImageFont.load_default(size)


def main() -> int:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)

    # 顶部品牌绿条（与邮件模板、站点强调色一致）
    draw.rectangle([0, 0, W, 12], fill=GREEN)

    if LOGO.exists():
        logo = Image.open(LOGO).convert("RGBA")
        logo.thumbnail((96, 96), Image.LANCZOS)
        image.paste(logo, (80, 70), logo)
        text_x = 80 + logo.width + 24
        draw.text((text_x, 70 + (96 - 40) // 2), "NowHub API", font=load_font(FONT_CANDIDATES_BOLD, 40), fill=INK)
    else:
        draw.text((80, 80), "NowHub API", font=load_font(FONT_CANDIDATES_BOLD, 40), fill=INK)

    draw.text((80, 230), "统一的模型 API 接入层", font=load_font(FONT_CANDIDATES_BOLD, 72), fill=INK)
    draw.text(
        (80, 340),
        "一个 API 接入主流大模型，按实际用量计费",
        font=load_font(FONT_CANDIDATES, 40),
        fill=MUTED,
    )
    draw.text(
        (80, 420),
        "OpenAI · Claude · Gemini · DeepSeek · Qwen",
        font=load_font(FONT_CANDIDATES, 32),
        fill=GREEN,
    )

    footer_font = load_font(FONT_CANDIDATES, 30)
    draw.text((80, 520), "www.nowhub.org", font=footer_font, fill=MUTED)
    draw.rectangle([80, 505, 80 + 200, 508], fill=GREEN)

    image.save(OUT, "PNG", optimize=True)
    print(f"written {OUT} ({OUT.stat().st_size / 1024:.1f} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
