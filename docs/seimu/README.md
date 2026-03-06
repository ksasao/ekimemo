# せいむのクールタイム計算式
点滴石を穿つLv1～4は以下の式によく合致します(誤差1分以内)。Lv5以降は異なる式のようです(要検証)。
```py
def calc_cool_time(distance_km, ct_max, ct_min):
    """
    distance_km : 札幌までの距離（Haversine の式で算出）
    ct_max      : クールタイムの最大値（時間）
    ct_min      : クールタイムの最小値（時間）
    """
    capped_km = min(distance_km, 1500.0)
    
    dct = ct_max - ct_min
    x2 = capped_km / 1500.0
    return ct_min + dct * x2 + dct*x2*(1-x2)*(1+x2)/2 + dct*x2**2*(1-x2)**2/4 
```
## 各駅のクールタイム計算値
- [点滴石を穿つ Lv.1](station_Lv1.csv)
- [点滴石を穿つ Lv.2](station_Lv2.csv)
- [点滴石を穿つ Lv.3](station_Lv3.csv)
- [点滴石を穿つ Lv.4](station_Lv4.csv)

![Lv2の場合](lv2.png)

※ 緯度・経度データは [駅データ](https://github.com/Seo-4d696b75/station_database/blob/main/README.md) を利用しています。