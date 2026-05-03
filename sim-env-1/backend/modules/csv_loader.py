"""
CSV Loader Module

Parses filtered_responses.csv and returns structured scenario dicts
suitable for RL agent simulation. Each unique ResponseID produces one
scenario by pairing its two rows (Intervention=0 and Intervention=1).
"""

import csv
from pathlib import Path
from typing import List, Dict, Optional

# Character columns present in the CSV (in order)
CHARACTER_COLUMNS = [
    "Man", "Woman", "Pregnant", "Stroller", "OldMan", "OldWoman",
    "Boy", "Girl", "Homeless", "LargeWoman", "LargeMan", "Criminal",
    "MaleExecutive", "FemaleExecutive", "FemaleAthlete", "MaleAthlete",
    "FemaleDoctor", "MaleDoctor", "Dog", "Cat"
]


def _counts_to_list(row: dict, cap: int = 5) -> List[str]:
    """
    Convert character count columns in a CSV row to a flat list of names.

    E.g. if row["Man"]==2 and row["Woman"]==1, returns ["Man","Man","Woman"].
    Caps total list length at `cap` (default 5) to match existing validation.
    """
    result = []
    for col in CHARACTER_COLUMNS:
        raw = row.get(col, 0)
        try:
            count = int(float(raw))
        except (ValueError, TypeError):
            count = 0
        for _ in range(count):
            if len(result) >= cap:
                break
            result.append(col)
        if len(result) >= cap:
            break
    return result


def _signal(row: dict) -> str:
    """Return 'Green' (CrossingSignal=1, legal to cross) or 'Red'."""
    try:
        return "Green" if int(float(row.get("CrossingSignal", 0))) == 1 else "Red"
    except (ValueError, TypeError):
        return "Red"


def load_csv_scenarios(csv_path: str) -> List[Dict]:
    """
    Load and parse filtered_responses.csv into a list of scenario dicts.

    Each unique ResponseID with both Intervention=0 and Intervention=1 rows
    produces one scenario dict.  Key fields:

        response_id        str
        ped_ped            bool   — True = ped-vs-ped (no AV passengers)
        passengers_in_av   list   — AV occupants (empty for ped-ped)
        lane1_chars        list   — characters in stay-path crosswalk
        lane2_chars        list   — characters in swerve-path crosswalk
        lane1_is_barrier   bool   — True if stay-side has a barrier
        lane2_is_barrier   bool   — True if swerve-side has a barrier
        lane1_signal       str    — 'Green'|'Red' (stay row CrossingSignal)
        lane2_signal       str    — 'Green'|'Red' (swerve row CrossingSignal)
        traffic_light      str    — same as lane1_signal (legacy)
        barrier            bool   — True when swerve lane has barrier (legacy)
        pedestrians        list   — harmed if AV stays  (legacy sim engine)
        passengers         list   — harmed if AV swerves (legacy sim engine)
        credences          dict   — {deontological, utilitarian}
        human_choice       str    — 'stay'|'swerve'
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    groups: Dict[str, Dict[str, dict]] = {}

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = row.get("ResponseID", "").strip()
            if not rid:
                continue
            try:
                intervention = int(float(row.get("Intervention", "-1")))
            except (ValueError, TypeError):
                continue
            if intervention not in (0, 1):
                continue
            if rid not in groups:
                groups[rid] = {}
            if intervention not in groups[rid]:
                groups[rid][intervention] = row

    scenarios = []
    for rid, pair in groups.items():
        if 0 not in pair or 1 not in pair:
            continue

        row_stay   = pair[0]   # Intervention=0: die if AV stays
        row_swerve = pair[1]   # Intervention=1: die if AV swerves

        # ── PedPed flag ───────────────────────────────────────────────────────
        try:
            ped_ped = int(float(row_stay.get("PedPed", 0))) == 1
        except (ValueError, TypeError):
            ped_ped = False

        # ── Barrier detection ─────────────────────────────────────────────────
        # Barrier=1 in a row means those characters are AV passengers (inside the
        # vehicle); Barrier=0 means they are pedestrians in the road.
        try:
            barrier_stay   = int(float(row_stay.get("Barrier",   0))) == 1
            barrier_swerve = int(float(row_swerve.get("Barrier", 0))) == 1
        except (ValueError, TypeError):
            barrier_stay, barrier_swerve = False, False

        # ── AV occupants ──────────────────────────────────────────────────────
        if barrier_stay:
            passengers_in_av = _counts_to_list(row_stay)
        elif barrier_swerve:
            passengers_in_av = _counts_to_list(row_swerve)
        else:
            passengers_in_av = []

        # ── Lane character groups ─────────────────────────────────────────────
        lane1_chars = [] if barrier_stay   else _counts_to_list(row_stay)
        lane2_chars = [] if barrier_swerve else _counts_to_list(row_swerve)

        if not lane1_chars and not barrier_stay:
            lane1_chars = ["Man"]
        if not lane2_chars and not barrier_swerve:
            lane2_chars = ["Man"]

        # ── Crossing signals (one per row) ────────────────────────────────────
        # lane1_signal: the pedestrian signal for the stay-path (row_stay)
        # lane2_signal: the pedestrian signal for the swerve-path (row_swerve)
        # When Barrier=1, the signal refers to the AV's legality, not a
        # pedestrian crossing signal, so we mark those as None.
        lane1_signal = None if barrier_stay   else _signal(row_stay)
        lane2_signal = None if barrier_swerve else _signal(row_swerve)

        # Legacy traffic_light: use whichever pedestrian row exists
        traffic_light = lane1_signal or lane2_signal or "Red"

        # ── Legacy fields for simulation engine ───────────────────────────────
        pedestrians = passengers_in_av if barrier_stay   else lane1_chars
        passengers  = passengers_in_av if barrier_swerve else lane2_chars
        if not pedestrians:
            pedestrians = ["Man"]
        if not passengers:
            passengers = ["Man"]

        # ── Credences ─────────────────────────────────────────────────────────
        try:
            stay_prob   = float(row_stay.get("stay_prob",   0.5))
            swerve_prob = float(row_stay.get("swerve_prob", 0.5))
        except (ValueError, TypeError):
            stay_prob, swerve_prob = 0.5, 0.5

        total = stay_prob + swerve_prob
        if total > 0:
            stay_prob /= total
            swerve_prob /= total
        else:
            stay_prob, swerve_prob = 0.5, 0.5

        # ── Human majority choice ─────────────────────────────────────────────
        try:
            n_stay   = float(row_stay.get("n_stay",   0))
            n_swerve = float(row_stay.get("n_swerve", 0))
        except (ValueError, TypeError):
            n_stay, n_swerve = 0.0, 0.0
        human_choice = "stay" if n_stay >= n_swerve else "swerve"

        scenarios.append({
            "response_id":      rid,
            "ped_ped":          ped_ped,
            # Visualization fields
            "passengers_in_av": passengers_in_av,
            "lane1_chars":      lane1_chars,
            "lane2_chars":      lane2_chars,
            "lane1_is_barrier": barrier_stay,
            "lane2_is_barrier": barrier_swerve,
            "lane1_signal":     lane1_signal,   # 'Green'|'Red'|None
            "lane2_signal":     lane2_signal,   # 'Green'|'Red'|None
            # Legacy
            "traffic_light":    traffic_light,
            "barrier":          barrier_swerve,
            "pedestrians":      pedestrians,
            "passengers":       passengers,
            # Credences + human choice
            "credences": {
                "deontological": round(stay_prob,   6),
                "utilitarian":   round(swerve_prob, 6),
            },
            "human_choice": human_choice,
        })

    return scenarios
