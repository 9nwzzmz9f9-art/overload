"""Preprocesses the free-exercise-db dataset into a trimmed static JSON
file bundled into the app. Per SPEC.md §6.2 — run manually whenever the
source dataset changes, not part of the app's runtime.

Usage: python3 build_exercise_library.py <path-to-raw-exercises.json>
"""
import json
import sys
from pathlib import Path

EQUIPMENT_MAP = {
    "barbell": ("barbell", 10),
    "e-z curl bar": ("barbell", 10),
    "dumbbell": ("dumbbell", 5),
    "kettlebell": ("dumbbell", 5),
    "machine": ("machine", 5),
    "cable": ("cable", 5),
    "body only": ("bodyweight", 0),
}
DEFAULT_MAPPING = ("machine", 5)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    raw = json.loads(Path(sys.argv[1]).read_text())
    trimmed = []
    for entry in raw:
        if entry.get("category") != "strength":
            continue
        equipment_category, default_increment = EQUIPMENT_MAP.get(
            entry.get("equipment"), DEFAULT_MAPPING
        )
        trimmed.append(
            {
                "name": entry.get("name"),
                "equipment": entry.get("equipment"),
                "mechanic": entry.get("mechanic"),
                "primaryMuscles": entry.get("primaryMuscles", []),
                "equipmentCategory": equipment_category,
                "defaultIncrement": default_increment,
            }
        )

    out_path = Path(__file__).parent.parent / "js" / "data" / "exercise-library.json"
    out_path.write_text(json.dumps(trimmed, indent=None, separators=(",", ":")))
    print(f"wrote {len(trimmed)} entries to {out_path}")


if __name__ == "__main__":
    main()
