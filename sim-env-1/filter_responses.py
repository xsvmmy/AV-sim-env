"""
filter_responses.py
-------------------
Reads SharedResponses.csv and outputs a filtered CSV where each scenario is
represented by its original TWO rows (same ResponseID).

Each scenario in the raw data spans TWO rows (same ResponseID):
  Intervention=0  →  the characters who die if the AV STAYS on course
  Intervention=1  →  the characters who die if the AV SWERVES

Specifying --limit N (or entering N at the prompt) selects the first N
*complete* scenarios encountered in the file.  Both rows for each chosen
scenario are written to the output, so N scenarios → 2N output rows.

Added columns (Steps 1–5 of the probability framework):
  n_stay      — how many users chose STAY for this scenario's character makeup
  n_swerve    — how many users chose SWERVE for this scenario's character makeup
  n_total     — n_stay + n_swerve
  stay_prob   — n_stay / n_total
  swerve_prob — n_swerve / n_total

Both rows of the same scenario share identical values in these five columns.
All scenarios with the same character makeup (fingerprint) also share the same
values, so probabilities aggregate across equivalent scenarios in the output.

Scenarios are dropped when:
  - Either outcome row is missing key columns (character counts, Saved, etc.)
  - The pair is incomplete (only one of the two rows is present for a ResponseID)
"""

# ── Configuration ──────────────────────────────────────────────────────────────

INPUT_FILE  = "SharedResponses.csv"
OUTPUT_FILE = "filtered_responses.csv"

# All 20 character types in the dataset.
CHARACTER_COLUMNS = [
    "Man", "Woman", "Pregnant", "Stroller",
    "OldMan", "OldWoman", "Boy", "Girl",
    "Homeless", "LargeWoman", "LargeMan", "Criminal",
    "MaleExecutive", "FemaleExecutive",
    "FemaleAthlete", "MaleAthlete",
    "FemaleDoctor", "MaleDoctor",
    "Dog", "Cat",
]

# Columns that must be non-empty in both outcome rows for a scenario to be kept.
REQUIRED_SOURCE_COLS = [
    "Intervention", "Saved", "NumberOfCharacters",
    "ScenarioType", "PedPed", "Barrier", "CrossingSignal",
] + CHARACTER_COLUMNS

# New columns appended to the output.
NEW_COLS = ["n_stay", "n_swerve", "n_total", "stay_prob", "swerve_prob"]

# ── Script ─────────────────────────────────────────────────────────────────────

import argparse
import csv
import os
import sys


def _row_is_valid(row):
    """Return True if all required source columns are non-empty."""
    return all(row.get(col, "").strip() != "" for col in REQUIRED_SOURCE_COLS)


def _normalize(val):
    """Normalize character count strings ('2.0' → '2', '' → '0')."""
    try:
        return str(int(float(val.strip())))
    except (ValueError, AttributeError):
        return "0"


def _make_fingerprint(stay_row, swerve_row):
    """
    Build a hashable fingerprint representing the scenario's character makeup
    and structural context (legality, pedestrian/passenger split, barrier).

    Two scenarios with identical fingerprints are treated as the same scenario
    for the purpose of aggregating STAY/SWERVE counts.
    """
    stay_chars   = tuple(_normalize(stay_row.get(c, "0"))   for c in CHARACTER_COLUMNS)
    swerve_chars = tuple(_normalize(swerve_row.get(c, "0")) for c in CHARACTER_COLUMNS)
    structure = (
        stay_row.get("PedPed",         "").strip(),
        stay_row.get("CrossingSignal", "").strip(),   # legality for stay-side
        stay_row.get("Barrier",        "").strip(),
        swerve_row.get("CrossingSignal", "").strip(),  # legality for swerve-side
        swerve_row.get("Barrier",        "").strip(),
    )
    return (stay_chars, swerve_chars, structure)


def _get_choice(stay_row):
    """
    Derive the user's binary choice from the Intervention=0 (STAY-side) row.

    Intervention=0 means these characters die if the AV STAYS.
      Saved=0  →  they actually died  →  user chose STAY
      Saved=1  →  they were spared    →  user chose SWERVE
    """
    return "stay" if stay_row.get("Saved", "").strip() == "0" else "swerve"


def _parse_args():
    parser = argparse.ArgumentParser(
        description="Filter SharedResponses.csv — outputs both raw rows per scenario."
    )
    parser.add_argument(
        "--limit", "-n",
        type=int,
        default=None,
        metavar="N",
        help=(
            "Number of complete scenarios to output (default: all). "
            "Each scenario produces 2 output rows, so N scenarios → 2N rows."
        ),
    )
    return parser.parse_args()


def _prompt_limit():
    """Interactively ask how many scenarios to output."""
    while True:
        raw = input(
            "How many scenarios to output? "
            "(each scenario writes 2 rows; press Enter for all): "
        ).strip()
        if raw == "":
            return None
        try:
            n = int(raw)
            if n > 0:
                return n
            print("  Please enter a positive integer.")
        except ValueError:
            print("  Invalid input — enter a whole number or press Enter for all.")


def main():
    args = _parse_args()

    if args.limit is not None:
        scenario_limit = args.limit
    else:
        scenario_limit = _prompt_limit()

    if scenario_limit is not None:
        print(f"Scenario limit: {scenario_limit:,} scenarios → up to {scenario_limit * 2:,} output rows\n")
    else:
        print("Scenario limit: none (outputting all complete scenarios)\n")

    input_path  = os.path.join(os.path.dirname(__file__), INPUT_FILE)
    output_path = os.path.join(os.path.dirname(__file__), OUTPUT_FILE)

    if not os.path.exists(input_path):
        sys.exit(f"Error: input file not found: {input_path}")

    print(f"Reading:  {input_path}")
    print(f"Writing:  {output_path}\n")

    # ── Phase 1: Collect all valid pairs ──────────────────────────────────────
    # Each entry in `pairs` is (stay_row, swerve_row) where stay_row has
    # Intervention=0 and swerve_row has Intervention=1.

    pairs            = []
    fieldnames       = None
    pending          = {}
    skipped_missing  = 0
    rows_read        = 0

    with open(input_path, newline="", encoding="utf-8") as infile:
        reader     = csv.DictReader(infile)
        fieldnames = list(reader.fieldnames or [])

        missing_cols = [c for c in REQUIRED_SOURCE_COLS if c not in fieldnames]
        if missing_cols:
            sys.exit(
                f"Error: columns not found in {INPUT_FILE}:\n"
                f"  {missing_cols}\n"
                f"Available: {fieldnames}"
            )

        for row in reader:
            rid = row.get("ResponseID", "").strip()
            if not rid:
                continue

            rows_read += 1

            if rid not in pending:
                pending[rid] = row
            else:
                first_row = pending.pop(rid)
                pair = [first_row, row]

                if not all(_row_is_valid(r) for r in pair):
                    skipped_missing += 1
                    continue

                # Identify which row is STAY-side (Intervention=0).
                if pair[0].get("Intervention", "").strip() == "0":
                    stay_row, swerve_row = pair[0], pair[1]
                else:
                    stay_row, swerve_row = pair[1], pair[0]

                pairs.append((stay_row, swerve_row))

                if scenario_limit is not None and len(pairs) >= scenario_limit:
                    break

    # ── Phase 2: Fingerprint each pair and count STAY / SWERVE per fingerprint ─

    counts = {}  # fingerprint → {"stay": int, "swerve": int}

    fingerprints = []
    for stay_row, swerve_row in pairs:
        fp     = _make_fingerprint(stay_row, swerve_row)
        choice = _get_choice(stay_row)
        fingerprints.append(fp)
        if fp not in counts:
            counts[fp] = {"stay": 0, "swerve": 0}
        counts[fp][choice] += 1

    # ── Phase 3: Write output rows with the five new probability columns ───────

    out_fieldnames = fieldnames + NEW_COLS

    with open(output_path, "w", newline="", encoding="utf-8") as outfile:
        writer = csv.DictWriter(outfile, fieldnames=out_fieldnames)
        writer.writeheader()

        for i, (stay_row, swerve_row) in enumerate(pairs):
            fp       = fingerprints[i]
            n_stay   = counts[fp]["stay"]
            n_swerve = counts[fp]["swerve"]
            n_total  = n_stay + n_swerve
            stay_prob   = round(n_stay   / n_total, 4) if n_total > 0 else 0
            swerve_prob = round(n_swerve / n_total, 4) if n_total > 0 else 0

            for row in (stay_row, swerve_row):
                row["n_stay"]      = n_stay
                row["n_swerve"]    = n_swerve
                row["n_total"]     = n_total
                row["stay_prob"]   = stay_prob
                row["swerve_prob"] = swerve_prob
                writer.writerow(row)

    written_scenarios = len(pairs)
    written_rows      = written_scenarios * 2

    print("Done.")
    print(f"  Rows read from input:            {rows_read:,}")
    print(f"  Scenarios written:               {written_scenarios:,}")
    print(f"  Rows written:                    {written_rows:,}")
    print(f"  Skipped — missing required cols: {skipped_missing:,}")
    print(f"  Unique scenario fingerprints:    {len(counts):,}")
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()
