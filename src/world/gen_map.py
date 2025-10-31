import pandas as pd
import geopandas as gpd
import folium
import numpy as np
from shapely.geometry import box, Polygon, LineString, Point
from shapely.ops import transform
from geovoronoi import voronoi_regions_from_coords
from branca.element import MacroElement
from jinja2 import Template
import pyproj
from functools import partial

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

# --- 3. 測地線補間関数 ---
def densify_geodesic(polygon, max_segment_length=100000):  # 100km
    """
    ポリゴンのエッジを測地線に沿って細分化する
    
    Parameters:
    -----------
    polygon : shapely.geometry.Polygon
        細分化するポリゴン
    max_segment_length : float
        最大セグメント長（メートル単位）
    
    Returns:
    --------
    shapely.geometry.Polygon
        細分化されたポリゴン
    """
    # 測地線計算用のGeodオブジェクトを作成
    from pyproj import Geod
    geod = Geod(ellps='WGS84')
    
    def densify_line(coords):
        """座標リストを測地線に沿って細分化"""
        dense_coords = []
        
        for i in range(len(coords) - 1):
            lon1, lat1 = coords[i]
            lon2, lat2 = coords[i + 1]
            
            # 2点間の測地線距離を計算
            azimuth, back_azimuth, distance = geod.inv(lon1, lat1, lon2, lat2)
            
            # 必要な分割数を計算
            n_segments = max(2, int(np.ceil(distance / max_segment_length)))
            
            # 測地線に沿って中間点を生成
            for j in range(n_segments):
                if j == 0:
                    dense_coords.append(coords[i])
                else:
                    # 測地線上の点を計算
                    fraction = j / n_segments
                    lon_inter, lat_inter, _ = geod.fwd(
                        lon1, lat1, azimuth, distance * fraction
                    )
                    dense_coords.append((lon_inter, lat_inter))
        
        # 最後の点を追加
        dense_coords.append(coords[-1])
        
        return dense_coords
    
    # 外側の境界を細分化
    exterior_coords = list(polygon.exterior.coords)
    dense_exterior = densify_line(exterior_coords)
    
    # 内側の穴も細分化（もしあれば）
    dense_interiors = []
    for interior in polygon.interiors:
        interior_coords = list(interior.coords)
        dense_interior = densify_line(interior_coords)
        dense_interiors.append(dense_interior)
    
    # 新しいポリゴンを作成
    if dense_interiors:
        return Polygon(dense_exterior, dense_interiors)
    else:
        return Polygon(dense_exterior)

# --- 4. 別の方法: 簡易的な細分化（より高速） ---
def densify_polygon_simple(polygon, num_points=50):
    """
    ポリゴンのエッジを単純に細分化する（測地線ではないが高速）
    
    Parameters:
    -----------
    polygon : shapely.geometry.Polygon
        細分化するポリゴン
    num_points : int
        各エッジの最小点数
    
    Returns:
    --------
    shapely.geometry.Polygon
        細分化されたポリゴン
    """
    def densify_line_simple(coords):
        """座標リストを線形補間で細分化"""
        dense_coords = []
        
        for i in range(len(coords) - 1):
            lon1, lat1 = coords[i]
            lon2, lat2 = coords[i + 1]
            
            # ユークリッド距離（度単位）
            distance = np.sqrt((lon2 - lon1)**2 + (lat2 - lat1)**2)
            
            # 距離に応じて点数を調整（長い線ほど多くの点を配置）
            n_points = max(2, int(distance * num_points / 10))
            
            # 線形補間で中間点を生成
            for j in range(n_points):
                if j == 0:
                    dense_coords.append(coords[i])
                else:
                    t = j / n_points
                    lon_inter = lon1 + (lon2 - lon1) * t
                    lat_inter = lat1 + (lat2 - lat1) * t
                    dense_coords.append((lon_inter, lat_inter))
        
        dense_coords.append(coords[-1])
        return dense_coords
    
    # 外側の境界を細分化
    exterior_coords = list(polygon.exterior.coords)
    dense_exterior = densify_line_simple(exterior_coords)
    
    # 内側の穴も細分化（もしあれば）
    dense_interiors = []
    for interior in polygon.interiors:
        interior_coords = list(interior.coords)
        dense_interior = densify_line_simple(interior_coords)
        dense_interiors.append(dense_interior)
    
    # 新しいポリゴンを作成
    if dense_interiors:
        return Polygon(dense_exterior, dense_interiors)
    else:
        return Polygon(dense_exterior)

# --- 5. ボロノイ領域の GeoDataFrame を作成（細分化付き） ---
print("ボロノイ領域を細分化してGeoDataFrameに変換中...")

voronoi_list = []
total_regions = len(region_polys)

for idx, (i, poly) in enumerate(region_polys.items()):
    if idx % 100 == 0:
        print(f"処理中... {idx}/{total_regions} 領域")
    
    try:
        station_name = gdf.iloc[i]['name']
        
        # 簡易的な細分化（高速）
        densified_poly = densify_polygon_simple(poly, num_points=30)
        
        voronoi_list.append({
            'geometry': densified_poly,
            'name': station_name
        })
        
    except Exception as e:
        print(f"領域 {i} の処理中にエラー: {e}")
        # エラーが発生した場合は元のポリゴンを使用
        try:
            station_name = gdf.iloc[i]['name']
        except IndexError:
            station_name = "不明"
        
        voronoi_list.append({
            'geometry': poly,
            'name': station_name
        })

# ボロノイ領域のGeoDataFrame
voronoi_gdf = gpd.GeoDataFrame(voronoi_list, crs="EPSG:4326")

# --- 6. Folium 地図の作成 ---
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
    smooth_factor=0  # 簡略化を無効にして、細分化した点を保持
).add_to(m)

# --- 7. クリック位置にポップアップを表示するカスタムJavaScript ---
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

# クレジット表示
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

# --- 8. 地図をHTMLファイルとして保存 ---
OUTPUT_FILE = "index.html"
m.save(OUTPUT_FILE)

print(f"\n完了しました。'{OUTPUT_FILE}' をブラウザで開いてください。")
