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
- [Lv1](station_Lv1.csv)
- [Lv2](station_Lv2.csv)
- [Lv3](station_Lv3.csv)
- [Lv4](station_Lv4.csv)