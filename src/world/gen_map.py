import pandas as pd
import geopandas as gpd
import folium
import numpy as np
from shapely.geometry import box
from geovoronoi import voronoi_regions_from_coords
from branca.element import MacroElement
from jinja2 import Template

# --- 1. データの読み込みと準備 ---
# データソースURL
DATA_URL = "https://raw.githubusercontent.com/Seo-4d696b75/station_database/refs/heads/main/out/main/station.csv"

print(f"'{DATA_URL}' からデータを読み込んでいます...")
try:
    # データを読み込み
    df = pd.read_csv(DATA_URL)

    # 緯度・経度・駅名が欠損しているデータを除外
    df = df.dropna(subset=['lat', 'lng', 'name'])
    df_sample = df
        
    # GeoDataFrameを作成 (CRS=EPSG:4326 は標準的な緯度経度)
    gdf = gpd.GeoDataFrame(
        df_sample,
        geometry=gpd.points_from_xy(df_sample.lng, df_sample.lat),
        crs="EPSG:4326"
    )
    gdf = gdf[['name', 'geometry']].reset_index(drop=True)

except Exception as e:
    print(f"データの読み込みに失敗しました: {e}")
    exit()

# --- 2. ボロノイ領域の計算 ---
world_boundary = box(-180, -90, 180, 90)
coords = np.array(list(zip(gdf.geometry.x, gdf.geometry.y)))

print("ボロノイ領域を計算中... (時間がかかる場合があります)")
region_polys, region_pts_indices = voronoi_regions_from_coords(
    coords, 
    world_boundary, 
    per_geom=False 
)

# --- 3. ボロノイ領域の GeoDataFrame を作成 ---
print("ボロノイ領域をGeoDataFrameに変換中...")
voronoi_list = []
# region_polys は辞書 {coordsのインデックス: ポリゴン}
for i, poly in region_polys.items():
    try:
        station_name = gdf.iloc[i]['name']
    except IndexError:
        station_name = "不明 (IndexError)" # 念のためのエラーハンドリング
    
    voronoi_list.append({
        'geometry': poly,
        'name': station_name  # 'name' を辞書に直接格納
    })

# ボロノイ領域のGeoDataFrame
voronoi_gdf = gpd.GeoDataFrame(voronoi_list, crs="EPSG:4326")

# --- 4. Folium 地図の作成 ---
print("Folium地図を作成中...")
# 地図オブジェクトを作成
m = folium.Map()

# 指定された境界に地図の表示範囲をフィットさせる
m.fit_bounds([[-90, -180], [90, 180]])

# ボロノイ領域をGeoJsonレイヤーとして追加
g = folium.GeoJson(
    voronoi_gdf,
    style_function=lambda x: {
        'fillColor': 'blue',
        'color': 'black',
        'weight': 0.5,
        'fillOpacity': 0.3
    },
    highlight_function=lambda x: {
        'weight': 2,
        'color': 'yellow',
        'fillOpacity': 0.5
    },
).add_to(m)


# --- 5. クリック位置にポップアップを表示するカスタムJavaScript ---
# FoliumのMacroElementを継承して、カスタムJSを地図に追加するクラス
class CustomClickHandler(MacroElement):
    _template = Template(u"""
    {% macro script(this, kwargs) %}
        var map = {{this._parent.get_name()}};

        // Pythonから渡された駅の座標と名前をJavaScript配列に変換
        var stations = [
            {% for i in range(this.n_stations) %}
                {
                    name: "{{this.station_names[i]}}",
                    lat: {{this.station_coords[i][1]}},
                    lng: {{this.station_coords[i][0]}}
                }{% if i < this.n_stations - 1 %},{% endif %}
            {% endfor %}
        ];

        // 地図クリックイベント
        map.on('click', function(e) {
            var clickLat = e.latlng.lat;
            var clickLng = e.latlng.lng;
            if(clickLng < -180 || clickLng > 180){
                return;
            }

            var minDist = Infinity;
            var nearestStation = null;

            // 最も近い駅を探す
            stations.forEach(function(station) {
                var dLat = clickLat - station.lat;
                var dLng = clickLng - station.lng;
                var dist = dLat * dLat + dLng * dLng; // 距離の2乗（高速）

                if (dist < minDist) {
                    minDist = dist;
                    nearestStation = station;
                }
            });

            // ポップアップ表示
            if (nearestStation) {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent("<b>" + nearestStation.name + "</b><br/>")
                    .openOn(map);
            }
        });
    {% endmacro %}
    """)

    def __init__(self, station_coords, station_names):
        super(CustomClickHandler, self).__init__()
        self._name = 'CustomClickHandler'
        self.station_coords = station_coords
        self.station_names = station_names
        self.n_stations = len(station_coords)


# カスタムJSハンドラをマップに追加
station_coords = coords.tolist()
station_names = gdf['name'].tolist()
m.add_child(CustomClickHandler(station_coords, station_names))

credit_html = """
<div style="
    position: absolute;
    bottom: 0px;
    left: 0px;
    background-color: rgba(255, 255, 255, 0.8);
    color: black;
    padding: 2px 2px;
    font-size: 10px;
    z-index: 9999;
">
    <a href="https://github.com/Seo-4d696b75/station_database/tree/main" target="_blank">駅データ</a>を利用しています
</div>
"""
m.get_root().html.add_child(folium.Element(credit_html))
m.get_root().header.add_child(folium.Element("<title>駅メモ！世界の最寄り駅</title>"))


# --- 6. 地図をHTMLファイルとして保存 ---

OUTPUT_FILE = "index.html"
m.save(OUTPUT_FILE)

print(f"\n完了しました。'{OUTPUT_FILE}' をブラウザで開いてください。")