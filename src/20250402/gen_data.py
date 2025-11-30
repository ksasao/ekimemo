import pandas as pd
import requests

# CSVファイルの読み込み
csv_file = 'station.csv'
df = pd.read_csv(csv_file)

# JSONファイルのURL
url = 'https://raw.githubusercontent.com/Seo-4d696b75/station_database/6fccc81caa5d65fb44a15b1166a036945ee51f04/out/main/station.json'

# JSONファイルのダウンロードと読み込み
response = requests.get(url)
stations_data = response.json()

# 一致するstationの情報を抽出して新しいデータフレームを作成
matched_stations = []
unmatched_stations = []
for index, row in df.iterrows():
    station_name = row['station']

    match_found = False
    for station in stations_data:
        if station['name'] == station_name:
            matched_stations.append({
                'name': row['station'],
                'name_kana': station['name_kana'],
                'lat': station['lat'],
                'lng': station['lng'],
                'radius': 0,
                'area': row['area']
            })
            match_found = True
            break
   
    if not match_found:
        unmatched_stations.append(row)

# 新しいデータフレームを作成
new_df = pd.DataFrame(matched_stations)

# 新しいCSVファイルを保存
new_csv_file = 'data.csv'
new_df.to_csv(new_csv_file, index=False)
print(new_df)

# 合致しなかった行を表示
if unmatched_stations:
    print("合致しなかった駅:")
    for unmatched_station in unmatched_stations:
        print(unmatched_station)
else:
    print("すべての駅が合致しました。")