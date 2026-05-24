#!/usr/bin/env python3
import argparse
import csv
import heapq
import math
from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple

EARTH_RADIUS_KM = 6371.0088


@dataclass(frozen=True)
class Row:
    idx: int
    denco: str
    station: str
    lat_rad: float
    lng_rad: float


def load_rows(csv_path: str) -> List[Row]:
    rows: List[Row] = []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, rec in enumerate(reader):
            rows.append(
                Row(
                    idx=i,
                    denco=rec["denco"],
                    station=rec["station"],
                    lat_rad=math.radians(float(rec["lat"])),
                    lng_rad=math.radians(float(rec["lng"])),
                )
            )
    return rows


def haversine_km(a: Row, b: Row) -> float:
    dlat = b.lat_rad - a.lat_rad
    dlng = b.lng_rad - a.lng_rad
    s1 = math.sin(dlat * 0.5)
    s2 = math.sin(dlng * 0.5)
    h = s1 * s1 + math.cos(a.lat_rad) * math.cos(b.lat_rad) * s2 * s2
    return 2.0 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def push_topk(max_heap: List[Tuple[float, int, int]], k: int, dist: float, i: int, j: int) -> None:
    item = (-dist, i, j)
    if len(max_heap) < k:
        heapq.heappush(max_heap, item)
        return
    # max_heap[0] keeps the current worst (largest distance among top-k) as negative
    if dist < -max_heap[0][0]:
        heapq.heapreplace(max_heap, item)


def should_skip_pair(a: Row, b: Row) -> bool:
    # Skip pairs that share the same denco to satisfy the data exclusion rule.
    return a.denco == b.denco


def brute_force_topk(rows: Sequence[Row], k: int) -> List[Tuple[float, int, int]]:
    heap: List[Tuple[float, int, int]] = []
    n = len(rows)
    for i in range(n - 1):
        ri = rows[i]
        for j in range(i + 1, n):
            if should_skip_pair(ri, rows[j]):
                continue
            dist = haversine_km(ri, rows[j])
            push_topk(heap, k, dist, i, j)
    result = [(-d, i, j) for d, i, j in heap]
    result.sort(key=lambda x: (x[0], x[1], x[2]))
    return result


def to_xyz(rows: Sequence[Row]):
    xyz = []
    for r in rows:
        clat = math.cos(r.lat_rad)
        xyz.append((clat * math.cos(r.lng_rad), clat * math.sin(r.lng_rad), math.sin(r.lat_rad)))
    return xyz


def kd_tree_topk(rows: Sequence[Row], k: int) -> List[Tuple[float, int, int]]:
    # Optional fast path: use SciPy's cKDTree if available.
    from scipy.spatial import cKDTree  # type: ignore

    n = len(rows)
    if n < 2:
        return []

    xyz = to_xyz(rows)
    tree = cKDTree(xyz)

    # Estimate an initial radius from nearest-neighbor distances in chord space.
    # chord = ||u-v|| on unit sphere, arc_length = 2R*asin(chord/2)
    sample_k = min(8, n)
    dists, _ = tree.query(xyz, k=sample_k)
    candidate_nn = []
    for row_d in dists:
        if sample_k == 1:
            continue
        for d in row_d[1:]:
            if d > 0:
                candidate_nn.append(float(d))
    if not candidate_nn:
        # All points are exactly the same.
        result: List[Tuple[float, int, int]] = []
        for i in range(n - 1):
            if len(result) >= k:
                break
            if should_skip_pair(rows[i], rows[i + 1]):
                continue
            result.append((0.0, i, i + 1))
        return result

    candidate_nn.sort()
    rank = min(len(candidate_nn) - 1, max(0, k - 1))
    chord_r = candidate_nn[rank] * 1.4

    # Expand radius until enough candidate pairs are collected.
    max_possible = n * (n - 1) // 2
    while True:
        pair_idx = tree.query_pairs(r=chord_r, output_type="ndarray")
        if len(pair_idx) >= k or len(pair_idx) == max_possible:
            break
        chord_r = min(math.sqrt(2.0), chord_r * 1.8)
        if chord_r >= math.sqrt(2.0):
            pair_idx = tree.query_pairs(r=chord_r, output_type="ndarray")
            break

    if len(pair_idx) == 0:
        return []

    heap: List[Tuple[float, int, int]] = []
    for i, j in pair_idx:
        i2 = int(i)
        j2 = int(j)
        if i2 > j2:
            i2, j2 = j2, i2
        if should_skip_pair(rows[i2], rows[j2]):
            continue
        dist = haversine_km(rows[i2], rows[j2])
        push_topk(heap, k, dist, i2, j2)

    # Safety net: if radius search under-collected, complete exactly by brute force.
    if len(heap) < k and len(pair_idx) < max_possible:
        return brute_force_topk(rows, k)

    result = [(-d, i, j) for d, i, j in heap]
    result.sort(key=lambda x: (x[0], x[1], x[2]))
    return result


def topk_pairs(rows: Sequence[Row], k: int) -> List[Tuple[float, int, int]]:
    try:
        return kd_tree_topk(rows, k)
    except Exception:
        # Fallback that requires only standard library.
        return brute_force_topk(rows, k)


def format_output(rows: Sequence[Row], pairs: Iterable[Tuple[float, int, int]]) -> List[str]:
    lines = []
    for dist, i, j in pairs:
        a = rows[i]
        b = rows[j]
        # i < j is guaranteed, so (small row number) comes first.
        lines.append(f"{a.denco},{a.station},{b.denco},{b.station},{dist:.3f}")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Find top-N nearest row pairs by (lat,lng) in data.csv"
    )
    parser.add_argument("--input", default="data.csv", help="Input CSV path")
    parser.add_argument("--top", type=int, default=50, help="How many nearest pairs to output")
    parser.add_argument(
        "--output",
        default="",
        help="Output file path (default: print to stdout)",
    )
    args = parser.parse_args()

    rows = load_rows(args.input)
    if len(rows) < 2:
        raise SystemExit("Need at least 2 rows")

    k = min(args.top, len(rows) * (len(rows) - 1) // 2)
    pairs = topk_pairs(rows, k)
    out_lines = format_output(rows, pairs)

    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="") as f:
            f.write("\n".join(out_lines))
            f.write("\n")
    else:
        print("\n".join(out_lines))


if __name__ == "__main__":
    main()
