// 駅データ管理

class StationManager {
  constructor() {
    this.stations = [];
    this.stationPositions = [];
    this.idToIndex = new Map();
    this.lines = [];
    this.codeToLine = new Map();
    this.kdTree = null;
  }

  // 駅データと路線データを読み込む
  async loadData() {
    try {
      // 路線データを読み込む
      const lineResp = await fetch('line.json');
      const lineData = await lineResp.json();
      
      this.lines = lineData;
      this.lines.forEach((line) => {
        this.codeToLine.set(line.code, line);
      });

      // 駅データを読み込む
      const stationResp = await fetch('station.json');
      const data = await stationResp.json();

      this.stations = data.map((s, index) => {
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          name_kana: (s.name_kana || '').toString(),
          lat: Number(s.lat),
          lng: Number(s.lng),
          prefecture: s.prefecture,
          lines: s.lines || [],
          voronoi: s.voronoi || null,
          index,
        };
      });

      this.stationPositions = this.stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        name: s.name,
        searchKey: s.name.replace(/\(.*?\)/g, '').trim(),
        name_kana: s.name_kana,
        prefecture: s.prefecture,
        lines: s.lines,
        id: s.id,
        index: s.index,
      }));

      this.stations.forEach((s, idx) => {
        this.idToIndex.set(s.id, idx);
      });

      // kd-tree を構築
      this.kdTree = new KDTree(this.stationPositions);

      return true;
    } catch (e) {
      console.error('データの読み込みに失敗しました', e);
      throw new Error('データの読み込みに失敗しました。ファイルの配置を確認してください。');
    }
  }

  // IDから駅を取得
  getStationById(id) {
    const idx = this.idToIndex.get(Number(id));
    if (idx === undefined) return null;
    return this.stationPositions[idx];
  }

  // インデックスから駅を取得
  getStationByIndex(index) {
    return this.stationPositions[index];
  }

  // 名前で駅を検索
  findStationByName(name) {
    return this.stationPositions.find(s => s.name === name);
  }

  // 駅を検索（部分一致）
  searchStations(query) {
    const q = (query || '').trim();
    const lower = q.toLowerCase();

    if (!q) {
      return this.stationPositions.slice(0, CONFIG.search.defaultCandidates);
    }

    // 完全一致を優先
    const exact = this.stationPositions.find(
      (s) =>
        s.name.toLowerCase() === lower ||
        (s.name_kana || '').toLowerCase() === lower
    );

    if (exact) {
      const others = this.stationPositions.filter(
        (s) =>
          (s.searchKey.toLowerCase().includes(lower) ||
            (s.name_kana || '').toLowerCase().includes(lower)) &&
          s.id !== exact.id
      );
      return [exact].concat(others.slice(0, CONFIG.search.maxCandidates - 1));
    }

    // 部分一致
    return this.stationPositions
      .filter(
        (s) =>
          s.searchKey.toLowerCase().includes(lower) ||
          (s.name_kana || '').toLowerCase().includes(lower)
      )
      .slice(0, CONFIG.search.maxCandidates);
  }

  // 指定した駅から近い順に最大count件の駅を取得（自身は除外）
  getNearestStations(station, count) {
    if (!station || !this.kdTree || !Array.isArray(this.stationPositions)) {
      return [];
    }

    const maxCount = Math.min(Math.max(0, Number(count) || 0), this.stationPositions.length - 1);
    if (maxCount <= 0) {
      return [];
    }

    const results = this.kdTree.kNearestExcept(station.lat, station.lng, maxCount, station.index);
    if (!results || !results.length) {
      return [];
    }

    return results.map((entry) => entry.point);
  }

  // 任意の座標から距離が近い順に駅を取得
  getNearestStationsByLatLng(latlng, count) {
    if (!latlng || !Array.isArray(this.stationPositions) || !this.stationPositions.length) {
      return new Map();
    }

    const limit = Math.min(Math.max(0, count || 0), this.stationPositions.length);
    if (limit <= 0) {
      return new Map();
    }

    const distances = this.stationPositions.map((station) => {
      const dist2 = this.distanceSquaredLatLng(latlng[0], latlng[1], station.lat, station.lng);
      return { station, dist2 };
    });

    distances.sort((a, b) => a.dist2 - b.dist2);

    const result = new Map();
    for (let i = 0; i < limit && i < distances.length; i++) {
      const entry = distances[i];
      result.set(entry.station.index, { rank: i + 1, dist2: entry.dist2 });
    }

    return result;
  }

  // 選択中の駅を起点とした際の順位（距離が近い順）を取得
  getStationRankFrom(baseStation, targetStation) {
    if (!baseStation || !targetStation || !Array.isArray(this.stationPositions)) {
      return null;
    }

    const baseIndex = baseStation.index;
    const targetIndex = targetStation.index;
    if (baseIndex === undefined || targetIndex === undefined) {
      return null;
    }

    return this.getStationRankFromLatLng([baseStation.lat, baseStation.lng], targetStation, new Set([baseIndex]));
  }

  // 任意の緯度経度からターゲット駅までの順位（距離が近い順）を取得
  getStationRankFromLatLng(latlng, targetStation, skipIndices = new Set()) {
    if (!latlng || !targetStation || !this.stationPositions.length) {
      return null;
    }

    const baseLat = latlng[0];
    const baseLng = latlng[1];
    const targetDist2 = this.distanceSquaredLatLng(baseLat, baseLng, targetStation.lat, targetStation.lng);

    if (targetDist2 === 0) {
      return 1;
    }

    let closerCount = 0;
    for (let i = 0; i < this.stationPositions.length; i++) {
      const candidate = this.stationPositions[i];
      if (!candidate) continue;
      if (candidate.index === targetStation.index || skipIndices.has(candidate.index)) {
        continue;
      }

      const dist2 = this.distanceSquaredLatLng(baseLat, baseLng, candidate.lat, candidate.lng);
      if (dist2 < targetDist2) {
        closerCount++;
      }
    }

    return closerCount + 1;
  }

  distanceSquaredLatLng(baseLat, baseLng, targetLat, targetLng) {
    const dx = baseLng - targetLng;
    const dy = baseLat - targetLat;
    return dx * dx + dy * dy;
  }

  // 路線名を取得
  getLineNames(lineCodes) {
    if (!lineCodes || lineCodes.length === 0) {
      return [];
    }
    
    return lineCodes
      .map(code => {
        const line = this.codeToLine.get(code);
        return line ? line.name : null;
      })
      .filter(name => name !== null);
  }

  // 路線名のHTMLを生成
  getLineNamesHTML(lineCodes) {
    const lineNames = this.getLineNames(lineCodes);
    
    if (lineNames.length === 0) {
      return '';
    }
    
    return `
      <div style="font-size: 12px; color: #555; margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee;">
        <div style="font-weight: 600; margin-bottom: 2px;">路線:</div>
        <div style="line-height: 1.4;">${lineNames.join('、')}</div>
      </div>
    `;
  }
}
