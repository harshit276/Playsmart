"""
One-shot account wipe — drops every user-related document so we can
test the signup → tokens → analyze flow on a clean slate.

Reads MONGO_URL + DB_NAME from backend/.env. Run from backend/ dir:
    python scripts/wipe_accounts.py

Confirms before nuking. Reports per-collection delete counts.
"""
import os
import sys
import asyncio
from pathlib import Path

# Find project root (backend/ folder), load .env
HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
try:
    from dotenv import load_dotenv
    load_dotenv(HERE / ".env")
except ImportError:
    pass

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "").strip()
DB_NAME = os.environ.get("DB_NAME", "athlyticai").strip()

COLLECTIONS = [
    "users", "player_profiles", "video_analyses", "training_progress",
    "token_transactions", "payment_orders", "referrals",
    "friends", "friend_requests", "games", "equipment_enquiries",
    "user_badges", "upload_streaks", "training_progress_personal",
]


async def main():
    if not MONGO_URL:
        print("ERROR: MONGO_URL not set in backend/.env")
        sys.exit(1)

    print(f"\n  Database: {DB_NAME}")
    print(f"  Collections to wipe: {', '.join(COLLECTIONS)}\n")
    confirm = input("  Type 'WIPE' to nuke every account: ").strip()
    if confirm != "WIPE":
        print("  Aborted.")
        return

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    print()
    for c in COLLECTIONS:
        try:
            res = await db[c].delete_many({})
            print(f"  {c:<32} {res.deleted_count} deleted")
        except Exception as e:
            print(f"  {c:<32} ERROR: {e}")
    print("\n  Done. You can now sign up fresh.\n")


if __name__ == "__main__":
    asyncio.run(main())
