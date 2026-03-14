from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import random
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'playsmart_default_secret')
JWT_ALGORITHM = "HS256"

app = FastAPI(title="PlaySmart API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── Pydantic Models ───

class SendOTPRequest(BaseModel):
    phone: str

class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str

class PlayerProfileCreate(BaseModel):
    skill_level: str
    play_style: str
    playing_frequency: str
    budget_range: str
    injury_history: str = "none"
    primary_goal: str

class ProgressUpdate(BaseModel):
    plan_id: str
    day: int

# ─── Auth Helpers ───

def create_token(user_id: str, phone: str) -> str:
    payload = {
        "user_id": user_id,
        "phone": phone,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ─── Auth Routes ───

@api_router.post("/auth/send-otp")
async def send_otp(req: SendOTPRequest):
    phone = req.phone.strip()
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    otp = str(random.randint(100000, 999999))
    await db.otp_codes.delete_many({"phone": phone})
    await db.otp_codes.insert_one({
        "phone": phone,
        "otp": otp,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(f"OTP for {phone}: {otp}")
    # In production, send via SMS (Twilio). For MVP, return in response.
    return {"message": "OTP sent successfully", "otp_hint": otp}


@api_router.post("/auth/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    phone = req.phone.strip()
    otp_record = await db.otp_codes.find_one({"phone": phone, "otp": req.otp}, {"_id": 0})
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    expires = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="OTP expired")

    await db.otp_codes.delete_many({"phone": phone})

    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "phone": phone,
            "name": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
        user.pop("_id", None)

    token = create_token(user["id"], phone)
    profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})

    return {
        "token": token,
        "user": {"id": user["id"], "phone": user["phone"], "name": user.get("name", "")},
        "has_profile": profile is not None,
    }


@api_router.get("/auth/me")
async def get_me(authorization: str = Header(None)):
    user = await get_current_user(authorization)
    profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"user": user, "profile": profile}


# ─── Profile Routes ───

@api_router.post("/profile")
async def create_or_update_profile(data: PlayerProfileCreate, authorization: str = Header(None)):
    user = await get_current_user(authorization)

    strengths = []
    focus_areas = []

    if data.play_style == "Power":
        strengths.append("Strong smashes")
        focus_areas.extend(["Net play finesse", "Defensive positioning"])
    elif data.play_style == "Control":
        strengths.append("Precise shot placement")
        focus_areas.extend(["Smash power", "Speed development"])
    elif data.play_style == "Speed":
        strengths.append("Quick court coverage")
        focus_areas.extend(["Power shots", "Stamina building"])
    elif data.play_style == "Defense":
        strengths.append("Solid defensive returns")
        focus_areas.extend(["Attack initiation", "Net play"])
    else:
        strengths.append("Versatile play style")
        focus_areas.extend(["Specialization", "Shot consistency"])

    if data.skill_level in ["Beginner", "Beginner+"]:
        focus_areas.append("Footwork fundamentals")
    else:
        strengths.append("Good footwork")

    if data.playing_frequency in ["5-7 days/week", "3-4 days/week"]:
        strengths.append("High dedication")
    else:
        focus_areas.append("Increase training frequency")

    profile = {
        "user_id": user["id"],
        **data.model_dump(),
        "strengths": strengths,
        "focus_areas": focus_areas,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.player_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": profile},
        upsert=True,
    )
    profile.pop("_id", None)
    return {"profile": profile}


@api_router.get("/profile/{user_id}")
async def get_profile(user_id: str):
    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": profile}


# ─── Equipment Routes ───

@api_router.get("/equipment")
async def list_equipment(category: Optional[str] = None, brand: Optional[str] = None):
    query = {}
    if category:
        query["category"] = category
    if brand:
        query["brand"] = brand
    items = await db.equipment.find(query, {"_id": 0}).to_list(200)
    return {"equipment": items, "total": len(items)}


@api_router.get("/equipment/{equipment_id}")
async def get_equipment(equipment_id: str):
    item = await db.equipment.find_one({"id": equipment_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    prices = await db.equipment_prices.find({"product_id": equipment_id}, {"_id": 0}).to_list(20)
    return {"equipment": item, "prices": prices}


# ─── Recommendation Routes ───

@api_router.get("/recommendations/equipment/{user_id}")
async def get_equipment_recommendations(user_id: str, category: str = "racket"):
    from rule_engine import get_top_recommendations, get_top_shoe_recommendations
    from ai_explainer import generate_explanation

    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Complete assessment first.")

    if category == "shoes":
        shoes = await db.equipment.find({"category": "shoes"}, {"_id": 0}).to_list(100)
        top_recs = get_top_shoe_recommendations(profile, shoes, top_n=3)
    else:
        rackets = await db.equipment.find({"category": "racket"}, {"_id": 0}).to_list(100)
        top_recs = get_top_recommendations(profile, rackets, top_n=3)

    results = []
    for rec in top_recs:
        eq = rec["equipment"]
        sc = rec["score"]
        explanation = await generate_explanation(profile, eq, sc)
        prices = await db.equipment_prices.find({"product_id": eq["id"]}, {"_id": 0}).to_list(10)
        results.append({"equipment": eq, "score": sc, "explanation": explanation, "prices": prices})

    return {"recommendations": results, "profile_summary": {
        "skill_level": profile.get("skill_level"),
        "play_style": profile.get("play_style"),
        "budget_range": profile.get("budget_range"),
        "primary_goal": profile.get("primary_goal"),
    }}


@api_router.get("/recommendations/gear/{user_id}")
async def get_gear_recommendations(user_id: str):
    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    skill = profile.get("skill_level", "Beginner")
    budget = profile.get("budget_range", "Medium")
    gear_categories = ["shuttlecock", "string", "grip", "bag"]

    results = {}
    for cat in gear_categories:
        items = await db.equipment.find({"category": cat}, {"_id": 0}).to_list(50)
        # Filter by skill level match and sort by budget fit
        matched = []
        for item in items:
            rec_levels = item.get("recommended_skill_level", [])
            if isinstance(rec_levels, str):
                rec_levels = [rec_levels]
            if skill in rec_levels or not rec_levels:
                prices = await db.equipment_prices.find({"product_id": item["id"]}, {"_id": 0}).to_list(10)
                matched.append({"equipment": item, "prices": prices, "reason": _gear_reason(item, skill, budget)})
        results[cat] = matched[:2]

    return {"gear": results, "profile_level": skill}


def _gear_reason(item, skill, budget):
    cat = item.get("category", "")
    brand = item.get("brand", "")
    model = item.get("model", "")
    reasons = {
        "shuttlecock": f"The {brand} {model} is ideal for {skill} players. {'Nylon shuttles are durable and cost-effective for practice.' if item.get('type') == 'Nylon' else 'Feather shuttles provide authentic flight for competitive play.'}",
        "string": f"The {brand} {model} offers {'excellent durability for regular play' if item.get('durability', 5) >= 8 else 'great repulsion for powerful shots'}. Perfect for {skill} players.",
        "grip": f"The {brand} {model} provides {'excellent tackiness' if item.get('tackiness', 5) >= 8 else 'great sweat absorption'}. Essential for maintaining racket control.",
        "bag": f"The {brand} {model} with {item.get('capacity', 'multiple')} capacity is well-suited for a {skill} player's gear needs.",
    }
    return reasons.get(cat, f"Great choice for {skill} level players.")


@api_router.get("/recommendations/training/{user_id}")
async def get_training_recommendation(user_id: str):
    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    skill = profile.get("skill_level", "Beginner")
    plan = await db.training_plans.find_one({"level": skill}, {"_id": 0})
    if not plan:
        plan = await db.training_plans.find_one({"level": "Beginner"}, {"_id": 0})

    return {"plan": plan, "profile_level": skill}


# ─── Drill Routes ───

@api_router.get("/drills")
async def list_drills(skill_focus: Optional[str] = None, difficulty: Optional[str] = None):
    query = {}
    if skill_focus:
        query["skill_focus"] = skill_focus
    if difficulty:
        query["difficulty"] = difficulty
    drills = await db.drills.find(query, {"_id": 0}).to_list(100)
    return {"drills": drills, "total": len(drills)}


@api_router.get("/drills/{drill_id}")
async def get_drill(drill_id: str):
    drill = await db.drills.find_one({"id": drill_id}, {"_id": 0})
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    videos = await db.drill_videos.find({"drill_id": drill_id}, {"_id": 0}).to_list(10)
    return {"drill": drill, "videos": videos}


# ─── Training Plan Routes ───

@api_router.get("/training-plans/{level}")
async def get_training_plan(level: str):
    plan = await db.training_plans.find_one({"level": level}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Training plan not found")

    drill_ids = set()
    for week in plan.get("weeks", []):
        for day in week.get("days", []):
            drill_ids.update(day.get("drills", []))

    drills_list = await db.drills.find({"id": {"$in": list(drill_ids)}}, {"_id": 0}).to_list(100)
    drills_map = {d["id"]: d for d in drills_list}

    video_list = await db.drill_videos.find({"drill_id": {"$in": list(drill_ids)}}, {"_id": 0}).to_list(200)
    videos_map = {}
    for v in video_list:
        videos_map.setdefault(v["drill_id"], []).append(v)

    return {"plan": plan, "drills": drills_map, "videos": videos_map}


# ─── Progress Routes ───

@api_router.get("/progress/{user_id}")
async def get_progress(user_id: str):
    entries = await db.training_progress.find({"user_id": user_id}, {"_id": 0}).to_list(100)

    completed_days = len(entries)
    total_days = 30

    streak = 0
    if entries:
        sorted_entries = sorted(entries, key=lambda x: x["day"], reverse=True)
        expected_day = sorted_entries[0]["day"]
        for e in sorted_entries:
            if e["day"] == expected_day:
                streak += 1
                expected_day -= 1
            else:
                break

    return {
        "completed_days": completed_days,
        "total_days": total_days,
        "progress_percentage": round((completed_days / total_days) * 100, 1),
        "current_streak": streak,
        "entries": entries,
    }


@api_router.post("/progress")
async def update_progress(data: ProgressUpdate, authorization: str = Header(None)):
    user = await get_current_user(authorization)

    existing = await db.training_progress.find_one(
        {"user_id": user["id"], "plan_id": data.plan_id, "day": data.day},
        {"_id": 0},
    )
    if existing:
        await db.training_progress.delete_one(
            {"user_id": user["id"], "plan_id": data.plan_id, "day": data.day}
        )
        return {"message": "Day unmarked", "completed": False}

    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "plan_id": data.plan_id,
        "day": data.day,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.training_progress.insert_one(entry)
    entry.pop("_id", None)
    return {"message": "Day completed!", "completed": True, "entry": entry}


# ─── Player Card Route ───

@api_router.get("/player-card/{user_id}")
async def get_player_card(user_id: str):
    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    from rule_engine import get_top_recommendations
    rackets = await db.equipment.find({"category": "racket"}, {"_id": 0}).to_list(100)
    top_recs = get_top_recommendations(profile, rackets, top_n=1)

    recommended_racket = None
    if top_recs:
        eq = top_recs[0]["equipment"]
        recommended_racket = f"{eq['brand']} {eq['model']}"

    progress = await db.training_progress.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    completed_days = len(progress)

    return {
        "card": {
            "skill_level": profile.get("skill_level"),
            "play_style": profile.get("play_style"),
            "primary_goal": profile.get("primary_goal"),
            "strengths": profile.get("strengths", []),
            "focus_areas": profile.get("focus_areas", []),
            "recommended_racket": recommended_racket,
            "training_days_completed": completed_days,
            "playing_frequency": profile.get("playing_frequency"),
        }
    }


# ─── Root / Health ───

@api_router.get("/")
async def root():
    return {"message": "PlaySmart API", "version": "1.0.0"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    from seed_data import seed_database
    await seed_database(db)
    logger.info("PlaySmart API started successfully")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
