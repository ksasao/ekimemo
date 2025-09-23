import pandas as pd
import re
import json
import requests

# 抽出する文字
filter_str = "月星"

# 駅データ https://github.com/Seo-4d696b75/station_database/blob/main/README.md の
# station.jsonを指定されたURLからダウンロード
url = 'https://raw.githubusercontent.com/Seo-4d696b75/station_database/refs/heads/main/out/main/station.json'
response = requests.get(url)
stations = response.json()

# フィルタリング条件に合致する駅を抽出
marker_data = [{
    'name': station['name'],
    'name_kana': station['name_kana'],
    'lat': station['lat'],
    'lng': station['lng'],
    'radius': 0,
    'pt': 1,
    'coordinates': (station.get('voronoi', {}).get('geometry', {}).get('coordinates', []))[0]
} for station in stations if any(char in station['name'] for char in filter_str)]

# 抽出した駅リストを保存
new_csv_file = 'data.csv'
new_df = pd.DataFrame(marker_data)
new_df.to_csv(new_csv_file, index=False)
print(new_df)
