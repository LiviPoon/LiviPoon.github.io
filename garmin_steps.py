#!/usr/bin/env python3
"""
Garmin step scraper — pulls lifetime steps from Garmin Connect and
patches the roll-counter in the website's index.md.

Requirements:
    pip install garminconnect beautifulsoup4 python-dotenv

Usage:
    python garmin_steps.py --file livipoon-quartz4/content/index.md
    python garmin_steps.py --file livipoon-quartz4/content/index.md --update-only
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

SESSION_FILE = "garmin_session.json"
STEPS_FILE = "lifetime_steps.json"
CAPTION_MARKER = "butterfly effects generated"
_BS_WRAP_ID = "__garmin_steps_root__"


class GarminStepScraper:
    def __init__(self) -> None:
        from dotenv import load_dotenv
        import os

        load_dotenv()
        self.email: str = os.getenv("GARMIN_EMAIL", "your@email.com")
        self.password: str = os.getenv("GARMIN_PASSWORD", "yourpassword")
        self.client = None

    # ------------------------------------------------------------------
    def login(self) -> None:
        from garminconnect import Garmin

        self.client = Garmin(self.email, self.password)
        session_path = Path(SESSION_FILE)

        if session_path.exists():
            try:
                print("Loading cached Garmin session...")
                self.client.login(session_path.read_text())
                print("Session restored from cache.")
                return
            except Exception as exc:
                print(f"Cached session expired or invalid ({exc}) — re-logging in.")
                session_path.unlink(missing_ok=True)

        print("Logging in to Garmin Connect...")
        self.client.login()

        try:
            session_path.write_text(self.client.garth.dumps())
            print(f"Login successful. Session cached to {SESSION_FILE}.")
        except Exception as exc:
            print(f"Warning: could not cache session ({exc}). Continuing anyway.")

    # ------------------------------------------------------------------
    def fetch_lifetime_steps(self) -> int:
        start = 0
        batch = 100
        activity_steps = 0
        unique_dates: set[str] = set()

        print("\n--- Phase 1: activity history ---")
        while True:
            activities = self.client.get_activities(start, batch)
            if not activities:
                break

            for act in activities:
                activity_steps += act.get("steps") or 0
                raw_time = act.get("startTimeLocal") or act.get("startTimeGMT") or ""
                day = raw_time[:10]
                if day:
                    unique_dates.add(day)

            fetched = start + len(activities)
            print(f"  Fetched {fetched} activities so far... ({activity_steps:,} steps accumulated)")

            if len(activities) < batch:
                break
            start += batch

        total_activities = start + batch
        print(f"\nActivity total: {activity_steps:,} steps across ~{total_activities} activities")
        print(f"Found {len(unique_dates)} unique active dates.")

        # ------------------------------------------------------------------
        print("\n--- Phase 2: daily stats cross-check ---")
        print("(This checks each unique active day via get_stats_and_body — may be slow for large history)")
        daily_steps = 0
        dates_sorted = sorted(unique_dates)
        failed = 0

        for i, day in enumerate(dates_sorted):
            try:
                stats = self.client.get_stats_and_body(day)
                day_total = stats.get("totalSteps") or 0
                daily_steps += day_total
            except Exception as exc:
                failed += 1
                if failed <= 5:
                    print(f"  Warning: could not fetch stats for {day}: {exc}")
                elif failed == 6:
                    print("  (further stat warnings suppressed)")

            if (i + 1) % 50 == 0:
                print(f"  Checked {i + 1}/{len(dates_sorted)} days — running daily total: {daily_steps:,}")

            time.sleep(0.05)

        print(f"\nDaily-stats total:   {daily_steps:,} steps ({failed} days failed)")
        print(f"Activity-log total:  {activity_steps:,} steps")

        # The two methods diverge for several reasons (multi-sport splits, manual entries,
        # watch-only tracking days with no logged activity, etc.). Use the higher figure
        # as the best lifetime estimate.
        lifetime = max(activity_steps, daily_steps)
        print(f"Lifetime estimate:   {lifetime:,} steps  (higher of the two sources)")

        record = {
            "lifetime_steps": lifetime,
            "activity_steps": activity_steps,
            "daily_steps": daily_steps,
            "fetched_at": datetime.now().isoformat(),
        }
        Path(STEPS_FILE).write_text(json.dumps(record, indent=2))
        print(f"Saved to {STEPS_FILE}.")
        return lifetime

    # ------------------------------------------------------------------
    def update_html(self, filepath: str, steps: int) -> None:
        from bs4 import BeautifulSoup

        path = Path(filepath)
        if not path.exists():
            print(f"Error: {filepath} not found.", file=sys.stderr)
            sys.exit(1)

        content = path.read_text(encoding="utf-8")

        # Wrap the content so BeautifulSoup doesn't inject <html>/<body> wrappers
        soup = BeautifulSoup(f'<div id="{_BS_WRAP_ID}">{content}</div>', "html.parser")
        root = soup.find("div", id=_BS_WRAP_ID)

        # Find the caption that identifies our target counter
        target_caption = None
        for p in root.find_all("p", class_="pilcrow-roll-counter-caption"):
            if CAPTION_MARKER in p.get_text():
                target_caption = p
                break

        if target_caption is None:
            print(
                f'Error: could not find <p class="pilcrow-roll-counter-caption"> containing "{CAPTION_MARKER}".',
                file=sys.stderr,
            )
            sys.exit(1)

        # Walk up to the .pilcrow-roll-counter container
        counter_div = target_caption.find_parent("div", class_="pilcrow-roll-counter")
        if counter_div is None:
            print("Error: could not locate parent .pilcrow-roll-counter div.", file=sys.stderr)
            sys.exit(1)

        # Update data-end (drives the JS roll animation)
        counter_div["data-end"] = str(steps)

        # Update the display span (kept at 0; JS rolls it to data-end on page load)
        number_div = counter_div.find("div", class_="pilcrow-roll-counter-number")
        if number_div is None:
            print("Error: could not find .pilcrow-roll-counter-number inside the counter.", file=sys.stderr)
            sys.exit(1)

        span = number_div.find("span", class_="roll-counter-int")
        if span is None:
            print("Error: could not find span.roll-counter-int.", file=sys.stderr)
            sys.exit(1)

        span.string = "0"

        # Unwrap the root div to recover the original document structure
        updated = root.decode_contents()
        path.write_text(updated, encoding="utf-8")
        print(f"Updated {filepath}  (data-end → {steps:,})")

    # ------------------------------------------------------------------
    def run(self, filepath: str) -> None:
        self.login()
        steps = self.fetch_lifetime_steps()
        self.update_html(filepath, steps)
        print(f"\nAll done. Lifetime steps: {steps:,}")


# ----------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync Garmin lifetime steps to the website roll-counter."
    )
    parser.add_argument("--file", required=True, help="Path to index.md to update")
    parser.add_argument(
        "--update-only",
        action="store_true",
        help=f"Skip scraping; read step count from {STEPS_FILE} and update the file only.",
    )
    args = parser.parse_args()

    scraper = GarminStepScraper()

    if args.update_only:
        steps_path = Path(STEPS_FILE)
        if not steps_path.exists():
            print(
                f"Error: {STEPS_FILE} not found. Run without --update-only first to populate it.",
                file=sys.stderr,
            )
            sys.exit(1)
        record = json.loads(steps_path.read_text())
        steps = record["lifetime_steps"]
        fetched_at = record.get("fetched_at", "unknown")
        print(f"Using cached step count: {steps:,}  (fetched {fetched_at})")
        scraper.update_html(args.file, steps)
    else:
        scraper.run(args.file)


if __name__ == "__main__":
    main()
