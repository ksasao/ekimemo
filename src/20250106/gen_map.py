import json
import requests
import folium
from folium.features import DivIcon

# 抽出する文字
filter_str = "羽寝正月"

# station.jsonを指定されたURLからダウンロード (version 20241225)
url = 'https://raw.githubusercontent.com/Seo-4d696b75/station_database/6fccc81caa5d65fb44a15b1166a036945ee51f04/out/main/station.json'
response = requests.get(url)
stations = response.json()

# フィルタリング条件に合致する駅を抽出
target_stations = [station for station in stations if any(char in station['name'] for char in filter_str)]

# 日本地図の中心の座標を設定
map_center = [35.682839, 139.759455]  # 東京の座標を使用

# Folium地図オブジェクトを作成
m = folium.Map(location=map_center, zoom_start=5)

# 各駅を地図上にプロット
for station in target_stations:
    name_html = station['name']
    for char in filter_str:
        name_html = name_html.replace(char, f"<b style='color:red;'>{char}</b>")
    
    folium.Marker(
        location=[station['lat'], station['lng']],
        popup=folium.Popup(f'<div style="white-space: nowrap; text-align: center;">{name_html}</div>', max_width=300)
    ).add_to(m)

# オーバーレイにリンクを追加
link_html = '''
<div style="
    position: fixed; 
    bottom: 0px; 
    left: 0px; 
    background-color: white; 
    padding: 0px; 
    border: 0px solid white; 
    font-size: 10px; 
    z-index: 1000;
">
駅情報は <a href="https://github.com/Seo-4d696b75/station_database/blob/main/README.md" target="_blank">駅データ</a> を利用しています
</div>
'''
m.get_root().html.add_child(folium.Element(link_html))

# 地図をHTMLファイルとして保存
html_path = '../../docs/20250106/index.html'
m.save(html_path)

# HTMLファイルに文字エンコーディング情報とtitleを追加
with open(html_path, 'r', encoding='utf-8') as file:
    html_content = file.read()

# lang属性と文字エンコーディング情報を追加
html_content = html_content.replace('<html>', '<html lang="ja-jp">')
html_content = html_content.replace('<head>', '<head>\n<meta charset="UTF-8">\n<title>羽/寝/正/月 を含む駅一覧</title>')

with open(html_path, 'w', encoding='utf-8') as file:
    file.write(html_content)
