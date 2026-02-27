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

    Args:
        row: Dict of column→value for one CSV row
        cap: Maximum characters to return

    Returns:
        List of character name strings
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


def load_csv_scenarios(csv_path: str) -> List[Dict]:
    """
    Load and parse filtered_responses.csv into a list of scenario dicts.

    Each unique ResponseID with both Intervention=0 and Intervention=1 rows
    produces one scenario dict with the structure:

        {
          "response_id": str,
          "passengers":  List[str],   # harmed if AV swerves (Intervention=1 row)
          "pedestrians": List[str],   # harmed if AV stays   (Intervention=0 row)
          "traffic_light": "Green"|"Red",
          "barrier": bool,            # True if swerve target is a barricade
          "credences": {
              "deontological": float, # stay_prob  (non-interference belief)
              "utilitarian":   float, # swerve_prob (intervention belief)
          },
          "human_choice": "stay"|"swerve",
        }

    Pairs where either intervention row is missing are silently skipped.

    Args:
        csv_path: Absolute or relative path to filtered_responses.csv

    Returns:
        List of scenario dicts
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    # Group rows by ResponseID
    groups: Dict[str, Dict[str, dict]] = {}  # {response_id: {0: row, 1: row}}

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
            # Keep first occurrence for each intervention value per ResponseID
            if intervention not in groups[rid]:
                groups[rid][intervention] = row

    scenarios = []
    for rid, pair in groups.items():
        if 0 not in pair or 1 not in pair:
            continue  # Skip incomplete pairs

        row_stay   = pair[0]  # Intervention=0: these characters die if AV stays
        row_swerve = pair[1]  # Intervention=1: these characters die if AV swerves

        # Per the README: Barrier column identifies character type in each row.
        #   Barrier=1 → characters in that row are AV *passengers* (inside the vehicle).
        #   Barrier=0 → characters in that row are *pedestrians* (on the road).
        try:
            barrier_stay   = int(float(row_stay.get("Barrier",   0))) == 1
            barrier_swerve = int(float(row_swerve.get("Barrier", 0))) == 1
        except (ValueError, TypeError):
            barrier_stay, barrier_swerve = False, False

        # AV passengers: from whichever row is marked Barrier=1.
        # PedPed=1 scenarios have Barrier=0 on both rows → no passengers.
        if barrier_stay:
            passengers_in_av = _counts_to_list(row_stay)
        elif barrier_swerve:
            passengers_in_av = _counts_to_list(row_swerve)
        else:
            passengers_in_av = []

        # Lane character groups (only from pedestrian rows, i.e. Barrier=0).
        lane1_chars = [] if barrier_stay   else _counts_to_list(row_stay)
        lane2_chars = [] if barrier_swerve else _counts_to_list(row_swerve)

        if not lane1_chars and not barrier_stay:
            lane1_chars = ["Man"]
        if not lane2_chars and not barrier_swerve:
            lane2_chars = ["Man"]

        # Legacy fields used by simulation engine (harmed counts must be correct).
        #   pedestrians = characters harmed if AV stays
        #   passengers  = characters harmed if AV swerves
        pedestrians = passengers_in_av if barrier_stay   else lane1_chars
        passengers  = passengers_in_av if barrier_swerve else lane2_chars
        if not pedestrians:
            pedestrians = ["Man"]
        if not passengers:
            passengers = ["Man"]

        # Traffic light applies to pedestrians only (no legality for passengers).
        # Use the Barrier=0 row (pedestrian row) for CrossingSignal.
        ped_row = row_swerve if barrier_stay else row_stay
        try:
            signal = int(float(ped_row.get("CrossingSignal", 0)))
        except (ValueError, TypeError):
            signal = 0
        traffic_light = "Green" if signal == 1 else "Red"

        # Credences from Intervention=0 row (same for both rows of a pair)
        try:
            stay_prob = float(row_stay.get("stay_prob", 0.5))
            swerve_prob = float(row_stay.get("swerve_prob", 0.5))
        except (ValueError, TypeError):
            stay_prob, swerve_prob = 0.5, 0.5

        # Normalise if they don't sum to ~1
        total = stay_prob + swerve_prob
        if total > 0:
            stay_prob /= total
            swerve_prob /= total
        else:
            stay_prob, swerve_prob = 0.5, 0.5

        # Human majority choice from n_stay / n_swerve on Intervention=0 row
        try:
            n_stay = float(row_stay.get("n_stay", 0))
            n_swerve = float(row_stay.get("n_swerve", 0))
        except (ValueError, TypeError):
            n_stay, n_swerve = 0.0, 0.0
        human_choice = "stay" if n_stay >= n_swerve else "swerve"

        scenarios.append({
            "response_id":     rid,
            # Legacy simulation fields (harmed if stay / harmed if swerve)
            "pedestrians":     pedestrians,
            "passengers":      passengers,
            # Actual AV occupants and lane contents for visualization
            "passengers_in_av": passengers_in_av,
            "lane1_chars":     lane1_chars,
            "lane2_chars":     lane2_chars,
            "lane1_is_barrier": barrier_stay,
            "lane2_is_barrier": barrier_swerve,
            "traffic_light":   traffic_light,
            "barrier":         barrier_swerve,  # legacy: True when swerve lane has barrier
            "credences": {
                "deontological": round(stay_prob, 6),
                "utilitarian":   round(swerve_prob, 6),
            },
            "human_choice": human_choice,
        })

    return scenarios
