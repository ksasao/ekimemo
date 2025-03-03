import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature
import pandas as pd
from PIL import Image
import numpy as np
import os

# CSVファイルを読み込む
df = pd.read_csv('../data.csv', encoding='utf-8')

# 2つの緯度経度の範囲を定義
ranges = [
    (df['lat'].min() - 3, df['lat'].max() + 3, df['lng'].min() - 4, df['lng'].max() + 4),
    (df['lat'].min() - 6, df['lat'].max() + 6, df['lng'].min() - 10, df['lng'].max() + 10)
]

# 地図を描画して保存する関数
def save_map(lat_min, lat_max, lon_min, lon_max, filename):
    fig = plt.figure(figsize=(5, 5), frameon=False)
    ax = fig.add_subplot(1, 1, 1, projection=ccrs.Mercator())
    
    ax.set_extent([lon_min, lon_max, lat_min, lat_max], crs=ccrs.PlateCarree())
    
    ax.add_feature(cfeature.LAND, facecolor='#E6F0C9')
    ax.add_feature(cfeature.OCEAN, facecolor='#B3E5FC')
    
    for _, row in df.iterrows():
        ax.plot(row['lng'], row['lat'], marker='o', color='red', markersize=5, transform=ccrs.PlateCarree())
    
    ax.axis('off')
    
    plt.subplots_adjust(top=1, bottom=0, right=1, left=0, hspace=0, wspace=0)
    plt.margins(0,0)
    
    plt.savefig('temp_map.png', dpi=300, bbox_inches='tight', pad_inches=0)
    plt.close()
    
    with Image.open('temp_map.png') as img:
        width, height = img.size
        size = min(width, height)
        left = (width - size) / 2
        top = (height - size) / 2
        right = (width + size) / 2
        bottom = (height + size) / 2
        img_cropped = img.crop((left, top, right, bottom))
        
        img_cropped.save(filename)
    
    os.remove('temp_map.png')

# 2つの範囲でそれぞれ地図を保存
for i, (lat_min, lat_max, lon_min, lon_max) in enumerate(ranges, 1):
    save_map(lat_min, lat_max, lon_min, lon_max, f'basemap{i}.png')
