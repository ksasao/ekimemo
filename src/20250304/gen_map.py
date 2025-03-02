import re
import json
import requests
import pandas as pd
import shutil
import os

# CSVファイルを読み込む
csv_file = 'data.csv'
df = pd.read_csv(csv_file, header=None, names=['name', 'name_kana', 'lat', 'lon', 'radius'])

# name_kanaがNaNのときは空文字を設定
df['name_kana'] = df['name_kana'].fillna('')

# DataFrameをJSONのリストに変換
marker_data = df.to_dict(orient='records')

# 結果を表示
print(marker_data)

# HTMLテンプレートを読み込む
with open('template.html', 'r', encoding='utf-8') as file:
    html_template = file.read()

# markerDataの部分を生成されたデータで置き換え 
marker_data_json = json.dumps(marker_data, ensure_ascii=False) 
html_content = re.sub(
     r'var markerData = \[.*?\]; // REPLACE_MARKER_DATA',
     f'var markerData = {marker_data_json};',
     html_template
)

# HTMLファイルに書き込む
output_path = "../../docs/20250304/"
os.makedirs(output_path, exist_ok=True)
with open(os.path.join(output_path, 'index.html'), 'w', encoding='utf-8') as file:
    file.write(html_content)

# icon.pngをoutput_pathにコピーする
shutil.copy('icon.png',output_path)
