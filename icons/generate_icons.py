"""Generates placeholder PWA icons: a simple barbell mark on a dark ground.
Run manually with `python3 generate_icons.py` whenever the mark needs
regenerating. Not part of the app's runtime.
"""
from PIL import Image, ImageDraw

BG = (17, 19, 24)       # near-black ground
ACCENT = (245, 158, 66)  # warm amber accent


def draw_barbell(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(img)

    cx, cy = size / 2, size / 2
    bar_w = size * 0.62
    bar_h = max(2, size * 0.045)
    plate_w = size * 0.09
    plate_h = size * 0.34
    r = plate_w * 0.28

    # bar
    draw.rounded_rectangle(
        [cx - bar_w / 2, cy - bar_h / 2, cx + bar_w / 2, cy + bar_h / 2],
        radius=bar_h / 2,
        fill=ACCENT,
    )

    # plates on each end
    for sign in (-1, 1):
        plate_cx = cx + sign * (bar_w / 2)
        draw.rounded_rectangle(
            [
                plate_cx - plate_w / 2,
                cy - plate_h / 2,
                plate_cx + plate_w / 2,
                cy + plate_h / 2,
            ],
            radius=r,
            fill=ACCENT,
        )

    return img


for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
    draw_barbell(size).save(name)
    print(f"wrote {name}")
