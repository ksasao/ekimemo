from PIL import Image, ImageDraw
import os

# 元の画像を読み込む
base_image = Image.open('icon_base.png')

# リサイズするサイズのリスト
sizes = [32, 180, 192]

for size in sizes:
    # 画像をリサイズ
    resized_image = base_image.resize((size, size), Image.LANCZOS)
    
    # リサイズした画像を保存
    resized_image.save(f'../icon_{size}.png')

# Android用画像のリサイズ
base_image = Image.open('icon_android.png')
resized_image = base_image.resize((size, size), Image.LANCZOS)
resized_image.save(f'../icon_512a.png')