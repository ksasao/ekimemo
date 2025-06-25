import re
import json
import requests

# 抽出する文字
filter_str = "十一かぎ"

# station.jsonを指定されたURLからダウンロード
url = 'https://raw.githubusercontent.com/Seo-4d696b75/station_database/refs/tags/v20250430/out/main/station.json'
response = requests.get(url)
stations = response.json()

# フィルタリング条件に合致する駅を抽出
marker_data = []
for station in stations:
    if any(char in station['name'] for char in filter_str):
        # voronoi.geometry.coordinatesから座標データを取得
        coordinates = station.get('voronoi', {}).get('geometry', {}).get('coordinates', [])
        marker_data.append({
            'lat': station['lat'],
            'lng': station['lng'],
            'name': station['name'],
            'name_kana': station['name_kana'],
            'radius': 0,
            'pt': 1,
            'coordinates': coordinates
        })

print(marker_data)

# HTMLテンプレートを読み込む
with open('template.html', 'r', encoding='utf-8') as file:
    html_template = file.read()
    
# markerDataの部分を生成されたデータで置き換え 
marker_data_json = json.dumps(marker_data, ensure_ascii=False) 
html_content = re.sub(
    r'var markerData = \[.*?\]; // REPLACE_MARKER_DATA',
    f'var markerData = {marker_data_json};'
    , html_template
)

# HTMLファイルに書き込む
with open('../../docs/20250601/index.html', 'w', encoding='utf-8') as file:
    file.write(html_content)