import re
import json
import requests
import pandas as pd
import shutil
import os
import glob

# CSVファイルを読み込む
csv_file = 'data.csv'
df = pd.read_csv(csv_file)

# 文字列の配列を配列として読み込む
df['coordinates'] = df['coordinates'].fillna('[]').apply(json.loads)

# name_kanaがNaNのときは空文字を設定
df['name_kana'] = df['name_kana'].fillna('')

# DataFrameをJSONのリストに変換
marker_data = df.to_dict(orient='records')

# HTMLテンプレートを読み込む
with open('template.html', 'r', encoding='utf-8') as file:
    html_template = file.read()

# markerDataの部分を生成されたデータで置き換え 
marker_data_json = json.dumps(marker_data, ensure_ascii=False).replace(', "coordinates": []', '')
print(marker_data_json)
html_content = re.sub(
     r'var markerData = \[.*?\]; // REPLACE_MARKER_DATA',
     f'var markerData = {marker_data_json};',
     html_template
)

# HTMLファイルに書き込む
# 現在のスクリプトのフォルダを取得
current_dir = os.path.dirname(os.path.abspath(__file__))
current_folder_name = os.path.basename(current_dir)

output_path = f"../../docs/{current_folder_name}/"
print(f"Copy files to {output_path}")
os.makedirs(output_path, exist_ok=True)
with open(os.path.join(output_path, 'index.html'), 'w', encoding='utf-8') as file:
    file.write(html_content)

# アイコン画像をoutput_pathにコピーする
png_files = glob.glob("*.png")
for file in png_files:
    shutil.copy(file, output_path)

# Android用manifestファイルをコピー
shutil.copy('manifest.json',os.path.join(output_path))