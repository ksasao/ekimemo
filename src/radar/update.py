import json
import os
import requests
from pathlib import Path

# ベースURL
BASE_URL = "https://raw.githubusercontent.com/Seo-4d696b75/station_database/main"

# ダウンロード対象のファイル
FILES = {
    "latest_info.json": f"{BASE_URL}/latest_info.json",
    "station.json": f"{BASE_URL}/out/main/station.json",
    "line.json": f"{BASE_URL}/out/main/line.json"
}

def download_json(url):
    """URLからJSONをダウンロードして返す。

    戻り値: (parsed_json, raw_text)
    - parsed_json: requestsによってパースしたPythonオブジェクト、解析に失敗したらNone
    - raw_text: サーバーから受け取った元のJSON文字列（utf-8）、失敗時はNone
    """
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        raw_text = response.text
        try:
            parsed = response.json()
        except json.JSONDecodeError as e:
            print(f"JSON解析エラー: {url}")
            print(f"エラー詳細: {e}")
            return None, None
        return parsed, raw_text
    except requests.exceptions.RequestException as e:
        print(f"ダウンロードエラー: {url}")
        print(f"エラー詳細: {e}")
        return None, None

def load_json_file(filepath):
    """ファイルからJSONを読み込む"""
    if not os.path.exists(filepath):
        return None
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"ファイル読み込みエラー: {filepath}")
        print(f"エラー詳細: {e}")
        return None

def save_json_file(filepath, data, raw_text=None):
    """JSONをファイルに保存。

    - `raw_text`が与えられた場合はそのままの文字列を保存して元のフォーマット・サイズを維持する。
    - 与えられない場合は通常のjson.dumpで保存する（従来通り、indent=2）。
    """
    try:
        # ディレクトリが存在しない場合は作成
        os.makedirs(os.path.dirname(str(filepath)) if os.path.dirname(str(filepath)) else '.', exist_ok=True)

        if raw_text is not None:
            # サーバーから受け取った生テキストをそのまま書き込む
            with open(filepath, 'w', encoding='utf-8', newline='') as f:
                f.write(raw_text)
        else:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"保存しました: {filepath}")
        return True
    except IOError as e:
        print(f"ファイル保存エラー: {filepath}")
        print(f"エラー詳細: {e}")
        return False

def main():
    # 現在のスクリプトがあるディレクトリを取得
    script_dir = Path(__file__).parent
    
    # latest_info.jsonをダウンロード
    latest_info_path = script_dir / "latest_info.json"
    print(f"latest_info.jsonをダウンロード中...")
    new_latest_info, new_latest_text = download_json(FILES["latest_info.json"])

    if new_latest_info is None:
        print("latest_info.jsonのダウンロードに失敗しました")
        return
    
    # 既存のlatest_info.jsonと比較
    existing_latest_info = load_json_file(latest_info_path)
    
    if existing_latest_info is not None and existing_latest_info == new_latest_info:
        print("latest_info.jsonに変更はありません")
        return
    
    # latest_info.jsonが異なる場合、保存（元のテキストをそのまま保存してフォーマットを保持）
    print("latest_info.jsonに変更がありました")
    if not save_json_file(latest_info_path, new_latest_info, raw_text=new_latest_text):
        return
    
    # station.jsonとline.jsonもダウンロードして保存
    print("\nstation.jsonをダウンロード中...")
    station_data, station_text = download_json(FILES["station.json"])
    if station_data is not None:
        station_path = (script_dir / ".." / ".." / "docs" / "radar" / "station.json").resolve()
        save_json_file(station_path, station_data, raw_text=station_text)
    else:
        print("station.jsonのダウンロードに失敗しました")
    
    print("\nline.jsonをダウンロード中...")
    line_data, line_text = download_json(FILES["line.json"])
    if line_data is not None:
        line_path = (script_dir / ".." / ".." / "docs" / "radar" / "line.json").resolve()
        save_json_file(line_path, line_data, raw_text=line_text)
    else:
        print("line.jsonのダウンロードに失敗しました")
    
    print("\n処理が完了しました")

if __name__ == "__main__":
    main()
