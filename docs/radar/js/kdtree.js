// kd-tree 実装
// 最近傍駅の高速検索に使用

class KDTree {
  constructor(points) {
    this.root = this.buildTree(points, 0);
  }

  buildTree(points, depth = 0) {
    if (!points || points.length === 0) return null;

    const axis = depth % 2; // 0: lng, 1: lat

    const sorted = points.slice().sort((a, b) => {
      if (axis === 0) {
        return a.lng - b.lng;
      } else {
        return a.lat - b.lat;
      }
    });

    const mid = Math.floor(sorted.length / 2);
    const node = {
      point: sorted[mid],
      axis,
      left: this.buildTree(sorted.slice(0, mid), depth + 1),
      right: this.buildTree(sorted.slice(mid + 1), depth + 1),
    };
    return node;
  }

  // k個の最近傍点を検索
  kNearest(targetLat, targetLng, k) {
    const best = [];
    this._kNearest(this.root, targetLat, targetLng, k, best);
    return best;
  }

  _kNearest(node, targetLat, targetLng, k, best) {
    if (!node) return;

    const p = node.point;
    const dx = targetLng - p.lng;
    const dy = targetLat - p.lat;
    const d2 = dx * dx + dy * dy;

    this._insertBest(best, p, d2, k);

    const axis = node.axis;
    const diff = axis === 0 ? dx : dy;

    const nearSide = diff <= 0 ? node.left : node.right;
    const farSide = diff <= 0 ? node.right : node.left;

    this._kNearest(nearSide, targetLat, targetLng, k, best);

    const bestDist2 = best.length < k ? Infinity : best[0].dist2;
    if (diff * diff < bestDist2) {
      this._kNearest(farSide, targetLat, targetLng, k, best);
    }
  }

  // best[0] を「最も遠い」要素として保持する簡易 max-heap 的配列
  _insertBest(best, point, dist2, k) {
    if (best.length < k) {
      best.push({ point, dist2 });
      best.sort((a, b) => b.dist2 - a.dist2);
    } else if (dist2 < best[0].dist2) {
      best[0] = { point, dist2 };
      best.sort((a, b) => b.dist2 - a.dist2);
    }
  }
}
