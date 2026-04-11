from fastapi import FastAPI, APIRouter, HTTPException, Header, Query, Request
from fastapi.responses import Response as FastAPIResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import sys
import logging
import uuid
import random
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import shutil
import asyncio
import time as _time
import time
import hashlib
import httpx

# ─── Cloudinary credentials ───
# TODO: move these to env vars in Vercel / Railway dashboards.
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "dz6anvjej").strip()
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "547874763431433").strip()
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "mK2zxGmmzsipNsb1XreEtu4Q0Kk").strip()

# ─── Simple in-memory cache for equipment data ───
_equipment_cache: dict = {}
_EQUIPMENT_CACHE_TTL = 300  # 5 minutes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ─── Environment / Production Mode ───
ENVIRONMENT = os.environ.get("ENVIRONMENT", os.environ.get("ENV", "development"))
IS_PRODUCTION = ENVIRONMENT.lower() in ("production", "prod")
IS_SERVERLESS = os.environ.get("VERCEL") == "1" or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") is not None

# ─── AI Engine: add to sys.path so we can import directly ───
AI_ENGINE_DIR = Path(os.environ.get("AI_ENGINE_DIR", str(ROOT_DIR.parent.parent / "app")))
if AI_ENGINE_DIR.exists():
    sys.path.insert(0, str(AI_ENGINE_DIR))
    logging.getLogger(__name__).info(f"AI engine loaded from: {AI_ENGINE_DIR}")
else:
    logging.getLogger(__name__).warning(f"AI engine dir not found: {AI_ENGINE_DIR}")

import certifi

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=10000,
    maxPoolSize=5 if IS_SERVERLESS else 50,
)
db = client[os.environ.get('DB_NAME', 'athlyticai').strip()]

JWT_SECRET = os.environ.get('JWT_SECRET', 'playsmart_default_secret')
JWT_ALGORITHM = "HS256"
if IS_PRODUCTION and JWT_SECRET == 'playsmart_default_secret':
    raise RuntimeError("JWT_SECRET must be set to a secure value in production (do not use the default)")

app = FastAPI(
    title="AthlyticAI API",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
)

# ─── CORS Middleware (must be added early, before routes) ───
_cors_origins_raw = os.environ.get('CORS_ORIGINS', '')
if _cors_origins_raw:
    _cors_origins = [o.strip() for o in _cors_origins_raw.split(',') if o.strip()]
else:
    # Always allow all origins — frontend and API are on the same domain
    _cors_origins = ["*"]
# On Vercel, always allow the deployment's own origin
if IS_SERVERLESS:
    _vercel_url = os.environ.get("VERCEL_URL")
    if _vercel_url and f"https://{_vercel_url}" not in _cors_origins:
        _cors_origins.append(f"https://{_vercel_url}")
    if "*" not in _cors_origins:
        _cors_origins.append("https://athlyticai.com")
        _cors_origins.append("https://athlyticai.vercel.app")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.WARNING if IS_PRODUCTION else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

# ─── Pydantic Models ───

class SendOTPRequest(BaseModel):
    phone: str

class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str

class SportProfile(BaseModel):
    skill_level: str
    play_style: str

class PlayerProfileCreate(BaseModel):
    selected_sports: List[str] = ["badminton"]
    sports_profiles: Optional[dict] = None  # {sport_key: {skill_level, play_style}}
    playing_frequency: str = "1-2 days/week"
    budget_range: str = "Medium"
    injury_history: str = "none"
    primary_goal: str = "Improve technique"
    goals: Optional[List[str]] = None  # User's selected goals from quiz
    quiz_answers: Optional[dict] = None  # Quiz responses for personalization
    play_style_personality: Optional[str] = None  # Derived personality type
    # Legacy single-sport fields (backward compat)
    skill_level: Optional[str] = None
    play_style: Optional[str] = None

class ProgressUpdate(BaseModel):
    plan_id: str
    day: int

# ─── Guest Default Data ───

def _guest_default_profile():
    """Return a default profile for guest/unauthenticated users."""
    return {
        "user_id": "guest",
        "selected_sports": ["badminton"],
        "sports_profiles": {"badminton": {"skill_level": "Beginner", "play_style": "All-Round"}},
        "active_sport": "badminton",
        "skill_level": "Beginner",
        "play_style": "All-Round",
        "playing_frequency": "1-2 days/week",
        "budget_range": "Medium",
        "injury_history": "none",
        "primary_goal": "Improve technique",
        "goals": ["Improve technique", "Have fun"],
        "strengths": ["Versatile play style"],
        "focus_areas": ["Footwork fundamentals", "Shot consistency"],
    }


async def get_current_user_or_none(authorization: str = Header(None)):
    """Like get_current_user but returns None instead of raising for guests."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        try:
            user = await asyncio.wait_for(db.users.find_one({"id": payload["user_id"]}, {"_id": 0}), timeout=5.0)
        except (Exception, asyncio.TimeoutError):
            user = None
        if not user:
            user = {"id": payload["user_id"], "email": payload.get("phone", ""), "name": "", "photo": ""}
        return user
    except Exception:
        return None


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
        try:
            user = await asyncio.wait_for(db.users.find_one({"id": payload["user_id"]}, {"_id": 0}), timeout=5.0)
        except (Exception, asyncio.TimeoutError):
            user = None
        if not user:
            # User may not be in DB yet (background save pending) - construct from token
            user = {"id": payload["user_id"], "email": payload.get("phone", ""), "name": "", "photo": ""}
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ─── Auth Routes ───

# Firebase auth endpoint
class FirebaseAuthRequest(BaseModel):
    firebase_token: str
    name: str = ""
    email: str = ""
    photo: str = ""

@api_router.post("/auth/firebase")
async def firebase_auth(req: FirebaseAuthRequest):
    """Authenticate via Firebase (Google Login). Creates user if new."""
    email = req.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Generate user ID deterministically from email (no DB needed)
    user_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"athlyticai:{email}"))
    token = create_token(user_id, email)

    # Save/update user in background (don't wait for it)
    asyncio.create_task(_save_user_background(user_id, email, req.name, req.photo))

    # Quick profile check (1s timeout — if DB is slow, assume no profile)
    has_profile = False
    try:
        profile = await asyncio.wait_for(
            db.player_profiles.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1}),
            timeout=1.0
        )
        has_profile = profile is not None
    except Exception:
        pass  # DB slow — frontend will check via /auth/me later

    return {
        "token": token,
        "user": {"id": user_id, "email": email, "name": req.name, "photo": req.photo},
        "has_profile": has_profile,
    }


async def _save_user_background(user_id, email, name, photo):
    """Save or update user document in background - does not block login response."""
    try:
        await asyncio.wait_for(db.users.update_one(
            {"email": email},
            {"$setOnInsert": {"id": user_id, "email": email, "created_at": datetime.now(timezone.utc).isoformat()},
             "$set": {"name": name, "photo": photo}},
            upsert=True,
        ), timeout=5.0)
    except Exception:
        pass


# In-memory OTP store (works on serverless without MongoDB writes)
_otp_store = {}  # {phone: {"otp": "123456", "expires_at": datetime}}

@api_router.post("/auth/send-otp")
async def send_otp(req: SendOTPRequest):
    import re
    phone = req.phone.strip()
    if not re.match(r'^\+\d{7,15}$', phone):
        raise HTTPException(status_code=400, detail="Invalid phone number. Use format: +919876543210")

    otp = str(random.randint(100000, 999999))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    # Store in memory (fast, no DB needed)
    _otp_store[phone] = {"otp": otp, "expires_at": expires_at}

    # Clean up expired entries
    now = datetime.now(timezone.utc)
    expired = [k for k, v in _otp_store.items() if v["expires_at"] < now]
    for k in expired:
        del _otp_store[k]

    logger.info(f"OTP for {phone}: {otp}")
    return {"message": "OTP sent to your mobile number", "otp_hint": otp, "expires_in": 300}


@api_router.post("/auth/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    phone = req.phone.strip()

    # Check in-memory store
    record = _otp_store.get(phone)
    if not record or record["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    if datetime.now(timezone.utc) > record["expires_at"]:
        _otp_store.pop(phone, None)
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    _otp_store.pop(phone, None)

    # Find or create user in MongoDB (with timeout handling)
    try:
        user = await db.users.find_one({"phone": phone}, {"_id": 0})
    except Exception:
        user = None

    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "phone": phone,
            "name": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await db.users.insert_one(user)
            user.pop("_id", None)
        except Exception:
            user.pop("_id", None)  # Continue even if DB write fails

    token = create_token(user["id"], phone)
    try:
        profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    except Exception:
        profile = None

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

    # Build sports profiles
    selected_sports = data.selected_sports or ["badminton"]
    sports_profiles = data.sports_profiles or {}

    # Backward compat: if old-style single-sport fields provided, wrap them
    if not sports_profiles and data.skill_level and data.play_style:
        sports_profiles = {
            selected_sports[0]: {"skill_level": data.skill_level, "play_style": data.play_style}
        }

    # Set active sport to first selected
    active_sport = selected_sports[0]
    active_profile = sports_profiles.get(active_sport, {})
    active_skill = active_profile.get("skill_level", data.skill_level or "Beginner")
    active_style = active_profile.get("play_style", data.play_style or "All-round")

    # Generate strengths/focus for the active sport
    strengths = []
    focus_areas = []

    style_strengths = {
        "Power": ("Strong smashes", ["Net play finesse", "Defensive positioning"]),
        "Offensive": ("Powerful loops", ["Defense consistency", "Placement"]),
        "Baseliner": ("Strong groundstrokes", ["Net play", "Serve variety"]),
        "Control": ("Precise shot placement", ["Smash power", "Speed development"]),
        "Speed": ("Quick court coverage", ["Power shots", "Stamina building"]),
        "Defense": ("Solid defensive returns", ["Attack initiation", "Net play"]),
        "Defensive": ("Solid defensive returns", ["Attack initiation", "Spin variation"]),
        "Counter-Puncher": ("Great returning ability", ["Net approaches", "Power serving"]),
        "Soft Game": ("Excellent dink control", ["Power drives", "Serve placement"]),
        "Serve & Volley": ("Strong net presence", ["Baseline rallies", "Return of serve"]),
    }

    s_data = style_strengths.get(active_style, ("Versatile play style", ["Specialization", "Shot consistency"]))
    strengths.append(s_data[0])
    focus_areas.extend(s_data[1])

    if active_skill in ["Beginner", "Beginner+"]:
        focus_areas.append("Footwork fundamentals")
    else:
        strengths.append("Good footwork")

    if data.playing_frequency in ["5-7 days/week", "3-4 days/week"]:
        strengths.append("High dedication")
    else:
        focus_areas.append("Increase training frequency")

    # Use goals to enhance focus areas
    if data.goals:
        goal_to_focus = {
            "Improve technique": "Shot technique refinement",
            "Win more matches": "Match strategy and tactics",
            "Get fitter": "Physical conditioning",
            "Learn new shots": "Shot variety expansion",
            "Play competitively": "Tournament preparation",
            "Have fun": "Enjoy the game",
        }
        for goal in data.goals[:3]:
            mapped = goal_to_focus.get(goal)
            if mapped and mapped not in focus_areas:
                focus_areas.append(mapped)

    # Use quiz personality to refine strengths
    if data.play_style_personality:
        personality_strengths = {
            "Aggressive Attacker": "Strong attacking instinct",
            "Strategic Player": "Excellent game reading",
            "Defensive Wall": "Solid defensive foundation",
            "All-Rounder": "Versatile playing ability",
            "Creative Player": "Unpredictable shot selection",
        }
        ps = personality_strengths.get(data.play_style_personality)
        if ps and ps not in strengths:
            strengths.append(ps)

    profile = {
        "user_id": user["id"],
        "selected_sports": selected_sports,
        "sports_profiles": sports_profiles,
        "active_sport": active_sport,
        "skill_level": active_skill,
        "play_style": active_style,
        "playing_frequency": data.playing_frequency,
        "budget_range": data.budget_range,
        "injury_history": data.injury_history,
        "primary_goal": data.primary_goal,
        "goals": data.goals or [],
        "quiz_answers": data.quiz_answers or {},
        "play_style_personality": data.play_style_personality,
        "strengths": strengths,
        "focus_areas": focus_areas,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Build personalization analysis from the full profile
    try:
        from recommendation_engine import build_player_profile_analysis
        personalization = build_player_profile_analysis(profile)
        profile["personalization"] = personalization
    except Exception as e:
        logger.warning(f"Recommendation engine error (non-fatal): {e}")

    try:
        await asyncio.wait_for(
            db.player_profiles.update_one(
                {"user_id": user["id"]},
                {"$set": profile},
                upsert=True,
            ),
            timeout=8.0,
        )
    except (Exception, asyncio.TimeoutError) as e:
        logger.warning(f"Profile save timeout/error (non-fatal): {e}")
        # Return the profile anyway so frontend can proceed
    profile.pop("_id", None)
    return {"profile": profile}


@api_router.get("/profile/{user_id}")
async def get_profile(user_id: str):
    if user_id == "guest":
        return {"profile": _guest_default_profile()}
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
async def get_equipment_recommendations(
    user_id: str,
    category: str = "racket",
    sport: Optional[str] = None,
    budget_min: Optional[int] = None,
    budget_max: Optional[int] = None,
):
    try:
        from rule_engine import get_top_recommendations, get_top_shoe_recommendations
        from explainer import generate_explanation
    except Exception as e:
        logger.error(f"Import error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Import error: {e}")

    from research_loader import get_equipment_by_budget, get_all_equipment_categories

    if user_id == "guest":
        profile = _guest_default_profile()
        if sport:
            profile["active_sport"] = sport
    else:
        try:
            profile = await asyncio.wait_for(db.player_profiles.find_one({"user_id": user_id}, {"_id": 0}), timeout=5.0)
        except (Exception, asyncio.TimeoutError):
            profile = _guest_default_profile()
        if not profile:
            profile = _guest_default_profile()

    try:
        # Use explicit sport param first, then latest analysis sport, then profile active_sport
        if sport:
            active_sport = sport
        else:
            try:
                latest_analysis_for_sport = await asyncio.wait_for(db.video_analyses.find_one(
                    {"user_id": user_id}, {"_id": 0, "sport": 1}, sort=[("date", -1)]
                ), timeout=5.0)
            except (Exception, asyncio.TimeoutError):
                latest_analysis_for_sport = None
            active_sport = (latest_analysis_for_sport or {}).get("sport") or profile.get("active_sport", "badminton")

        # Sport-specific category mapping
        sport_categories = {
            "badminton": {"primary": "racket", "shoes": "shoes"},
            "table_tennis": {"primary": "tt_blade", "shoes": "tt_rubber"},
            "tennis": {"primary": "tennis_racket", "shoes": "tennis_shoes"},
            "pickleball": {"primary": "pb_paddle", "shoes": "pb_shoes"},
            "cricket": {"primary": "cricket_bat", "shoes": "cricket_shoes"},
            "football": {"primary": "football_boots", "shoes": "football_boots"},
            "swimming": {"primary": "goggles", "shoes": "swimsuit"},
        }
        cat_map = sport_categories.get(active_sport, sport_categories["badminton"])

        # Helper to fetch DB equipment with caching
        async def _get_db_items(db_cat):
            db_cache_key = f"db_{db_cat}"
            cached_db = _equipment_cache.get(db_cache_key)
            if cached_db and (_time.time() - cached_db["ts"]) < _EQUIPMENT_CACHE_TTL:
                return cached_db["data"]
            try:
                fetched = await asyncio.wait_for(db.equipment.find({"category": db_cat}, {"_id": 0}).to_list(100), timeout=5.0)
            except (Exception, asyncio.TimeoutError):
                fetched = []
            _equipment_cache[db_cache_key] = {"data": fetched, "ts": _time.time()}
            return fetched

        if category == "shoes":
            db_category = cat_map.get("shoes", "shoes")
            items = await _get_db_items(db_category)
            if active_sport == "badminton" and items:
                top_recs = get_top_shoe_recommendations(profile, items, top_n=3)
            elif items:
                top_recs = _generic_score_equipment(profile, items, top_n=3)
            else:
                top_recs = []
        else:
            db_category = cat_map.get("primary", "racket")
            items = await _get_db_items(db_category)
            if active_sport == "badminton" and items:
                top_recs = get_top_recommendations(profile, items, top_n=3)
            elif items:
                top_recs = _generic_score_equipment(profile, items, top_n=3)
            else:
                top_recs = []

        # ─── Merge research equipment data ───
        budget_range = profile.get("budget_range", "Medium")
        budget_limits = {"Low": (0, 3000), "Medium": (3000, 8000), "High": (8000, 15000), "Premium": (15000, 50000)}
        # Use explicit query params if provided, otherwise fall back to profile
        if budget_min is not None and budget_max is not None:
            bmin, bmax = budget_min, budget_max
            # Determine budget_range label from query params for response
            for label, (lo, hi) in budget_limits.items():
                if lo == bmin and hi == bmax:
                    budget_range = label
                    break
            else:
                budget_range = f"{bmin}-{bmax}"
        elif "-" in str(budget_range) and any(c.isdigit() for c in str(budget_range)):
            # Support numeric budget ranges like "5000-10000" from profiles
            parts = str(budget_range).split("-")
            try:
                bmin, bmax = int(parts[0].strip()), int(parts[1].strip())
            except (ValueError, IndexError):
                bmin, bmax = budget_limits.get(budget_range, (3000, 8000))
        else:
            bmin, bmax = budget_limits.get(budget_range, (3000, 8000))
        skill_level = profile.get("skill_level", "Beginner")

        # Map DB category to research category name
        research_cat_map = {
            "racket": "rackets", "shoes": "shoes", "shuttlecock": "shuttlecocks",
            "string": "strings", "grip": "grips",
            "tt_blade": "blades", "tt_rubber": "rubbers", "tt_ball": "balls",
            "tennis_racket": "tennis_rackets", "tennis_shoes": "tennis_shoes",
            "tennis_string": "tennis_strings", "tennis_ball": "tennis_balls",
            "pb_paddle": "paddles", "pb_shoes": "shoes", "pb_ball": "balls",
            "cricket_bat": "bats", "cricket_shoes": "shoes", "cricket_ball": "balls",
            "cricket_pads": "pads", "cricket_gloves": "gloves", "cricket_helmet": "helmets",
            "football_boots": "boots", "football": "footballs",
            "football_gloves": "goalkeeper_gloves", "football_shinguards": "shin_guards",
            "goggles": "goggles", "swimsuit": "swimsuits", "swim_cap": "swim_caps",
            "fins": "fins", "pull_buoy": "pull_buoys",
        }
        research_category = research_cat_map.get(db_category, db_category)
        # Don't filter research equipment by level — show all budget-appropriate items
        # (an advanced player can still use beginner-friendly equipment)
        # Use in-memory cache for research equipment (static data)
        cache_key = f"{active_sport}_{research_category}_{bmin}_{bmax}"
        cached = _equipment_cache.get(cache_key)
        if cached and (_time.time() - cached["ts"]) < _EQUIPMENT_CACHE_TTL:
            research_items = cached["data"]
        else:
            research_items = get_equipment_by_budget(
                active_sport, research_category, bmin, bmax, level=None
            )
            _equipment_cache[cache_key] = {"data": research_items, "ts": _time.time()}
        # Also fetch ALL research items (no budget filter) for "also_explore" section
        all_cache_key = f"{active_sport}_{research_category}_all"
        cached_all = _equipment_cache.get(all_cache_key)
        if cached_all and (_time.time() - cached_all["ts"]) < _EQUIPMENT_CACHE_TTL:
            all_research_items = cached_all["data"]
        else:
            all_research_items = get_equipment_by_budget(
                active_sport, research_category, 0, 999999, level=None
            )
            _equipment_cache[all_cache_key] = {"data": all_research_items, "ts": _time.time()}

        # Get latest analysis weaknesses for personalized "why_this_fits"
        try:
            latest_analysis = await asyncio.wait_for(db.video_analyses.find_one(
                {"user_id": user_id}, {"_id": 0, "shot_analysis": 1, "coach_feedback": 1},
                sort=[("date", -1)]
            ), timeout=5.0)
        except (Exception, asyncio.TimeoutError):
            latest_analysis = None
        detected_weaknesses = []
        if latest_analysis:
            sa = latest_analysis.get("shot_analysis") or {}
            for w in (sa.get("weaknesses") or []):
                if isinstance(w, dict):
                    detected_weaknesses.append(w.get("issue", w.get("area", "")))

        results = []
        for rec in top_recs:
            eq = rec["equipment"]
            sc = rec["score"]
            # Ensure 'name' field exists (DB items use 'model')
            if not eq.get("name") and eq.get("model"):
                eq["name"] = f"{eq.get('brand', '')} {eq['model']}".strip()
            explanation = await generate_explanation(profile, eq, sc)
            prices = await db.equipment_prices.find({"product_id": eq["id"]}, {"_id": 0}).to_list(10)

            why_this_fits = _build_why_this_fits(eq, profile, detected_weaknesses)

            results.append({
                "equipment": eq,
                "score": sc,
                "explanation": explanation,
                "prices": prices,
                "why_this_fits": why_this_fits,
                "buy_links": {p.get("marketplace", "store"): p.get("listing_url", "") for p in prices if p.get("listing_url")},
            })

        # Helper to build a research item result dict
        def _build_research_result(r_item, score_bmin, score_bmax):
            buy_links_raw = r_item.get("buy_links", {})
            if isinstance(buy_links_raw, dict) and "amazon" in buy_links_raw:
                buy_links = buy_links_raw
            else:
                buy_links = buy_links_raw.get("india", buy_links_raw)
            r_score = _score_research_item(r_item, profile, score_bmin, score_bmax)
            why = _build_why_this_fits_research(r_item, profile, detected_weaknesses)
            eq_data = {**r_item, "buy_links": buy_links}
            if r_item.get("image") and not r_item.get("image_url"):
                eq_data["image_url"] = r_item["image"]
            return {
                "equipment": eq_data,
                "score": r_score,
                "explanation": r_item.get("description", ""),
                "prices": [],
                "why_this_fits": why,
                "buy_links": buy_links,
            }

        # Add in-budget research-sourced equipment
        existing_ids = {r["equipment"].get("id") for r in results}
        for r_item in research_items:
            if r_item["id"] in existing_ids:
                continue
            results.append(_build_research_result(r_item, bmin, bmax))
            existing_ids.add(r_item["id"])

        # Build also_explore from out-of-budget research items
        also_explore_results = []
        in_budget_ids = {r_item["id"] for r_item in research_items}
        for r_item in all_research_items:
            if r_item["id"] in existing_ids:
                continue
            also_explore_results.append(_build_research_result(r_item, bmin, bmax))
            existing_ids.add(r_item["id"])

        # Re-score equipment using the full personalization engine
        try:
            from recommendation_engine import personalize_equipment_scores
            profile_analysis = profile.get("personalization")
            if profile_analysis:
                results = personalize_equipment_scores(results, profile_analysis)
                if also_explore_results:
                    also_explore_results = personalize_equipment_scores(also_explore_results, profile_analysis)
        except Exception as e:
            logger.warning(f"Equipment personalization error (non-fatal): {e}")

        # Filter main results by budget — keep items whose minimum price is within budget
        def _item_in_budget(r):
            eq = r["equipment"]
            price_range = eq.get("price_ranges", {}).get("INR", {})
            price_val = eq.get("price_range_value", 0)
            item_min = price_range.get("min", 0)
            if price_val:
                return price_val <= bmax
            elif item_min:
                return item_min <= bmax
            return True

        filtered_results = [r for r in results if _item_in_budget(r)]
        # Move any out-of-budget DB items to also_explore
        for r in results:
            if not _item_in_budget(r):
                also_explore_results.append(r)

        # Sort by score descending so best matches appear first
        filtered_results.sort(key=lambda r: r["score"].get("total", 0), reverse=True)
        also_explore_results.sort(key=lambda r: r["score"].get("total", 0), reverse=True)

        return {
            "recommendations": filtered_results,
            "also_explore": also_explore_results[:6],
            "profile_summary": {
                "skill_level": skill_level,
                "play_style": profile.get("play_style"),
                "budget_range": budget_range,
                "primary_goal": profile.get("primary_goal"),
                "active_sport": active_sport,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Recommendations failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _generic_score_equipment(profile, items, top_n=3):
    """Generic scoring for non-badminton equipment based on skill and budget match."""
    skill = profile.get("skill_level", "Beginner")
    budget = profile.get("budget_range", "Medium")
    budget_max = {"Low": 3000, "Medium": 8000, "High": 15000, "Premium": 50000}.get(budget, 8000)

    scored = []
    for item in items:
        score = {"skill_match": 0, "play_style_match": 0, "budget_match": 0, "performance_fit": 0, "total": 0}

        # Skill match (40)
        rec_levels = item.get("recommended_skill_level", [])
        if isinstance(rec_levels, str):
            rec_levels = [rec_levels]
        if skill in rec_levels:
            score["skill_match"] = 40
        elif rec_levels:
            score["skill_match"] = 20
        else:
            score["skill_match"] = 25

        # Play style match (30)
        play_style = profile.get("play_style", "All-round")
        rec_styles = item.get("recommended_play_style", [])
        if isinstance(rec_styles, str):
            rec_styles = [rec_styles]
        if play_style in rec_styles:
            score["play_style_match"] = 30
        elif rec_styles:
            score["play_style_match"] = 15
        else:
            score["play_style_match"] = 20

        # Budget match (20)
        price = item.get("price_range_value", 5000)
        if price <= budget_max:
            ratio = 1 - (price / budget_max) if budget_max > 0 else 1
            score["budget_match"] = min(20, int(10 + ratio * 10))
        else:
            over = price / budget_max if budget_max > 0 else 2
            score["budget_match"] = max(0, int(20 - (over - 1) * 20))

        # Performance (10)
        score["performance_fit"] = 7

        score["total"] = score["skill_match"] + score["play_style_match"] + score["budget_match"] + score["performance_fit"]
        scored.append({"equipment": item, "score": score})

    scored.sort(key=lambda x: x["score"]["total"], reverse=True)
    return scored[:top_n]


def _score_research_item(item: dict, profile: dict, bmin: float, bmax: float) -> dict:
    """Score a research equipment item based on level match and budget overlap."""
    score = {"skill_match": 0, "play_style_match": 0, "budget_match": 0, "performance_fit": 0, "total": 0, "source": "research_dataset"}
    skill = profile.get("skill_level", "Beginner")

    # Skill match (40)
    item_level = item.get("level", "").lower()
    rec_levels = item.get("recommended_skill_level", [])
    if isinstance(rec_levels, str):
        rec_levels = [rec_levels]
    rec_levels_lower = [l.lower() for l in rec_levels]
    if skill.lower() in rec_levels_lower or skill.lower() == item_level:
        score["skill_match"] = 40
    elif "all" in rec_levels_lower or not rec_levels:
        score["skill_match"] = 30
    else:
        score["skill_match"] = 15

    # Play style match (30)
    play_style = profile.get("play_style", "All-round")
    rec_styles = item.get("recommended_play_style", [])
    if isinstance(rec_styles, str):
        rec_styles = [rec_styles]
    rec_styles_lower = [s.lower() for s in rec_styles]
    if play_style.lower() in rec_styles_lower:
        score["play_style_match"] = 30
    elif not rec_styles:
        score["play_style_match"] = 20
    else:
        score["play_style_match"] = 12

    # Budget match (20) — based on how well the item's price range fits user budget
    price_range = item.get("price_ranges", {}).get("INR", {})
    item_min = price_range.get("min", 0)
    item_max = price_range.get("max", 0)
    if item_min and item_max and bmax > 0:
        item_mid = (item_min + item_max) / 2
        budget_mid = (bmin + bmax) / 2
        if item_mid <= bmax:
            closeness = 1 - abs(item_mid - budget_mid) / max(bmax, 1)
            score["budget_match"] = max(5, min(20, int(closeness * 20)))
        else:
            score["budget_match"] = 3
    else:
        score["budget_match"] = 10

    # Performance (10)
    score["performance_fit"] = 7

    score["total"] = score["skill_match"] + score["play_style_match"] + score["budget_match"] + score["performance_fit"]
    return score


@api_router.get("/recommendations/gear/{user_id}")
async def get_gear_recommendations(user_id: str, sport: Optional[str] = None):
    if user_id == "guest":
        return {"gear": [], "sport": sport or "badminton"}
    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    skill = profile.get("skill_level", "Beginner")
    budget = profile.get("budget_range", "Medium")

    # Use explicit sport param first, then latest analysis sport, then profile active_sport
    if sport:
        active_sport = sport
    else:
        latest_analysis_for_sport = await db.video_analyses.find_one(
            {"user_id": user_id}, {"_id": 0, "sport": 1}, sort=[("date", -1)]
        )
        active_sport = (latest_analysis_for_sport or {}).get("sport") or profile.get("active_sport", "badminton")

    # Sport-specific gear categories
    sport_gear = {
        "badminton": ["shuttlecock", "string", "grip", "bag"],
        "table_tennis": ["tt_rubber", "tt_ball", "tt_bag"],
        "tennis": ["tennis_string", "tennis_ball", "tennis_bag"],
        "pickleball": ["pb_ball", "pb_bag"],
        "cricket": ["cricket_ball", "cricket_pads", "cricket_gloves", "cricket_helmet"],
        "football": ["football", "football_shinguards"],
        "swimming": ["swim_cap", "fins", "kickboard", "pull_buoy"],
    }
    gear_categories = sport_gear.get(active_sport, sport_gear["badminton"])

    results = {}
    for cat in gear_categories:
        items = await db.equipment.find({"category": cat}, {"_id": 0}).to_list(50)
        matched = []
        for item in items:
            rec_levels = item.get("recommended_skill_level", [])
            if isinstance(rec_levels, str):
                rec_levels = [rec_levels]
            if skill in rec_levels or not rec_levels:
                prices = await db.equipment_prices.find({"product_id": item["id"]}, {"_id": 0}).to_list(10)
                matched.append({"equipment": item, "prices": prices, "reason": _gear_reason(item, skill, budget)})
        results[cat] = matched[:2]

    return {"gear": results, "profile_level": skill, "active_sport": active_sport}


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


def _build_why_this_fits(equipment: dict, profile: dict, weaknesses: list) -> str:
    """Build a personalized 'why this fits you' explanation for DB equipment."""
    brand = equipment.get("brand", "")
    model = equipment.get("model", equipment.get("name", ""))
    skill = profile.get("skill_level", "Beginner")
    play_style = profile.get("play_style", "All-round")

    parts = [f"The {brand} {model} is a great match for your {skill.lower()} level {play_style.lower()} play style."]

    # Indian brand bonus
    indian_brands = {"Yonex", "Li-Ning", "Nivia", "Cosco", "SG", "SS", "MRF", "DSC", "Kookaburra", "Stag", "GKI"}
    if brand in indian_brands:
        parts.append(f"{brand} is trusted by players across India and offers excellent value.")

    # Map weaknesses to equipment benefits
    if weaknesses:
        w_lower = " ".join(weaknesses).lower()
        if "power" in w_lower or "smash" in w_lower:
            if equipment.get("type", "").lower() in ("offensive", "power", "head heavy"):
                parts.append("Its head-heavy balance will help you generate more power as you improve.")
        if "control" in w_lower or "placement" in w_lower:
            if equipment.get("type", "").lower() in ("control", "even", "all-round"):
                parts.append("Its balanced design gives you the control needed to work on shot placement.")
        if "footwork" in w_lower:
            cat = equipment.get("category", "")
            if "shoe" in cat:
                parts.append("Good court shoes are essential for the footwork improvement you need.")

    return " ".join(parts)


def _build_why_this_fits_research(equipment: dict, profile: dict, weaknesses: list) -> str:
    """Build 'why this fits' for research-sourced equipment."""
    name = equipment.get("name", "")
    brand = equipment.get("brand", "")
    skill = profile.get("skill_level", "Beginner")
    level = equipment.get("level", "")
    desc = equipment.get("description", "")

    parts = []
    if level and level.lower() == skill.lower().replace("+", ""):
        parts.append(f"The {name} is specifically designed for {skill.lower()} players like you.")
    else:
        parts.append(f"The {name} by {brand} is a solid choice at your level.")

    indian_brands = {"Yonex", "Li-Ning", "Nivia", "Cosco", "SG", "SS", "MRF", "DSC", "Kookaburra", "Stag", "GKI"}
    if brand in indian_brands:
        parts.append(f"As a popular Indian brand, {brand} offers great quality and easy availability.")

    price_range = equipment.get("price_ranges", {}).get("INR", {})
    if price_range:
        parts.append(f"Priced at INR {price_range.get('min', 0)}-{price_range.get('max', 0)}, it fits well within your budget.")

    return " ".join(parts)


@api_router.get("/recommendations/training/{user_id}")
async def get_training_recommendation(user_id: str, sport: Optional[str] = None, authorization: str = Header(None)):
    from research_loader import get_all_skills, get_all_videos
    if user_id == "guest":
        # Return default training data for guests
        active_sport = sport or "badminton"
        skills = get_all_skills(active_sport)
        videos = get_all_videos(active_sport)
        return {"plan": None, "drills": {}, "videos": videos, "skills": skills, "training_videos": list(videos.values())[:10] if isinstance(videos, dict) else videos[:10] if isinstance(videos, list) else []}
    user = await get_current_user_or_none(authorization)
    if not user:
        active_sport = sport or "badminton"
        skills = get_all_skills(active_sport)
        videos = get_all_videos(active_sport)
        return {"plan": None, "drills": {}, "videos": videos, "skills": skills, "training_videos": list(videos.values())[:10] if isinstance(videos, dict) else videos[:10] if isinstance(videos, list) else []}

    try:
        profile = await asyncio.wait_for(db.player_profiles.find_one({"user_id": user_id}, {"_id": 0}), timeout=5.0)
    except (Exception, asyncio.TimeoutError):
        profile = None
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    skill = profile.get("skill_level", "Beginner")

    # Use explicit sport param first, then latest analysis sport, then profile active_sport
    if sport:
        active_sport = sport
    else:
        try:
            latest_analysis_sport = await asyncio.wait_for(db.video_analyses.find_one(
                {"user_id": user_id}, {"_id": 0, "sport": 1}, sort=[("date", -1)]
            ), timeout=5.0)
        except (Exception, asyncio.TimeoutError):
            latest_analysis_sport = None
        active_sport = (latest_analysis_sport or {}).get("sport") or profile.get("active_sport", "badminton")

    # Get all drills from database (may be empty for non-badminton sports)
    try:
        all_drills = await asyncio.wait_for(db.drills.find({}, {"_id": 0}).to_list(100), timeout=5.0)
    except (Exception, asyncio.TimeoutError):
        all_drills = []

    # Get AI-detected weaknesses if any previous analysis exists
    weaknesses = None
    try:
        latest_analysis = await asyncio.wait_for(db.video_analyses.find_one(
            {"user_id": user_id},
            {"_id": 0, "shot_analysis": 1},
            sort=[("date", -1)]
        ), timeout=5.0)
    except (Exception, asyncio.TimeoutError):
        latest_analysis = None
    if latest_analysis:
        weaknesses = (latest_analysis.get("shot_analysis") or {}).get("weaknesses") or []

    # Try DB-based plan first (works for badminton)
    plan = {}
    drills_map = {}
    videos_map = {}
    try:
        from plan_generator import generate_personalized_plan
        if all_drills:
            plan = generate_personalized_plan(profile, all_drills, weaknesses)
            drill_ids = set()
            for week in plan.get("weeks", []):
                for day in week.get("days", []):
                    drill_ids.update(day.get("drills", []))
            drills_map = {d["id"]: d for d in all_drills if d["id"] in drill_ids}
            video_list = await asyncio.wait_for(db.drill_videos.find(
                {"drill_id": {"$in": list(drill_ids)}}, {"_id": 0}
            ).to_list(300), timeout=5.0)
            for v in video_list:
                videos_map.setdefault(v["drill_id"], []).append(v)
    except Exception as e:
        logger.warning(f"DB plan generation failed: {e}")

    # Fallback: build plan from research data (works for ALL sports)
    if not plan or not plan.get("weeks"):
        skills_data = get_all_skills(active_sport)
        skill_areas = skills_data.get("skill_areas", [])
        level_key = skill.lower().replace("+", "").strip()

        # Filter skills to user's level or below
        level_order = {"beginner": 0, "intermediate": 1, "advanced": 2}
        user_level_num = level_order.get(level_key, 0)
        relevant_skills = [s for s in skill_areas
                           if level_order.get(s.get("level", "beginner"), 0) <= user_level_num]
        if not relevant_skills:
            relevant_skills = skill_areas[:6]

        # Build a 4-week plan from research skills
        weeks = []
        skill_idx = 0
        for week_num in range(1, 5):
            days = []
            for day_num in range(1, 8):
                if day_num in (3, 7):  # rest days
                    days.append({"day": day_num, "type": "rest", "title": "Rest & Recovery", "drills": []})
                else:
                    s = relevant_skills[skill_idx % len(relevant_skills)]
                    skill_drills = s.get("drills", [])[:2]
                    drill_entries = []
                    for dr_name in skill_drills:
                        drill_id = f"research_{s['id']}_{dr_name[:10].replace(' ', '_').lower()}"
                        drills_map[drill_id] = {
                            "id": drill_id,
                            "name": dr_name,
                            "skill_focus": s["name"],
                            "difficulty": s.get("level", "beginner"),
                            "duration_minutes": 15,
                            "description": f"Practice {dr_name} for {s['name']}",
                        }
                        drill_entries.append(drill_id)

                    days.append({
                        "day": day_num,
                        "type": "training",
                        "title": s["name"],
                        "focus": s.get("description", "")[:80],
                        "drills": drill_entries,
                    })
                    skill_idx += 1
            weeks.append({"week": week_num, "days": days})

        plan = {
            "sport": active_sport,
            "level": skill,
            "weeks": weeks,
            "total_weeks": 4,
            "source": "research",
        }

        # Add research videos for each skill
        all_videos = get_all_videos(active_sport, level=level_key)
        for v in all_videos[:10]:
            for sa in v.get("skill_areas", []):
                videos_map.setdefault(sa, []).append(v)

    # Personalize the training plan using the recommendation engine
    try:
        from recommendation_engine import personalize_training_plan
        profile_analysis = profile.get("personalization")
        if profile_analysis:
            plan = personalize_training_plan(plan, profile_analysis)
    except Exception as e:
        logger.warning(f"Training personalization error (non-fatal): {e}")

    return {
        "plan": plan,
        "drills": drills_map,
        "videos": videos_map,
        "profile_level": skill,
        "sport": active_sport,
    }


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
    if user_id == "guest":
        return {"completed_days": 0, "total_days": 30, "progress_percentage": 0, "current_streak": 0, "entries": []}
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

    # Check training badges
    new_badges = await check_and_award_badges(user["id"])

    return {"message": "Day completed!", "completed": True, "entry": entry, "new_badges": new_badges}


# ─── Player Card Route ───

@api_router.get("/player-card/{user_id}")
async def get_player_card(user_id: str):
    if user_id == "guest":
        return {"card": None}
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


# ─── Video Analysis Routes ───

if IS_SERVERLESS:
    ANALYSIS_TEMP_DIR = Path("/tmp/athlyticai_uploads")
else:
    ANALYSIS_TEMP_DIR = Path(os.environ.get("UPLOAD_TEMP_DIR", str(ROOT_DIR / "temp_uploads")))
try:
    ANALYSIS_TEMP_DIR.mkdir(exist_ok=True)
except OSError:
    ANALYSIS_TEMP_DIR = Path("/tmp/athlyticai_uploads")
    ANALYSIS_TEMP_DIR.mkdir(exist_ok=True)


def _run_ai_pipeline(video_path: str, sport: str = "badminton", target_player: str = "auto") -> dict:
    """Run AI analysis pipeline directly (imported, not via HTTP)."""
    from ai_pipeline import analyze_video as ai_analyze
    return ai_analyze(video_path, sport=sport, target_player=target_player)


@api_router.post("/analyze-video")
async def analyze_video_endpoint(
    video: UploadFile = File(...),
    sport: str = Query("badminton"),
    analysis_mode: str = Query("full"),
    target_player: str = Query("auto"),
    authorization: str = Header(None),
):
    """Upload a video, run AI analysis, transform to coach-like feedback, attach research data."""
    if IS_SERVERLESS:
        return {
            "error": "Server-side analysis is not available in serverless mode. Please use on-device analysis."
        }
    from research_loader import (
        get_drills_for_issues, get_videos_for_issues,
        get_skill_by_id, get_videos_for_skill,
    )

    user = await get_current_user(authorization)
    profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})

    # Use active sport from profile if not specified
    if not sport:
        sport = (profile or {}).get("active_sport", "badminton")

    # Check if video analysis is supported for this sport
    from sports_config import get_sport_config
    sport_cfg = get_sport_config(sport)
    if sport_cfg and not sport_cfg.get("video_analysis", False):
        raise HTTPException(
            status_code=400,
            detail=f"Video analysis is not yet available for {sport_cfg['name']}. Coming soon!"
        )

    # Validate analysis_mode
    if analysis_mode not in ("quick", "full"):
        analysis_mode = "full"

    # Validate target_player
    valid_players = {"auto", "top-left", "top-right", "bottom-left", "bottom-right",
                     "left", "right", "top", "bottom"}
    if target_player not in valid_players:
        target_player = "auto"

    # Validate file
    allowed_ext = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    ext = os.path.splitext(video.filename or "")[1].lower()
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail="Invalid file type. Upload MP4, AVI, or MOV.")

    # Save temp file
    file_id = str(uuid.uuid4())
    temp_path = ANALYSIS_TEMP_DIR / f"{file_id}{ext}"

    try:
        with open(temp_path, "wb") as buf:
            shutil.copyfileobj(video.file, buf)

        logger.info(f"Video saved: {temp_path} for user {user['id']} (mode={analysis_mode})")

        # Run AI pipeline directly (blocking call in thread pool to not block event loop)
        import functools
        loop = asyncio.get_event_loop()
        pipeline_result = await loop.run_in_executor(
            None, functools.partial(_run_ai_pipeline, str(temp_path), sport=sport, target_player=target_player)
        )

        if not pipeline_result.get("success"):
            raise HTTPException(status_code=500, detail=f"AI analysis failed: {pipeline_result.get('error', 'Unknown')}")

        # Flatten the pipeline result into the format the frontend expects
        shot_analysis_raw = pipeline_result.get("shot_analysis", {})
        coaching_raw = pipeline_result.get("coaching", {})
        analysis_data = pipeline_result.get("analysis", {})

        detected_skill_level = coaching_raw.get("raw", {}).get("skill_level") or "Intermediate"
        shot_type = shot_analysis_raw.get("shot_type", "")
        shot_name = shot_analysis_raw.get("shot_name", shot_type or "technique")
        grade = shot_analysis_raw.get("assessment", {}).get("grade") if shot_analysis_raw.get("assessment") else None
        score = shot_analysis_raw.get("assessment", {}).get("overall_score") if shot_analysis_raw.get("assessment") else None
        weaknesses_raw = shot_analysis_raw.get("weaknesses") or []

        # Extract highlights data from pipeline result
        highlights_data = pipeline_result.get("highlights")
        segments_data = pipeline_result.get("segments")

        ai_result = {
            "success": True,
            "skill_level": detected_skill_level,
            "analysis_mode": analysis_mode,
            "shot_analysis": {
                "shot_type": shot_type,
                "shot_name": shot_name,
                "confidence": shot_analysis_raw.get("confidence", 0),
                "grade": grade,
                "score": score,
                "weaknesses": weaknesses_raw,
                "improvement_plan": shot_analysis_raw.get("improvement_plan"),
            },
            "pro_comparison": {
                "overall_score": pipeline_result.get("pro_comparison", {}).get("overall_score") if pipeline_result.get("pro_comparison") else None,
                "level": pipeline_result.get("pro_comparison", {}).get("level") if pipeline_result.get("pro_comparison") else None,
                "message": pipeline_result.get("pro_comparison", {}).get("message") if pipeline_result.get("pro_comparison") else None,
                "pro_tips": pipeline_result.get("pro_comparison", {}).get("pro_tips", []) if pipeline_result.get("pro_comparison") else [],
                "player_match": pipeline_result.get("pro_comparison", {}).get("player_match") if pipeline_result.get("pro_comparison") else None,
            },
            "metrics": analysis_data.get("metrics"),
            "coaching": coaching_raw.get("formatted"),
            "comprehensive_coaching": coaching_raw.get("comprehensive"),
            "quick_summary": coaching_raw.get("quick_summary"),
            "frames_analyzed": analysis_data.get("frames_processed", 0),
            "analyzed_player_preview": pipeline_result.get("analyzed_player_preview"),
            "video_info": pipeline_result.get("video_info"),
            "speed_analysis": pipeline_result.get("speed_analysis"),
            "sport": sport,
            "target_player": pipeline_result.get("target_player", "auto"),
            "highlights": {
                "clip_count": highlights_data.get("clip_count", 0) if highlights_data else 0,
                "total_duration": highlights_data.get("total_duration", 0) if highlights_data else 0,
                "reel_available": highlights_data.get("reel_available", False) if highlights_data else False,
                "preview_b64": highlights_data.get("preview_b64") if highlights_data else None,
                "clips": [
                    {
                        "label": c.get("label"),
                        "start_time": c.get("start_time"),
                        "end_time": c.get("end_time"),
                        "duration": c.get("duration"),
                        "thumbnail_b64": c.get("thumbnail_b64"),
                        "filename": c.get("filename"),
                    }
                    for c in (highlights_data.get("clips", []) if highlights_data else [])
                ],
            } if highlights_data else None,
            "segments": {
                "total": segments_data.get("total", 0) if segments_data else 0,
                "active": segments_data.get("active", 0) if segments_data else 0,
                "power_moments": segments_data.get("power_moments", 0) if segments_data else 0,
            } if segments_data else None,
        }

        # ─── Build coach-like feedback using research data ───
        issue_strings = []
        for w in weaknesses_raw:
            if isinstance(w, dict):
                issue_strings.append(w.get("issue", w.get("area", "")))
            elif isinstance(w, str):
                issue_strings.append(w)

        # Limit issues for quick mode
        if analysis_mode == "quick":
            issue_strings = issue_strings[:2]
            weaknesses_for_feedback = weaknesses_raw[:2]
        else:
            weaknesses_for_feedback = weaknesses_raw

        # Get drills and videos from research data
        drill_results = get_drills_for_issues(sport, issue_strings) if issue_strings else []
        recommended_videos = get_videos_for_issues(
            sport, issue_strings,
            level=detected_skill_level.lower().replace("+", ""),
            prefer_hindi=True,
            prefer_shorts=(analysis_mode == "quick"),
            max_results=5 if analysis_mode == "quick" else 10,
        ) if issue_strings else []

        # Build top_issues with coach-like language
        top_issues = []
        for i, w in enumerate(weaknesses_for_feedback):
            issue_text = w.get("issue", w.get("area", "")) if isinstance(w, dict) else str(w)
            severity = w.get("severity", "medium") if isinstance(w, dict) else "medium"

            # Find matching drill from research
            drill_entry = None
            if i < len(drill_results):
                dr = drill_results[i]
                drill_video = None
                if dr.get("videos"):
                    v = dr["videos"][0]
                    drill_video = {"title": v["title"], "url": v["url"], "channel": v["channel"]}
                elif dr.get("fix_video"):
                    fv = dr["fix_video"]
                    drill_video = {"title": fv["title"], "url": fv["url"], "channel": fv["channel"]}

                drill_name = dr.get("drills", ["Practice drill"])[0] if dr.get("drills") else "Practice drill"
                drill_entry = {
                    "name": drill_name if isinstance(drill_name, str) else str(drill_name),
                    "description": f"Focus on {dr.get('skill_name', 'this area')} to address this issue",
                    "duration": "10-15 min",
                    "video": drill_video,
                }

            coach_says = _build_coach_commentary(issue_text, shot_name, severity)
            fix_text = ""
            if i < len(drill_results) and drill_results[i].get("fix"):
                fix_text = drill_results[i]["fix"]
            elif isinstance(w, dict) and w.get("fix"):
                fix_text = w["fix"]
            else:
                fix_text = f"Work on improving your {issue_text.lower()} with targeted practice."

            top_issues.append({
                "issue": issue_text,
                "coach_says": coach_says,
                "fix": fix_text,
                "drill": drill_entry,
                "severity": severity,
            })

        # Build strengths list
        strengths = []
        if grade in ["A", "B"]:
            strengths.append(f"Good {shot_name} technique")
        if score and score > 70:
            strengths.append("Solid overall form")
        existing_strengths = (profile or {}).get("strengths", [])
        strengths.extend(existing_strengths[:3])
        strengths = list(dict.fromkeys(strengths))[:5]

        # Build coach feedback
        summary = _build_coach_summary(shot_name, grade, score, detected_skill_level, analysis_mode)
        encouragement = _build_encouragement(top_issues, shot_name)

        coach_feedback = {
            "summary": summary,
            "top_issues": top_issues,
            "strengths": strengths,
            "encouragement": encouragement,
        }

        # Build improvement plan
        this_week_tasks = []
        for ti in top_issues[:3]:
            drill = ti.get("drill")
            if drill:
                this_week_tasks.append(f"Practice: {drill['name']} ({drill['duration']})")
            else:
                this_week_tasks.append(f"Focus on: {ti['issue']}")

        improvement_plan = {
            "this_week": this_week_tasks,
            "next_upload": "Upload again in 7 days to track your improvement",
            "expected_improvement": f"With daily practice, you should see noticeable improvement in your {shot_name} within 2 weeks",
        }

        # Build recommended drills list
        recommended_drills = []
        for dr in drill_results[:5]:
            recommended_drills.append({
                "skill_area": dr.get("skill_name"),
                "skill_id": dr.get("skill_id"),
                "drills": dr.get("drills", []),
                "matched_issue": dr.get("matched_issue"),
            })

        # ─── Performance Scores (per-dimension scoring) ───
        performance_scores = None
        score_messages = []
        try:
            from scoring_engine import calculate_performance_scores, generate_score_messages
            raw_metrics = ai_result.get("metrics") or {}
            performance_scores = calculate_performance_scores(raw_metrics, sport)
            score_messages = generate_score_messages(performance_scores)
        except Exception as score_err:
            logger.warning(f"Scoring engine error (non-fatal): {score_err}")

        # ─── 7-Day Training Plan ───
        training_plan_7day = None
        try:
            from coach_engine import generate_7day_training_plan
            plan_weaknesses = []
            for w in weaknesses_raw[:3]:
                if isinstance(w, dict):
                    plan_weaknesses.append(w)
            training_plan_7day = generate_7day_training_plan(plan_weaknesses, sport, shot_name)
        except Exception as plan_err:
            logger.warning(f"Training plan error (non-fatal): {plan_err}")

        # ─── Badges ───
        earned_badges = []
        try:
            from coach_engine import calculate_badges
            past_analyses = await db.video_analyses.find(
                {"user_id": user["id"]}, {"_id": 0, "shot_analysis": 1, "sport": 1, "date": 1}
            ).sort("date", 1).to_list(100)
            current_for_badges = {
                "shot_analysis": ai_result.get("shot_analysis"),
                "sport": sport,
                "date": datetime.now(timezone.utc).isoformat(),
            }
            all_for_badges = past_analyses + [current_for_badges]
            earned_badges = calculate_badges(all_for_badges)
        except Exception as badge_err:
            logger.warning(f"Badge calculation error (non-fatal): {badge_err}")

        # ─── Score Comparison with Previous Analysis ───
        score_comparison = None
        try:
            from scoring_engine import compare_scores
            prev_analysis = await db.video_analyses.find_one(
                {"user_id": user["id"], "performance_scores": {"$exists": True}},
                {"_id": 0, "performance_scores": 1},
                sort=[("date", -1)]
            )
            if prev_analysis and prev_analysis.get("performance_scores") and performance_scores:
                score_comparison = compare_scores(performance_scores, prev_analysis["performance_scores"])
        except Exception as cmp_err:
            logger.warning(f"Score comparison error (non-fatal): {cmp_err}")

        # Store analysis result in MongoDB (enriched with detailed metrics for improvement tracking)
        analysis_record = {
            "id": file_id,
            "user_id": user["id"],
            "sport": sport,
            "date": datetime.now(timezone.utc).isoformat(),
            "analysis_mode": analysis_mode,
            "skill_level": detected_skill_level,
            "shot_analysis": ai_result.get("shot_analysis"),
            "pro_comparison": ai_result.get("pro_comparison"),
            "coach_feedback": coach_feedback,
            "quick_summary": ai_result.get("quick_summary"),
            "frames_analyzed": ai_result.get("frames_analyzed"),
            "video_info": ai_result.get("video_info"),
            # Detailed metrics for cross-session improvement tracking
            "detailed_metrics": ai_result.get("metrics"),
            "speed_analysis": ai_result.get("speed_analysis"),
            # New: performance dimension scores for progress charts
            "performance_scores": performance_scores,
            # Highlights metadata
            "highlights": {
                "clip_count": ai_result.get("highlights", {}).get("clip_count", 0) if ai_result.get("highlights") else 0,
                "total_duration": ai_result.get("highlights", {}).get("total_duration", 0) if ai_result.get("highlights") else 0,
                "reel_available": ai_result.get("highlights", {}).get("reel_available", False) if ai_result.get("highlights") else False,
                "clips": [
                    {"label": c.get("label"), "start_time": c.get("start_time"),
                     "end_time": c.get("end_time"), "duration": c.get("duration"),
                     "filename": c.get("filename")}
                    for c in (ai_result.get("highlights", {}).get("clips", []) if ai_result.get("highlights") else [])
                ],
            } if ai_result.get("highlights") else None,
            "segments_summary": ai_result.get("segments"),
        }
        await db.video_analyses.insert_one(analysis_record)
        analysis_record.pop("_id", None)

        # NOTE: Each video analysis is INDEPENDENT and must NOT mutate the
        # user's profile. The profile is set explicitly via the quiz or via
        # "Save as my profile" from an analysis — never silently on upload.

        # ─── Gamification: Check and award badges ───
        new_badges = await check_and_award_badges(user["id"], analysis_record)
        await update_upload_streak(user["id"])

        # Return full enriched result
        return {
            **ai_result,
            "analysis_id": file_id,
            "coach_feedback": coach_feedback,
            "improvement_plan": improvement_plan,
            "recommended_videos": recommended_videos,
            "recommended_drills": recommended_drills,
            "gear_tips": _generate_gear_tips(ai_result, profile),
            "training_priorities": _generate_training_priorities(ai_result),
            "new_badges": new_badges,
            # New: performance scores, training plan, badges, score comparison
            "performance_scores": performance_scores,
            "score_messages": score_messages,
            "training_plan_7day": training_plan_7day,
            "earned_badges": earned_badges,
            "score_comparison": score_comparison,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except Exception:
                pass


def _build_coach_summary(shot_name: str, grade: str, score: float, skill_level: str, mode: str) -> str:
    """Generate a conversational coach summary."""
    if grade in ["A", "B"] or (score and score >= 75):
        return (
            f"Great effort! Your {shot_name} is looking really solid. "
            f"You're performing at a {skill_level.lower()} level with some strong fundamentals. "
            f"Let's fine-tune a couple of things to take it to the next level."
        )
    elif grade in ["C"] or (score and score >= 50):
        return (
            f"Nice work on your {shot_name}! You've got the basics down and there's real potential here. "
            f"I've spotted a few areas where small adjustments can make a big difference. "
            f"Let's focus on those this week."
        )
    else:
        return (
            f"Thanks for uploading your {shot_name} video! Everyone starts somewhere, and I can see you're putting in effort. "
            f"I've identified some key areas that will dramatically improve your game with consistent practice. "
            f"Let's work on them together."
        )


def _build_coach_commentary(issue: str, shot_name: str, severity: str) -> str:
    """Generate friendly coach commentary for an issue."""
    severity_intros = {
        "high": f"This is a key area to fix - ",
        "medium": f"Here's something that will really help - ",
        "low": f"A small tweak that can make a difference - ",
    }
    intro = severity_intros.get(severity, "Here's what I noticed - ")

    impact_map = {
        "high": "This is holding back a lot of your power and accuracy.",
        "medium": "Fixing this will noticeably improve your consistency.",
        "low": "This is a finishing touch that separates good from great.",
    }
    impact = impact_map.get(severity, "Working on this will help your overall game.")

    return f"{intro}your {issue.lower()} during the {shot_name} needs attention. {impact}"


def _build_encouragement(top_issues: list, shot_name: str) -> str:
    """Generate encouraging closing message."""
    if not top_issues:
        return f"Your {shot_name} is looking great! Keep up the excellent work and upload again next week."

    high_count = sum(1 for t in top_issues if t.get("severity") == "high")
    if high_count == 0:
        return (
            f"You're making real progress! The issues I found are minor tweaks. "
            f"Focus on the drills this week and you'll see improvement fast."
        )
    elif high_count == 1:
        return (
            f"You're on the right track! Focus on the main issue this week and "
            f"you'll feel a noticeable difference in your {shot_name}. Keep going!"
        )
    else:
        return (
            f"I know there's a few things to work on, but don't be discouraged! "
            f"Even pros constantly work on their technique. Pick the top priority, "
            f"practice it daily for a week, then come back for another analysis."
        )


@api_router.post("/analyze-client-results")
async def analyze_client_results(request: Request, authorization: str = Header(None)):
    """
    Receive analysis results computed client-side (in browser via TensorFlow.js)
    and enrich with coaching feedback, pro comparison, and save to database.
    """
    from research_loader import (
        get_drills_for_issues, get_videos_for_issues,
    )

    user = await get_current_user(authorization)
    try:
        profile = await asyncio.wait_for(db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0}), timeout=5.0)
    except (Exception, asyncio.TimeoutError):
        profile = None
    body = await request.json()

    sport = body.get("sport", (profile or {}).get("active_sport", "badminton"))
    shot_type = body.get("shot_type", "unknown")
    confidence = body.get("confidence", 0)
    metrics = body.get("metrics", {})
    speed = body.get("speed", {})
    skill_level = body.get("skill_level", "Beginner")
    shot_grade = body.get("shot_grade", "C")
    segments = body.get("segments", [])
    video_info = body.get("video_info", {})
    player_preview = body.get("player_preview", None)
    weaknesses_raw = body.get("weaknesses", [])

    # Check if video analysis is supported for this sport
    from sports_config import get_sport_config
    sport_cfg = get_sport_config(sport)
    if sport_cfg and not sport_cfg.get("video_analysis", False):
        raise HTTPException(
            status_code=400,
            detail=f"Video analysis is not yet available for {sport_cfg['name']}. Coming soon!"
        )

    file_id = str(uuid.uuid4())
    shot_name = shot_type.replace("_", " ").title() if shot_type else "technique"

    # Compute a numeric score from the grade
    grade_to_score = {"A": 92, "B": 78, "C": 62, "D": 45, "F": 30}
    score = grade_to_score.get(shot_grade, 55)

    # ─── Build ai_result in same shape as /analyze-video ───
    ai_result = {
        "success": True,
        "skill_level": skill_level,
        "analysis_mode": "client",
        "shot_analysis": {
            "shot_type": shot_type,
            "shot_name": shot_name,
            "confidence": confidence,
            "grade": shot_grade,
            "score": score,
            "weaknesses": weaknesses_raw,
            "improvement_plan": None,
        },
        "pro_comparison": {
            "overall_score": min(95, max(20, score + 5)),
            "level": "Similar" if score >= 70 else "Developing",
            "message": (
                f"Your {shot_name} technique shows strong fundamentals compared to professional players."
                if score >= 70 else
                f"Your {shot_name} has room to grow. Focus on the coaching tips to close the gap with pro players."
            ),
            "pro_tips": [
                f"Focus on consistent follow-through during your {shot_name}",
                "Watch how pros position their feet before each shot",
            ],
            "player_match": None,
        },
        "metrics": metrics,
        "coaching": None,
        "comprehensive_coaching": None,
        "quick_summary": f"Client-side analysis of your {shot_name} (Grade: {shot_grade})",
        "frames_analyzed": video_info.get("frames_extracted", 0),
        "analyzed_player_preview": player_preview,
        "video_info": video_info,
        "speed_analysis": speed if speed else None,
        "sport": sport,
        "target_player": "auto",
        "highlights": None,
        "segments": {
            "total": len(segments),
            "active": sum(1 for s in segments if s.get("active")),
            "power_moments": sum(1 for s in segments if s.get("power")),
        } if segments else None,
    }

    # ─── Build coach-like feedback using research data ───
    issue_strings = []
    for w in weaknesses_raw:
        if isinstance(w, dict):
            issue_strings.append(w.get("issue", w.get("area", "")))
        elif isinstance(w, str):
            issue_strings.append(w)

    # Get drills and videos from research data
    drill_results = get_drills_for_issues(sport, issue_strings) if issue_strings else []
    detected_skill_level = skill_level
    recommended_videos = get_videos_for_issues(
        sport, issue_strings,
        level=detected_skill_level.lower().replace("+", ""),
        prefer_hindi=True,
        prefer_shorts=False,
        max_results=10,
    ) if issue_strings else []

    # Build top_issues with coach-like language
    top_issues = []
    for i, w in enumerate(weaknesses_raw):
        issue_text = w.get("issue", w.get("area", "")) if isinstance(w, dict) else str(w)
        severity = w.get("severity", "medium") if isinstance(w, dict) else "medium"

        drill_entry = None
        if i < len(drill_results):
            dr = drill_results[i]
            drill_video = None
            if dr.get("videos"):
                v = dr["videos"][0]
                drill_video = {"title": v["title"], "url": v["url"], "channel": v["channel"]}
            elif dr.get("fix_video"):
                fv = dr["fix_video"]
                drill_video = {"title": fv["title"], "url": fv["url"], "channel": fv["channel"]}

            drill_name = dr.get("drills", ["Practice drill"])[0] if dr.get("drills") else "Practice drill"
            drill_entry = {
                "name": drill_name if isinstance(drill_name, str) else str(drill_name),
                "description": f"Focus on {dr.get('skill_name', 'this area')} to address this issue",
                "duration": "10-15 min",
                "video": drill_video,
            }

        coach_says = _build_coach_commentary(issue_text, shot_name, severity)
        fix_text = ""
        if i < len(drill_results) and drill_results[i].get("fix"):
            fix_text = drill_results[i]["fix"]
        elif isinstance(w, dict) and w.get("fix"):
            fix_text = w["fix"]
        else:
            fix_text = f"Work on improving your {issue_text.lower()} with targeted practice."

        top_issues.append({
            "issue": issue_text,
            "coach_says": coach_says,
            "fix": fix_text,
            "drill": drill_entry,
            "severity": severity,
        })

    # Build strengths list
    strengths = []
    if shot_grade in ["A", "B"]:
        strengths.append(f"Good {shot_name} technique")
    if score > 70:
        strengths.append("Solid overall form")
    existing_strengths = (profile or {}).get("strengths", [])
    strengths.extend(existing_strengths[:3])
    strengths = list(dict.fromkeys(strengths))[:5]

    # Build coach feedback
    summary = _build_coach_summary(shot_name, shot_grade, score, detected_skill_level, "full")
    encouragement = _build_encouragement(top_issues, shot_name)

    coach_feedback = {
        "summary": summary,
        "top_issues": top_issues,
        "strengths": strengths,
        "encouragement": encouragement,
    }

    # Personalize coaching feedback using the recommendation engine
    try:
        from recommendation_engine import personalize_coaching_feedback
        profile_analysis = (profile or {}).get("personalization")
        if profile_analysis:
            coach_feedback = personalize_coaching_feedback(coach_feedback, profile_analysis)
    except Exception as e:
        logger.warning(f"Coaching personalization error (non-fatal): {e}")

    # Build improvement plan
    this_week_tasks = []
    for ti in top_issues[:3]:
        drill = ti.get("drill")
        if drill:
            this_week_tasks.append(f"Practice: {drill['name']} ({drill['duration']})")
        else:
            this_week_tasks.append(f"Focus on: {ti['issue']}")

    improvement_plan = {
        "this_week": this_week_tasks,
        "next_upload": "Upload again in 7 days to track your improvement",
        "expected_improvement": f"With daily practice, you should see noticeable improvement in your {shot_name} within 2 weeks",
    }

    # Build recommended drills list
    recommended_drills = []
    for dr in drill_results[:5]:
        recommended_drills.append({
            "skill_area": dr.get("skill_name"),
            "skill_id": dr.get("skill_id"),
            "drills": dr.get("drills", []),
            "matched_issue": dr.get("matched_issue"),
        })

    # ─── Performance Scores ───
    performance_scores = None
    score_messages = []
    try:
        from scoring_engine import calculate_performance_scores, generate_score_messages
        performance_scores = calculate_performance_scores(metrics, sport)
        score_messages = generate_score_messages(performance_scores)
    except Exception as score_err:
        logger.warning(f"Scoring engine error (non-fatal): {score_err}")

    # ─── 7-Day Training Plan ───
    training_plan_7day = None
    try:
        from coach_engine import generate_7day_training_plan
        plan_weaknesses = [w for w in weaknesses_raw[:3] if isinstance(w, dict)]
        training_plan_7day = generate_7day_training_plan(plan_weaknesses, sport, shot_name)
    except Exception as plan_err:
        logger.warning(f"Training plan error (non-fatal): {plan_err}")

    # ─── Badges ───
    earned_badges = []
    try:
        from coach_engine import calculate_badges
        past_analyses = await asyncio.wait_for(db.video_analyses.find(
            {"user_id": user["id"]}, {"_id": 0, "shot_analysis": 1, "sport": 1, "date": 1}
        ).sort("date", 1).to_list(100), timeout=5.0)
        current_for_badges = {
            "shot_analysis": ai_result.get("shot_analysis"),
            "sport": sport,
            "date": datetime.now(timezone.utc).isoformat(),
        }
        all_for_badges = past_analyses + [current_for_badges]
        earned_badges = calculate_badges(all_for_badges)
    except Exception as badge_err:
        logger.warning(f"Badge calculation error (non-fatal): {badge_err}")

    # ─── Score Comparison with Previous Analysis ───
    score_comparison = None
    try:
        from scoring_engine import compare_scores
        prev_analysis = await asyncio.wait_for(db.video_analyses.find_one(
            {"user_id": user["id"], "performance_scores": {"$exists": True}},
            {"_id": 0, "performance_scores": 1},
            sort=[("date", -1)]
        ), timeout=5.0)
        if prev_analysis and prev_analysis.get("performance_scores") and performance_scores:
            score_comparison = compare_scores(performance_scores, prev_analysis["performance_scores"])
    except Exception as cmp_err:
        logger.warning(f"Score comparison error (non-fatal): {cmp_err}")

    # ─── Save to database (with timeout, non-fatal) ───
    analysis_record = {
        "id": file_id,
        "user_id": user["id"],
        "sport": sport,
        "date": datetime.now(timezone.utc).isoformat(),
        "analysis_mode": "client",
        "skill_level": detected_skill_level,
        "shot_analysis": ai_result.get("shot_analysis"),
        "pro_comparison": ai_result.get("pro_comparison"),
        "coach_feedback": coach_feedback,
        "quick_summary": ai_result.get("quick_summary"),
        "frames_analyzed": ai_result.get("frames_analyzed"),
        "video_info": ai_result.get("video_info"),
        "detailed_metrics": metrics,
        "speed_analysis": ai_result.get("speed_analysis"),
        "performance_scores": performance_scores,
        "highlights": None,
        "segments_summary": ai_result.get("segments"),
    }
    try:
        await asyncio.wait_for(db.video_analyses.insert_one(analysis_record), timeout=5.0)
        analysis_record.pop("_id", None)
    except (Exception, asyncio.TimeoutError):
        analysis_record.pop("_id", None)
        logger.warning("Failed to save analysis to DB (timeout or error)")

    # NOTE: Each video analysis is INDEPENDENT and must NOT mutate the
    # user's profile. The profile is set explicitly via the quiz or via
    # "Save as my profile" from an analysis — never silently on upload.

    # ─── Gamification (non-fatal) ───
    new_badges = []
    try:
        new_badges = await asyncio.wait_for(check_and_award_badges(user["id"], analysis_record), timeout=5.0)
        await asyncio.wait_for(update_upload_streak(user["id"]), timeout=5.0)
    except (Exception, asyncio.TimeoutError):
        logger.warning("Gamification update failed (timeout or error)")

    # Return full enriched result (same format as /analyze-video)
    return {
        **ai_result,
        "analysis_id": file_id,
        "coach_feedback": coach_feedback,
        "improvement_plan": improvement_plan,
        "recommended_videos": recommended_videos,
        "recommended_drills": recommended_drills,
        "gear_tips": _generate_gear_tips(ai_result, profile),
        "training_priorities": _generate_training_priorities(ai_result),
        "new_badges": new_badges,
        "performance_scores": performance_scores,
        "score_messages": score_messages,
        "training_plan_7day": training_plan_7day,
        "earned_badges": earned_badges,
        "score_comparison": score_comparison,
    }


HIGHLIGHTS_DIR = ANALYSIS_TEMP_DIR / "highlights"
try:
    HIGHLIGHTS_DIR.mkdir(exist_ok=True)
except OSError:
    pass


@api_router.get("/highlights/{analysis_id}")
async def get_highlights(analysis_id: str, authorization: str = Header(None)):
    """Get highlight clips metadata for an analysis."""
    await get_current_user(authorization)

    # Look up analysis record
    record = await db.video_analyses.find_one(
        {"id": analysis_id},
        {"_id": 0, "highlights": 1, "id": 1}
    )

    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")

    highlights = record.get("highlights")
    if not highlights or highlights.get("clip_count", 0) == 0:
        return {"analysis_id": analysis_id, "clips": [], "reel_available": False}

    return {
        "analysis_id": analysis_id,
        "clip_count": highlights.get("clip_count", 0),
        "total_duration": highlights.get("total_duration", 0),
        "reel_available": highlights.get("reel_available", False),
        "clips": highlights.get("clips", []),
    }


@api_router.get("/highlights/{analysis_id}/clip/{clip_index}")
async def get_highlight_clip(
    analysis_id: str, clip_index: int,
    authorization: str = Header(None), token: str = Query(None),
):
    """Serve a specific highlight clip file."""
    auth = authorization or (f"Bearer {token}" if token else None)
    await get_current_user(auth)

    record = await db.video_analyses.find_one(
        {"id": analysis_id},
        {"_id": 0, "highlights": 1}
    )

    if not record or not record.get("highlights"):
        raise HTTPException(status_code=404, detail="Analysis not found")

    clips = record["highlights"].get("clips", [])
    if clip_index < 0 or clip_index >= len(clips):
        raise HTTPException(status_code=404, detail="Clip not found")

    clip = clips[clip_index]
    filename = clip.get("filename")
    if not filename:
        raise HTTPException(status_code=404, detail="Clip file not found")

    clip_path = HIGHLIGHTS_DIR / filename
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip file not found on disk")

    return FileResponse(str(clip_path), media_type="video/mp4", filename=filename)


@api_router.get("/highlights/{analysis_id}/reel")
async def get_highlight_reel(
    analysis_id: str,
    authorization: str = Header(None), token: str = Query(None),
):
    """Serve the highlight reel video file."""
    auth = authorization or (f"Bearer {token}" if token else None)
    await get_current_user(auth)

    reel_filename = f"{analysis_id}_highlight_reel.mp4"
    reel_path = HIGHLIGHTS_DIR / reel_filename

    if not reel_path.exists():
        raise HTTPException(status_code=404, detail="Highlight reel not found")

    return FileResponse(str(reel_path), media_type="video/mp4", filename=reel_filename)


# ─── Cloudinary-based highlight generation ───
#
# Architecture:
#   Browser → (1) asks backend for signed upload params
#           → (2) uploads the video directly to Cloudinary
#           → (3) asks backend to generate a highlight reel URL
#           → (4) plays / downloads the reel from Cloudinary
#           → (5) asks backend to delete the uploaded video when done
#
# The API Secret never leaves the backend.

class HighlightReelRequest(BaseModel):
    public_id: str
    sport: str = "badminton"
    duration_seconds: float = 0  # Total video duration
    target_clips: int = 5
    include_speed_overlay: bool = True


def _cloudinary_sign(params: dict) -> str:
    """Build a Cloudinary SHA1 signature from the given params."""
    sorted_params = sorted([(k, v) for k, v in params.items()])
    to_sign = "&".join([f"{k}={v}" for k, v in sorted_params]) + CLOUDINARY_API_SECRET
    return hashlib.sha1(to_sign.encode("utf-8")).hexdigest()


@api_router.post("/highlights/sign-upload")
async def sign_cloudinary_upload(request: Request):
    """
    Generate signed upload params so the browser can upload a video directly
    to Cloudinary without ever exposing our API secret.
    """
    # Body is optional — we accept it for future expansion (e.g. custom tags).
    try:
        _ = await request.json() if request.headers.get("content-length") else {}
    except Exception:
        _ = {}

    timestamp = int(time.time())
    public_id = f"highlights/{uuid.uuid4().hex}"

    params_to_sign = {
        "timestamp": timestamp,
        "public_id": public_id,
        "folder": "athlyticai_uploads",
    }

    signature = _cloudinary_sign(params_to_sign)

    return {
        "signature": signature,
        "timestamp": timestamp,
        "public_id": public_id,
        "folder": "athlyticai_uploads",
        "api_key": CLOUDINARY_API_KEY,
        "cloud_name": CLOUDINARY_CLOUD_NAME,
        "upload_url": f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/video/upload",
    }


@api_router.post("/highlights/generate-reel")
async def generate_cloudinary_reel(req: HighlightReelRequest):
    """
    Generate a highlight reel URL using Cloudinary's e_preview transformation,
    which auto-detects the most interesting moments in the video.
    """
    # Target reel length: 20% of original, clamped to [20s, 60s]. If duration
    # is unknown, default to 30s.
    if req.duration_seconds > 0:
        target_duration = max(20, min(60, int(req.duration_seconds * 0.20)))
    else:
        target_duration = 30

    max_segments = max(1, int(req.target_clips))
    min_segment = 2  # 2-second minimum per clip

    transformations = [
        f"e_preview:duration_{target_duration}:max_seg_{max_segments}:min_seg_{min_segment}",
        "q_auto:good",
        "f_mp4",
    ]
    transformation_str = "/".join(transformations)

    reel_url = (
        f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}"
        f"/video/upload/{transformation_str}/{req.public_id}.mp4"
    )
    thumbnail_url = (
        f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}"
        f"/video/upload/so_0,w_640,c_limit,f_jpg/{req.public_id}.jpg"
    )

    return {
        "reel_url": reel_url,
        "thumbnail_url": thumbnail_url,
        "target_duration": target_duration,
        "max_clips": max_segments,
    }


@api_router.delete("/highlights/cleanup/{public_id:path}")
async def cleanup_cloudinary_video(public_id: str):
    """
    Delete an uploaded video from Cloudinary to free storage. Called by the
    frontend after the user has downloaded/viewed their reel.
    """
    timestamp = int(time.time())
    params_to_sign = {
        "public_id": public_id,
        "timestamp": timestamp,
    }
    signature = _cloudinary_sign(params_to_sign)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/video/destroy",
                data={
                    "public_id": public_id,
                    "api_key": CLOUDINARY_API_KEY,
                    "timestamp": timestamp,
                    "signature": signature,
                },
            )
            return {"deleted": resp.status_code == 200, "status": resp.status_code}
    except Exception as e:
        logging.getLogger(__name__).warning(f"Cloudinary cleanup failed: {e}")
        return {"deleted": False, "error": str(e)}


# ─── Video size / duration limits (process-only, no permanent storage) ───
MAX_VIDEO_FILE_SIZE_MB = 500          # 500 MB max upload
MAX_VIDEO_DURATION_SECONDS = 30 * 60  # 30 minutes max


@api_router.get("/highlight-limits")
async def get_highlight_limits():
    """Return video size/duration limits for highlight generation."""
    return {
        "max_file_size_mb": MAX_VIDEO_FILE_SIZE_MB,
        "max_duration_seconds": MAX_VIDEO_DURATION_SECONDS,
        "max_duration_display": "30 minutes",
        "max_file_size_display": "500 MB",
        "supported_formats": [".mp4", ".avi", ".mov", ".mkv", ".webm"],
        "note": "Videos are processed on-the-fly and not stored permanently.",
    }


@api_router.post("/generate-highlights")
async def generate_highlights_endpoint(
    video: UploadFile = File(...),
    sport: str = Query("badminton"),
    max_highlight_duration: float = Query(30.0),
    highlight_type: str = Query("auto"),
    authorization: str = Header(None),
):
    """
    Standalone highlight generation: upload a video and get highlight clips
    without running a full analysis.
    """
    if IS_SERVERLESS:
        return {
            "error": "Highlight generation is not available in serverless mode. Please use on-device analysis."
        }
    user = await get_current_user(authorization)

    # Validate file type
    allowed_ext = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    ext = os.path.splitext(video.filename or "")[1].lower()
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail="Invalid file type. Supported: MP4, AVI, MOV, MKV, WEBM.")

    # Validate max_highlight_duration
    max_highlight_duration = max(5.0, min(120.0, max_highlight_duration))

    # Save temp file
    file_id = str(uuid.uuid4())
    temp_path = ANALYSIS_TEMP_DIR / f"{file_id}{ext}"

    try:
        # Stream-write with size check
        total_size = 0
        max_bytes = MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024
        with open(temp_path, "wb") as buf:
            while True:
                chunk = await video.read(1024 * 1024)  # 1 MB chunks
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video too large. Maximum size is {MAX_VIDEO_FILE_SIZE_MB} MB."
                    )
                buf.write(chunk)

        logger.info(f"Highlight video saved: {temp_path} ({total_size / 1024 / 1024:.1f} MB) for user {user['id']}")

        # Run highlight pipeline in thread pool
        import functools
        loop = asyncio.get_event_loop()
        hl_result = await loop.run_in_executor(
            None,
            functools.partial(
                _run_highlight_pipeline,
                str(temp_path),
                sport=sport,
                max_highlight_duration=max_highlight_duration,
                highlight_type=highlight_type,
                file_id=file_id,
            )
        )

        if not hl_result.get("success"):
            raise HTTPException(status_code=500, detail=hl_result.get("error", "Highlight generation failed"))

        return hl_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Highlight generation error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Highlight generation failed: {str(e)}")
    finally:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except Exception:
                pass


def _run_highlight_pipeline(
    video_path: str,
    sport: str = "badminton",
    max_highlight_duration: float = 30.0,
    highlight_type: str = "auto",
    file_id: str = "",
) -> dict:
    """Run segment detection + highlight generation without full analysis."""
    import cv2
    try:
        from segment_detector import detect_segments, get_highlight_timestamps
        from highlight_generator import generate_highlights as hl_generate

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"success": False, "error": "Could not open video file"}

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        if duration > MAX_VIDEO_DURATION_SECONDS:
            cap.release()
            return {
                "success": False,
                "error": f"Video is {duration / 60:.1f} minutes long. Maximum is {MAX_VIDEO_DURATION_SECONDS // 60} minutes."
            }

        if duration < 2.0:
            cap.release()
            return {"success": False, "error": "Video is too short for highlight generation. Minimum 2 seconds."}

        print(f"[Highlights] Video: {duration:.1f}s, {width}x{height}, {fps:.1f} fps")

        # Sample frames for segment detection
        # Use ~5 fps sampling for good motion detection (every 0.2s)
        sample_fps = min(fps, 5.0)
        sample_interval = max(1, int(fps / sample_fps))
        frames = []
        timestamps = []
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % sample_interval == 0:
                # Resize for faster processing
                small = cv2.resize(frame, (320, 180))
                frames.append(small)
                timestamps.append(frame_idx / fps)
            frame_idx += 1
        cap.release()

        effective_fps = len(frames) / duration if duration > 0 else 5.0
        print(f"[Highlights] Sampled {len(frames)} frames ({effective_fps:.1f} effective fps)")

        print("[Highlights] Running segment detection...")
        segments = detect_segments(
            frames,
            timestamps,
            fps=effective_fps,
            min_segment_duration=0.3,
            merge_gap=1.5,
        )
        active_segments = [s for s in segments if s["label"] in ("power_moment", "rally", "transition")]
        print(f"[Highlights] Detected {len(segments)} segments ({len(active_segments)} active)")

        if not segments:
            return {
                "success": True,
                "highlight_id": file_id,
                "clip_count": 0,
                "total_duration": 0,
                "clips": [],
                "reel_available": False,
                "preview_b64": None,
                "video_info": {"duration": duration, "width": width, "height": height, "fps": fps},
                "message": "No highlight-worthy segments detected in this video.",
            }

        highlight_ts = get_highlight_timestamps(
            segments, duration,
            max_highlight_duration=max_highlight_duration,
            padding=1.0,
            min_clip_duration=2.0,
        )

        if highlight_type == "power":
            highlight_ts = [h for h in highlight_ts if h[2] == "power_moment"]
        elif highlight_type == "rallies":
            highlight_ts = [h for h in highlight_ts if h[2] in ("rally", "power_moment")]

        if not highlight_ts:
            return {
                "success": True,
                "highlight_id": file_id,
                "clip_count": 0,
                "total_duration": 0,
                "clips": [],
                "reel_available": False,
                "preview_b64": None,
                "video_info": {"duration": duration, "width": width, "height": height, "fps": fps},
                "message": f"No {highlight_type} highlights found. Try a different highlight type.",
            }

        highlights_dir = str(HIGHLIGHTS_DIR)
        print(f"[Highlights] Generating {len(highlight_ts)} clips...")

        hl_result = hl_generate(
            video_path=video_path,
            highlight_timestamps=highlight_ts,
            output_dir=highlights_dir,
            analysis_id=file_id,
            generate_reel=True,
        )

        clips = []
        for c in hl_result.get("clips", []):
            clips.append({
                "label": c["label"],
                "start_time": c["start_time"],
                "end_time": c["end_time"],
                "duration": c["duration"],
                "thumbnail_b64": c.get("thumbnail_b64"),
                "filename": c.get("filename"),
            })

        return {
            "success": True,
            "highlight_id": file_id,
            "clip_count": hl_result["clip_count"],
            "total_duration": hl_result["total_duration"],
            "clips": clips,
            "reel_available": hl_result.get("reel_path") is not None,
            "preview_b64": hl_result.get("preview_b64"),
            "video_info": {"duration": duration, "width": width, "height": height, "fps": fps},
            "message": f"Generated {hl_result['clip_count']} highlight clips ({hl_result['total_duration']:.1f}s total)",
        }

    except Exception as e:
        print(f"[Highlights] Error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@api_router.get("/highlights/{highlight_id}/standalone/clip/{clip_index}")
async def get_standalone_highlight_clip(
    highlight_id: str, clip_index: int,
    authorization: str = Header(None), token: str = Query(None),
):
    """Serve a clip from standalone highlight generation."""
    auth = authorization or (f"Bearer {token}" if token else None)
    await get_current_user(auth)

    import glob
    pattern = str(HIGHLIGHTS_DIR / f"{highlight_id}_clip_{clip_index}_*")
    matches = glob.glob(pattern)

    if not matches:
        raise HTTPException(status_code=404, detail="Clip not found")

    clip_path = Path(matches[0])
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip file not found on disk")

    return FileResponse(str(clip_path), media_type="video/mp4", filename=clip_path.name)


@api_router.get("/highlights/{highlight_id}/standalone/reel")
async def get_standalone_highlight_reel(
    highlight_id: str,
    authorization: str = Header(None), token: str = Query(None),
):
    """Serve a reel from standalone highlight generation."""
    auth = authorization or (f"Bearer {token}" if token else None)
    await get_current_user(auth)

    reel_path = HIGHLIGHTS_DIR / f"{highlight_id}_highlight_reel.mp4"
    if not reel_path.exists():
        raise HTTPException(status_code=404, detail="Highlight reel not found")

    return FileResponse(str(reel_path), media_type="video/mp4", filename=reel_path.name)


@api_router.get("/analysis-history/{user_id}")
async def get_analysis_history(user_id: str, authorization: str = Header(None)):
    """Get past video analysis results for tracking improvement."""
    if user_id == "guest":
        return {"analyses": [], "total": 0}
    user = await get_current_user_or_none(authorization)
    if not user:
        return {"analyses": [], "total": 0}

    analyses = await db.video_analyses.find(
        {"user_id": user_id},
        {"_id": 0, "coaching": 0, "comprehensive_coaching": 0, "metrics": 0}
    ).sort("date", -1).to_list(50)

    return {"analyses": analyses, "total": len(analyses)}


@api_router.get("/analysis/{analysis_id}")
async def get_analysis_detail(analysis_id: str, authorization: str = Header(None)):
    """Get full details for a single analysis by its ID."""
    user = await get_current_user_or_none(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to view analysis details")

    analysis = await db.video_analyses.find_one(
        {"id": analysis_id, "user_id": user["id"]},
        {"_id": 0}
    )

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Fetch user profile to regenerate gear tips and training priorities
    profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})

    # Rebuild the enriched result shape that renderResults expects
    result = {
        "success": True,
        "analysis_id": analysis.get("id"),
        "sport": analysis.get("sport"),
        "skill_level": analysis.get("skill_level"),
        "shot_analysis": analysis.get("shot_analysis"),
        "pro_comparison": analysis.get("pro_comparison"),
        "coach_feedback": analysis.get("coach_feedback"),
        "quick_summary": analysis.get("quick_summary"),
        "frames_analyzed": analysis.get("frames_analyzed"),
        "video_info": analysis.get("video_info"),
        "metrics": analysis.get("detailed_metrics"),
        "speed_analysis": analysis.get("speed_analysis"),
        "performance_scores": analysis.get("performance_scores"),
        "highlights": analysis.get("highlights"),
        "segments": analysis.get("segments_summary"),
        "analysis_mode": analysis.get("analysis_mode", "full"),
        "date": analysis.get("date"),
        "gear_tips": _generate_gear_tips(analysis, profile),
        "training_priorities": _generate_training_priorities(analysis),
    }

    return result


def _generate_gear_tips(ai_result, profile):
    """Generate sport-specific equipment suggestions based on AI analysis."""
    sport = ai_result.get("sport", (profile or {}).get("active_sport", "badminton"))
    tips = []
    skill = ai_result.get("skill_level", "")

    SPORT_GEAR_TIPS = {
        "badminton": {
            "beginner": "Use a lightweight racket (5U/4U) with flexible shaft for easier learning",
            "advanced": "Your technique supports a stiffer, head-heavy racket for maximum power",
        },
        "tennis": {
            "beginner": "Start with a larger head-size racket (100+ sq in) for a bigger sweet spot",
            "advanced": "Consider a player's frame (95-98 sq in) for more control and feel",
        },
        "table_tennis": {
            "beginner": "Use an all-round blade with medium-soft rubbers for control",
            "advanced": "Your technique supports faster rubbers with higher spin ratings",
        },
        "pickleball": {
            "beginner": "Choose a lightweight paddle (7-7.5 oz) with a large sweet spot",
            "advanced": "Your game supports a power paddle with elongated shape for reach",
        },
        "cricket": {
            "beginner": "Use a lighter bat (2.7-2.9 lbs) with a bigger sweet spot for timing",
            "advanced": "Your technique supports a heavier bat with thicker edges for power",
        },
        "football": {
            "beginner": "Get football boots with firm ground studs and good ankle support",
            "advanced": "Consider lighter speed boots for your level of technique and agility",
        },
        "swimming": {
            "beginner": "Get comfortable goggles and a pull buoy to work on upper body technique",
            "advanced": "Consider a tech suit and hand paddles for training power development",
        },
    }

    sport_tips = SPORT_GEAR_TIPS.get(sport, SPORT_GEAR_TIPS["badminton"])
    if skill in ["Beginner", "Beginner+"]:
        tips.append(sport_tips.get("beginner", "Focus on comfortable, beginner-friendly equipment"))
    elif skill in ["Advanced", "Expert"]:
        tips.append(sport_tips.get("advanced", "Your technique supports performance-grade equipment"))
    else:
        tips.append(sport_tips.get("beginner", "Choose equipment that matches your current level"))

    return tips[:3]


def _generate_training_priorities(ai_result):
    """Generate training drill priorities from AI analysis weaknesses."""
    priorities = []
    shot = ai_result.get("shot_analysis") or {}
    weaknesses = shot.get("weaknesses") or []

    # Map weakness areas to drill skill_focus categories
    area_to_drill = {
        "technique": "smash",
        "footwork": "footwork",
        "stance": "footwork",
        "posture": "defense",
        "reach": "net_play",
    }

    for w in weaknesses[:4]:
        if isinstance(w, dict):
            area = w.get("area", "").lower()
            issue = w.get("issue", "")
            drill_focus = area_to_drill.get(area, "footwork")
            priorities.append({
                "area": w.get("area", "General"),
                "issue": issue,
                "drill_focus": drill_focus,
                "severity": w.get("severity", "medium"),
            })

    return priorities


# ─── Social / Community Routes ───

class FriendRequest(BaseModel):
    to_user_id: str

class FriendResponse(BaseModel):
    request_id: str
    action: str  # "accept" or "reject"

class GameCreate(BaseModel):
    sport: str
    title: str
    venue: str
    city: str
    date: str  # ISO date
    time: str  # e.g. "18:00"
    duration_minutes: int = 60
    skill_level: str = "All Levels"
    max_players: int = 4
    notes: str = ""

class GameJoinRequest(BaseModel):
    game_id: str


@api_router.get("/community/players")
async def discover_players(sport: Optional[str] = None, city: Optional[str] = None, authorization: str = Header(None)):
    """Discover other players. Optional filter by sport and city."""
    user = await get_current_user(authorization)
    query = {"id": {"$ne": user["id"]}}  # Exclude self

    # Get all profiles
    profiles = await db.player_profiles.find({}, {"_id": 0}).to_list(200)
    users_map = {}
    for u in await db.users.find({}, {"_id": 0}).to_list(200):
        users_map[u["id"]] = u

    players = []
    for p in profiles:
        if p["user_id"] == user["id"]:
            continue
        # Filter by sport if specified
        if sport:
            selected = p.get("selected_sports", [])
            if sport not in selected:
                continue
        # Filter by city
        if city and p.get("city", "").lower() != city.lower():
            continue

        u = users_map.get(p["user_id"], {})
        players.append({
            "user_id": p["user_id"],
            "name": u.get("name") or f"Player {p['user_id'][:6]}",
            "email": u.get("email", ""),  # User email
            "skill_level": p.get("skill_level"),
            "play_style": p.get("play_style"),
            "selected_sports": p.get("selected_sports", []),
            "active_sport": p.get("active_sport"),
            "city": p.get("city", ""),
            "strengths": p.get("strengths", [])[:3],
        })

    return {"players": players, "total": len(players)}


@api_router.post("/friends/request")
async def send_friend_request(data: FriendRequest, authorization: str = Header(None)):
    """Send a friend request."""
    user = await get_current_user(authorization)

    if data.to_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot send request to yourself")

    # Check if already friends
    existing_friendship = await db.friendships.find_one({
        "$or": [
            {"user1": user["id"], "user2": data.to_user_id},
            {"user1": data.to_user_id, "user2": user["id"]},
        ]
    })
    if existing_friendship:
        raise HTTPException(status_code=400, detail="Already friends")

    # Check if request already pending
    existing = await db.friend_requests.find_one({
        "from_user": user["id"], "to_user": data.to_user_id, "status": "pending"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Request already sent")

    # Check if reverse request exists (they already requested us)
    reverse = await db.friend_requests.find_one({
        "from_user": data.to_user_id, "to_user": user["id"], "status": "pending"
    })
    if reverse:
        # Auto-accept
        await db.friend_requests.update_one({"_id": reverse["_id"]}, {"$set": {"status": "accepted"}})
        await db.friendships.insert_one({
            "id": str(uuid.uuid4()),
            "user1": user["id"],
            "user2": data.to_user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"message": "You are now friends!", "status": "accepted"}

    req = {
        "id": str(uuid.uuid4()),
        "from_user": user["id"],
        "to_user": data.to_user_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.friend_requests.insert_one(req)
    req.pop("_id", None)
    return {"message": "Friend request sent", "request": req}


@api_router.get("/friends/requests")
async def get_friend_requests(authorization: str = Header(None)):
    """Get pending friend requests (received)."""
    user = await get_current_user(authorization)

    requests = await db.friend_requests.find(
        {"to_user": user["id"], "status": "pending"}, {"_id": 0}
    ).to_list(50)

    # Enrich with sender info
    for req in requests:
        sender_profile = await db.player_profiles.find_one({"user_id": req["from_user"]}, {"_id": 0})
        sender_user = await db.users.find_one({"id": req["from_user"]}, {"_id": 0})
        req["from_name"] = (sender_user or {}).get("name") or f"Player {req['from_user'][:6]}"
        req["from_skill"] = (sender_profile or {}).get("skill_level", "Unknown")
        req["from_sports"] = (sender_profile or {}).get("selected_sports", [])

    # Also count sent requests
    sent = await db.friend_requests.count_documents({"from_user": user["id"], "status": "pending"})

    return {"received": requests, "sent_count": sent}


@api_router.post("/friends/respond")
async def respond_to_friend_request(data: FriendResponse, authorization: str = Header(None)):
    """Accept or reject a friend request."""
    user = await get_current_user(authorization)

    req = await db.friend_requests.find_one({"id": data.request_id, "to_user": user["id"], "status": "pending"})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if data.action == "accept":
        await db.friend_requests.update_one({"_id": req["_id"]}, {"$set": {"status": "accepted"}})
        await db.friendships.insert_one({
            "id": str(uuid.uuid4()),
            "user1": req["from_user"],
            "user2": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"message": "Friend request accepted!"}
    else:
        await db.friend_requests.update_one({"_id": req["_id"]}, {"$set": {"status": "rejected"}})
        return {"message": "Friend request declined"}


@api_router.get("/friends")
async def get_friends(authorization: str = Header(None)):
    """Get friend list."""
    user = await get_current_user(authorization)

    friendships = await db.friendships.find({
        "$or": [{"user1": user["id"]}, {"user2": user["id"]}]
    }, {"_id": 0}).to_list(200)

    friends = []
    for f in friendships:
        friend_id = f["user2"] if f["user1"] == user["id"] else f["user1"]
        profile = await db.player_profiles.find_one({"user_id": friend_id}, {"_id": 0})
        friend_user = await db.users.find_one({"id": friend_id}, {"_id": 0})
        friends.append({
            "user_id": friend_id,
            "name": (friend_user or {}).get("name") or f"Player {friend_id[:6]}",
            "skill_level": (profile or {}).get("skill_level"),
            "play_style": (profile or {}).get("play_style"),
            "selected_sports": (profile or {}).get("selected_sports", []),
            "since": f.get("created_at"),
        })

    return {"friends": friends, "total": len(friends)}


# ─── Game Hosting Routes ───

@api_router.post("/games")
async def create_game(data: GameCreate, authorization: str = Header(None)):
    """Host a new game."""
    user = await get_current_user(authorization)
    profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})

    game = {
        "id": str(uuid.uuid4()),
        "host_id": user["id"],
        "host_name": user.get("name") or f"Player {user['id'][:6]}",
        "host_skill": (profile or {}).get("skill_level", "Unknown"),
        "sport": data.sport,
        "title": data.title,
        "venue": data.venue,
        "city": data.city,
        "date": data.date,
        "time": data.time,
        "duration_minutes": data.duration_minutes,
        "skill_level": data.skill_level,
        "max_players": data.max_players,
        "players": [user["id"]],  # Host auto-joins
        "player_names": {user["id"]: user.get("name") or f"Player {user['id'][:6]}"},
        "notes": data.notes,
        "status": "open",  # open, full, completed, cancelled
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.games.insert_one(game)
    game.pop("_id", None)
    return {"message": "Game created!", "game": game}


@api_router.get("/games")
async def list_games(sport: Optional[str] = None, city: Optional[str] = None, authorization: str = Header(None)):
    """Browse open games."""
    await get_current_user(authorization)

    query = {"status": "open"}
    if sport:
        query["sport"] = sport
    if city:
        query["city"] = {"$regex": city, "$options": "i"}

    games = await db.games.find(query, {"_id": 0}).sort("date", 1).to_list(50)

    # Add spots_left
    for g in games:
        g["spots_left"] = g["max_players"] - len(g.get("players", []))

    return {"games": games, "total": len(games)}


@api_router.post("/games/join")
async def join_game(data: GameJoinRequest, authorization: str = Header(None)):
    """Join an open game."""
    user = await get_current_user(authorization)

    game = await db.games.find_one({"id": data.game_id}, {"_id": 0})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    if game["status"] != "open":
        raise HTTPException(status_code=400, detail="Game is no longer open")

    if user["id"] in game.get("players", []):
        raise HTTPException(status_code=400, detail="Already joined this game")

    if len(game.get("players", [])) >= game["max_players"]:
        raise HTTPException(status_code=400, detail="Game is full")

    player_name = user.get("name") or f"Player {user['id'][:6]}"
    new_status = "full" if len(game["players"]) + 1 >= game["max_players"] else "open"

    await db.games.update_one(
        {"id": data.game_id},
        {
            "$push": {"players": user["id"]},
            "$set": {
                f"player_names.{user['id']}": player_name,
                "status": new_status,
            },
        },
    )
    return {"message": f"Joined! {game['max_players'] - len(game['players']) - 1} spots left", "status": new_status}


@api_router.post("/games/{game_id}/leave")
async def leave_game(game_id: str, authorization: str = Header(None)):
    """Leave a game you joined."""
    user = await get_current_user(authorization)

    game = await db.games.find_one({"id": game_id})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    if user["id"] not in game.get("players", []):
        raise HTTPException(status_code=400, detail="Not in this game")

    if user["id"] == game["host_id"]:
        # Host cancels the game
        await db.games.update_one({"id": game_id}, {"$set": {"status": "cancelled"}})
        return {"message": "Game cancelled"}

    await db.games.update_one(
        {"id": game_id},
        {"$pull": {"players": user["id"]}, "$unset": {f"player_names.{user['id']}": ""}, "$set": {"status": "open"}},
    )
    return {"message": "Left the game"}


@api_router.get("/games/my")
async def my_games(authorization: str = Header(None)):
    """Get games I'm hosting or joined."""
    user = await get_current_user(authorization)

    hosted = await db.games.find({"host_id": user["id"]}, {"_id": 0}).sort("date", 1).to_list(50)
    joined = await db.games.find(
        {"players": user["id"], "host_id": {"$ne": user["id"]}}, {"_id": 0}
    ).sort("date", 1).to_list(50)

    for g in hosted + joined:
        g["spots_left"] = g["max_players"] - len(g.get("players", []))

    return {"hosted": hosted, "joined": joined}


# ─── Training Video Recommendations Route ───

@api_router.get("/recommendations/training-videos/{user_id}")
async def get_training_video_recommendations(user_id: str, sport: Optional[str] = None, authorization: str = Header(None)):
    """
    Return curated training videos based on user profile + latest video analysis.
    Prioritizes Hindi/Indian channels, Shorts for quick learning, and skill-level matching.
    """
    if user_id == "guest":
        return {"videos": [], "weekly_plan": None, "skill_drills": []}
    from research_loader import (
        get_videos_for_issues, get_all_videos,
        build_weekly_plan_from_skills, get_drills_for_issues,
    )

    user = await get_current_user_or_none(authorization)
    if not user:
        return {"videos": [], "weekly_plan": None, "skill_drills": []}
    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Use explicit sport param first, then latest analysis sport, then profile active_sport
    if sport:
        active_sport = sport
    else:
        latest_analysis_sport = await db.video_analyses.find_one(
            {"user_id": user_id}, {"_id": 0, "sport": 1}, sort=[("date", -1)]
        )
        active_sport = (latest_analysis_sport or {}).get("sport") or profile.get("active_sport", "badminton")
    skill_level = profile.get("skill_level", "Beginner")
    level_key = skill_level.lower().replace("+", "").strip()

    # Get latest analysis issues
    latest_analysis = await db.video_analyses.find_one(
        {"user_id": user_id},
        {"_id": 0, "shot_analysis": 1, "coach_feedback": 1, "sport": 1},
        sort=[("date", -1)]
    )

    focus_issues = []
    focus_skill_area = "General Training"
    focus_reason = "Based on your skill level and play style"

    if latest_analysis:
        shot = latest_analysis.get("shot_analysis") or {}
        for w in (shot.get("weaknesses") or []):
            if isinstance(w, dict):
                focus_issues.append(w.get("issue", w.get("area", "")))
            elif isinstance(w, str):
                focus_issues.append(w)
        if focus_issues:
            focus_skill_area = shot.get("shot_name", "Technique")
            focus_reason = f"Your latest analysis showed issues with {', '.join(focus_issues[:2])}"

    # Get today's focus videos
    today_videos = get_videos_for_issues(
        active_sport, focus_issues if focus_issues else [skill_level],
        level=level_key, prefer_hindi=True, prefer_shorts=True, max_results=5,
    )
    # Fallback if no issue-specific videos
    if not today_videos:
        today_videos = get_all_videos(active_sport, level=level_key)[:5]
    today_video_list = [
        {"id": v.get("id"), "title": v.get("title"), "channel": v.get("channel"),
         "url": v.get("url"), "thumbnail": v.get("thumbnail"), "level": v.get("level"),
         "language": v.get("language"), "has_shorts": v.get("has_shorts"),
         "content_type": v.get("content_type"), "description": v.get("description")}
        for v in today_videos
    ]

    # Get drills for today
    today_drills = []
    if focus_issues:
        drill_results = get_drills_for_issues(active_sport, focus_issues)
        for dr in drill_results[:3]:
            today_drills.extend(dr.get("drills", [])[:2])

    # Build weekly plan from research data
    weekly_plan = build_weekly_plan_from_skills(
        active_sport, skill_level,
        focus_issues=focus_issues,
        days_per_week=5,
    )

    return {
        "today_focus": {
            "skill_area": focus_skill_area,
            "reason": focus_reason,
            "videos": today_video_list,
            "drills": today_drills[:5],
        },
        "weekly_plan": weekly_plan,
        "sport": active_sport,
        "skill_level": skill_level,
    }


# ─── Analysis History & Progression Route ───

@api_router.get("/progress/analysis-history/{user_id}")
async def get_analysis_history_progression(user_id: str, authorization: str = Header(None)):
    """
    Return all past video analyses with improvement tracking.
    Calculates improvement percentage between consecutive analyses and shows trends.
    """
    if user_id == "guest":
        return {"analyses": [], "total": 0, "trends": {}, "improvement_summary": None}
    user = await get_current_user_or_none(authorization)
    if not user:
        return {"analyses": [], "total": 0, "trends": {}, "improvement_summary": None}

    analyses = await db.video_analyses.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("date", 1).to_list(100)

    if not analyses:
        return {"analyses": [], "total": 0, "trends": {}, "improvement_summary": None}

    # Calculate improvement between consecutive analyses
    enriched = []
    for i, analysis in enumerate(analyses):
        entry = {
            "id": analysis.get("id"),
            "date": analysis.get("date"),
            "sport": analysis.get("sport", "badminton"),
            "analysis_mode": analysis.get("analysis_mode", "full"),
            "skill_level": analysis.get("skill_level"),
            "shot_analysis": analysis.get("shot_analysis"),
            "coach_feedback": analysis.get("coach_feedback"),
            "quick_summary": analysis.get("quick_summary"),
            "frames_analyzed": analysis.get("frames_analyzed"),
        }

        # Calculate improvement vs previous
        if i > 0:
            prev = analyses[i - 1]
            prev_score = _extract_score(prev)
            curr_score = _extract_score(analysis)
            if prev_score is not None and curr_score is not None and prev_score > 0:
                improvement_pct = round(((curr_score - prev_score) / prev_score) * 100, 1)
                entry["improvement_vs_previous"] = {
                    "percentage": improvement_pct,
                    "direction": "improved" if improvement_pct > 0 else ("declined" if improvement_pct < 0 else "same"),
                    "previous_score": prev_score,
                    "current_score": curr_score,
                }

            # Compare weaknesses
            prev_weaknesses = set()
            prev_w_list = (prev.get("shot_analysis") or {}).get("weaknesses")
            for w in (prev_w_list if isinstance(prev_w_list, list) else []):
                if isinstance(w, dict):
                    prev_weaknesses.add(w.get("issue", w.get("area", "")))
            curr_weaknesses = set()
            curr_w_list = (analysis.get("shot_analysis") or {}).get("weaknesses")
            for w in (curr_w_list if isinstance(curr_w_list, list) else []):
                if isinstance(w, dict):
                    curr_weaknesses.add(w.get("issue", w.get("area", "")))

            resolved = prev_weaknesses - curr_weaknesses
            new_issues = curr_weaknesses - prev_weaknesses
            if resolved or new_issues:
                entry["comparison"] = {
                    "resolved_issues": list(resolved),
                    "new_issues": list(new_issues),
                    "persistent_issues": list(prev_weaknesses & curr_weaknesses),
                }

        enriched.append(entry)

    # Build trend data
    scores_over_time = []
    for a in analyses:
        s = _extract_score(a)
        if s is not None:
            scores_over_time.append({"date": a.get("date"), "score": s})

    # Overall improvement summary
    improvement_summary = None
    if len(scores_over_time) >= 2:
        first_score = scores_over_time[0]["score"]
        last_score = scores_over_time[-1]["score"]
        if first_score > 0:
            total_improvement = round(((last_score - first_score) / first_score) * 100, 1)
            improvement_summary = {
                "total_analyses": len(analyses),
                "first_score": first_score,
                "latest_score": last_score,
                "total_improvement_pct": total_improvement,
                "direction": "improved" if total_improvement > 0 else ("declined" if total_improvement < 0 else "same"),
                "time_span_days": _days_between(scores_over_time[0]["date"], scores_over_time[-1]["date"]),
            }

    # Per-metric improvement (compare first and latest analyses with detailed_metrics)
    metric_improvements = []
    if len(analyses) >= 2:
        first_metrics = analyses[0].get("detailed_metrics") or {}
        latest_metrics = analyses[-1].get("detailed_metrics") or {}
        metric_labels = {
            "elbow_angle": ("Elbow Extension", "°", True),
            "shoulder_rotation": ("Shoulder Rotation", "°", True),
            "movement_speed": ("Movement Speed", "", True),
            "knee_angle": ("Knee Bend", "°", False),  # lower is better
            "arm_extension": ("Arm Extension", "", True),
        }
        for key, (label, unit, higher_better) in metric_labels.items():
            first_val = _safe_metric_val(first_metrics.get(key))
            latest_val = _safe_metric_val(latest_metrics.get(key))
            if first_val is not None and latest_val is not None and first_val > 0:
                change = latest_val - first_val
                pct = round((change / abs(first_val)) * 100, 1)
                if higher_better:
                    improved = change > 0
                else:
                    improved = change < 0  # lower is better
                coach_note = ""
                if improved:
                    coach_note = f"Great progress! Your {label.lower()} improved from {first_val:.1f}{unit} to {latest_val:.1f}{unit}."
                elif abs(pct) < 2:
                    coach_note = f"Your {label.lower()} is consistent at {latest_val:.1f}{unit}. Keep working on it."
                else:
                    coach_note = f"Your {label.lower()} went from {first_val:.1f}{unit} to {latest_val:.1f}{unit}. Let's focus on this area."

                metric_improvements.append({
                    "metric": key,
                    "label": label,
                    "first_value": round(first_val, 1),
                    "latest_value": round(latest_val, 1),
                    "change": round(change, 1),
                    "change_pct": pct,
                    "improved": improved,
                    "unit": unit,
                    "coach_note": coach_note,
                })

        # Speed comparison
        first_speed = (analyses[0].get("speed_analysis") or {}).get("estimated_speed_kmh")
        latest_speed = (analyses[-1].get("speed_analysis") or {}).get("estimated_speed_kmh")
        if first_speed and latest_speed and first_speed > 0:
            speed_change = latest_speed - first_speed
            speed_pct = round((speed_change / first_speed) * 100, 1)
            improved = speed_change > 0
            metric_improvements.append({
                "metric": "swing_speed",
                "label": "Swing/Action Speed",
                "first_value": round(first_speed, 1),
                "latest_value": round(latest_speed, 1),
                "change": round(speed_change, 1),
                "change_pct": speed_pct,
                "improved": improved,
                "unit": " km/h",
                "coach_note": f"{'Nice! Speed increased' if improved else 'Speed decreased'} from {first_speed:.0f} to {latest_speed:.0f} km/h.",
            })

    # Coach summary for improvement
    coach_improvement_msg = None
    if improvement_summary:
        pct = improvement_summary["total_improvement_pct"]
        days = improvement_summary["time_span_days"]
        count = improvement_summary["total_analyses"]
        if pct > 10:
            coach_improvement_msg = f"Outstanding progress! Your technique score improved {pct}% over {days} days across {count} sessions. You're clearly putting in the work."
        elif pct > 0:
            coach_improvement_msg = f"You're on the right track — {pct}% improvement over {days} days. Keep up the consistent practice and the gains will accelerate."
        elif pct == 0:
            coach_improvement_msg = f"Your score is holding steady across {count} sessions. To break through, try focusing on one specific weakness at a time."
        else:
            coach_improvement_msg = f"Your score dipped {abs(pct)}% recently. Don't worry — this can happen when you change technique. Keep practicing the fundamentals."

    # ─── Per-dimension score history (for radar/bar charts) ───
    dimension_history = []
    for a in analyses:
        ps = a.get("performance_scores")
        if ps and ps.get("dimension_list"):
            entry = {"date": a.get("date"), "overall": ps.get("overall_score")}
            for dim in ps["dimension_list"]:
                entry[dim["key"]] = dim["score"]
            dimension_history.append(entry)

    # ─── Dimension improvement messages ───
    dimension_improvements = []
    if len(dimension_history) >= 2:
        first_dims = dimension_history[0]
        last_dims = dimension_history[-1]
        for key in first_dims:
            if key in ("date", "overall"):
                continue
            first_val = first_dims.get(key)
            last_val = last_dims.get(key)
            if first_val is not None and last_val is not None:
                change = round(last_val - first_val, 1)
                if change > 0:
                    dimension_improvements.append({
                        "dimension": key,
                        "label": key.replace("_", " ").title(),
                        "change": change,
                        "message": f"Your {key.replace('_', ' ')} improved +{change} points!"
                    })
                elif change < -0.5:
                    dimension_improvements.append({
                        "dimension": key,
                        "label": key.replace("_", " ").title(),
                        "change": change,
                        "message": f"Your {key.replace('_', ' ')} dipped {change} points. Focus on drills for this area."
                    })

    # ─── Badges ───
    earned_badges = []
    try:
        from coach_engine import calculate_badges
        earned_badges = calculate_badges(analyses)
    except Exception:
        pass

    # ─── Upload streak ───
    upload_dates = []
    for a in analyses:
        d = a.get("date", "")
        if d:
            try:
                dt = datetime.fromisoformat(d.replace("Z", "+00:00"))
                day_str = dt.strftime("%Y-%m-%d")
                if day_str not in upload_dates:
                    upload_dates.append(day_str)
            except Exception:
                pass
    current_streak = 1
    if len(upload_dates) >= 2:
        for i in range(len(upload_dates) - 1, 0, -1):
            try:
                d1 = datetime.strptime(upload_dates[i], "%Y-%m-%d")
                d2 = datetime.strptime(upload_dates[i - 1], "%Y-%m-%d")
                if (d1 - d2).days <= 7:  # weekly streak
                    current_streak += 1
                else:
                    break
            except Exception:
                break

    # Reverse to show newest first
    enriched.reverse()

    return {
        "analyses": enriched,
        "total": len(enriched),
        "trends": {
            "scores_over_time": scores_over_time,
            "dimension_history": dimension_history,
        },
        "improvement_summary": improvement_summary,
        "metric_improvements": metric_improvements,
        "dimension_improvements": dimension_improvements,
        "coach_improvement_message": coach_improvement_msg,
        "earned_badges": earned_badges,
        "upload_streak": current_streak,
    }


def _safe_metric_val(val) -> Optional[float]:
    """Extract numeric value from a metric that might be dict or scalar."""
    if val is None:
        return None
    if isinstance(val, dict):
        return val.get("mean") or val.get("max")
    if isinstance(val, (int, float)):
        return float(val)
    return None


def _extract_score(analysis: dict) -> Optional[float]:
    """Extract the numeric score from an analysis record."""
    sa = analysis.get("shot_analysis", {})
    if sa.get("score") is not None:
        try:
            return float(sa["score"])
        except (ValueError, TypeError):
            pass
    # Fallback: grade to numeric
    grade_map = {"A": 90, "B": 75, "C": 60, "D": 40, "F": 20}
    if sa.get("grade"):
        return grade_map.get(sa["grade"])
    return None


def _days_between(date_str1: str, date_str2: str) -> int:
    """Calculate days between two ISO date strings."""
    try:
        d1 = datetime.fromisoformat(date_str1.replace("Z", "+00:00"))
        d2 = datetime.fromisoformat(date_str2.replace("Z", "+00:00"))
        return abs((d2 - d1).days)
    except Exception:
        return 0


# ─── Sport Skills Route (Research Data) ───

@api_router.get("/skills/{sport}")
async def get_sport_skills(sport: str):
    """
    Return all skill areas for a sport from the research dataset.
    Includes personality tags, progression paths, drills, player profiles.
    Used by frontend for onboarding and training UI.
    """
    from research_loader import get_all_skills, get_research_sports

    available_sports = get_research_sports()
    if sport not in available_sports:
        raise HTTPException(
            status_code=404,
            detail=f"Sport '{sport}' not found in research data. Available: {available_sports}"
        )

    skills_data = get_all_skills(sport)
    return skills_data


@api_router.get("/skills/{sport}/{skill_id}")
async def get_skill_detail(sport: str, skill_id: str):
    """
    Return detailed info for a specific skill including progression path and related videos.
    """
    from research_loader import get_skill_by_id, get_skill_progression, get_videos_for_skill

    skill = get_skill_by_id(sport, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found for sport '{sport}'")

    progression = get_skill_progression(sport, skill_id)
    videos = get_videos_for_skill(sport, skill_id)

    video_list = [
        {"id": v["id"], "title": v["title"], "channel": v["channel"],
         "url": v["url"], "level": v.get("level"), "language": v.get("language"),
         "has_shorts": v.get("has_shorts"), "content_type": v.get("content_type"),
         "description": v.get("description")}
        for v in videos
    ]

    return {
        "skill": skill,
        "progression": progression,
        "videos": video_list,
    }


# ─── Sports Config Route ───

@api_router.get("/sports")
async def get_sports_config():
    """Return supported sports and their configs for the frontend."""
    from sports_config import SUPPORTED_SPORTS, MAX_SPORTS
    sports_list = [
        {"key": k, "name": v["name"], "icon": v["icon"], "color": v["color"],
         "video_analysis": v["video_analysis"],
         "play_styles": v["play_styles"], "skill_levels": v["skill_levels"]}
        for k, v in SUPPORTED_SPORTS.items()
    ]
    return {"sports": sports_list, "max_sports": MAX_SPORTS}


@api_router.post("/profile/switch-sport")
async def switch_active_sport(sport: str = "", authorization: str = Header(None)):
    """Switch the active sport on a user's profile."""
    user = await get_current_user(authorization)
    profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    selected = profile.get("selected_sports", ["badminton"])
    if sport not in selected:
        # Add it to selected_sports if it's a supported sport
        from sports_config import SUPPORTED_SPORTS
        if sport not in SUPPORTED_SPORTS:
            raise HTTPException(status_code=400, detail=f"Sport '{sport}' is not supported")
        selected.append(sport)
        await db.player_profiles.update_one(
            {"user_id": user["id"]},
            {"$set": {"selected_sports": selected}}
        )

    sp = profile.get("sports_profiles", {}).get(sport, {})
    await db.player_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "active_sport": sport,
            "skill_level": sp.get("skill_level", "Beginner"),
            "play_style": sp.get("play_style", "All-round"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {"message": f"Switched to {sport}", "active_sport": sport}


class SportQuizSubmission(BaseModel):
    sport: str
    skill_level: str
    play_style: str
    playing_frequency: str
    budget_range: str
    specific_preferences: Optional[str] = None


@api_router.post("/profile/sport-quiz")
async def submit_sport_quiz(data: SportQuizSubmission, authorization: str = Header(None)):
    """Save quiz answers for a new sport the user hasn't configured yet, add it to their profile, and switch to it."""
    user = await get_current_user(authorization)
    profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    from sports_config import SUPPORTED_SPORTS
    if data.sport not in SUPPORTED_SPORTS:
        raise HTTPException(status_code=400, detail=f"Sport '{data.sport}' is not supported")

    selected = profile.get("selected_sports", [])
    sports_profiles = profile.get("sports_profiles", {})

    # Add sport to selected_sports if not already there
    if data.sport not in selected:
        selected.append(data.sport)

    # Save the sport-specific profile from quiz answers
    sports_profiles[data.sport] = {
        "skill_level": data.skill_level,
        "play_style": data.play_style,
        "playing_frequency": data.playing_frequency,
        "budget_range": data.budget_range,
        "specific_preferences": data.specific_preferences,
        "configured_via": "equipment_quiz",
        "configured_at": datetime.now(timezone.utc).isoformat(),
    }

    # Generate strengths/focus for the new sport
    style_strengths = {
        "Power": ("Strong smashes", ["Net play finesse", "Defensive positioning"]),
        "Offensive": ("Powerful loops", ["Defense consistency", "Placement"]),
        "Baseliner": ("Strong groundstrokes", ["Net play", "Serve variety"]),
        "Control": ("Precise shot placement", ["Smash power", "Speed development"]),
        "Speed": ("Quick court coverage", ["Power shots", "Stamina building"]),
        "Defense": ("Solid defensive returns", ["Attack initiation", "Net play"]),
        "Defensive": ("Solid defensive returns", ["Attack initiation", "Spin variation"]),
        "Counter-Puncher": ("Great returning ability", ["Net approaches", "Power serving"]),
        "Soft Game": ("Excellent dink control", ["Power drives", "Serve placement"]),
        "Serve & Volley": ("Strong net presence", ["Baseline rallies", "Return of serve"]),
        "Aggressive Batsman": ("Explosive batting", ["Defensive technique", "Running between wickets"]),
        "Anchor Batsman": ("Solid technique", ["Power hitting", "Strike rotation"]),
        "Fast Bowler": ("Pace and swing", ["Spin bowling", "Economy rate"]),
        "Spin Bowler": ("Turn and flight", ["Pace variations", "Fielding"]),
        "All-rounder": ("Versatile skills", ["Specialization", "Consistency"]),
        "Speed Merchant": ("Explosive pace", ["Passing accuracy", "Defensive positioning"]),
        "Playmaker": ("Vision and passing", ["Pace", "Defensive work"]),
        "Box-to-Box": ("All-action energy", ["Final ball", "Tactical discipline"]),
        "Sprinter": ("Explosive speed", ["Endurance", "Stroke efficiency"]),
        "Distance": ("Endurance and pacing", ["Sprint finish", "Turn speed"]),
        "Fitness Swimmer": ("Consistent fitness", ["Speed", "Technique refinement"]),
    }

    s_data = style_strengths.get(data.play_style, ("Versatile play style", ["Specialization", "Shot consistency"]))
    strengths = [s_data[0]]
    focus_areas = list(s_data[1])

    if data.skill_level in ["Beginner", "Beginner+"]:
        focus_areas.append("Fundamentals practice")
    else:
        strengths.append("Good technique")

    # Switch active sport to the new one and update top-level fields
    update = {
        "selected_sports": selected,
        "sports_profiles": sports_profiles,
        "active_sport": data.sport,
        "skill_level": data.skill_level,
        "play_style": data.play_style,
        "budget_range": data.budget_range,
        "strengths": strengths,
        "focus_areas": focus_areas,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.player_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": update}
    )

    return {
        "message": f"Sport quiz completed for {data.sport}",
        "active_sport": data.sport,
        "sport_profile": sports_profiles[data.sport],
    }


# ─── Gamification: Badges & Streaks ───

BADGE_DEFINITIONS = [
    {"badge_id": "first_upload", "name": "First Upload", "icon": "upload", "description": "Uploaded your first video for analysis", "category": "milestone"},
    {"badge_id": "consistent_player", "name": "Consistent Player", "icon": "repeat", "description": "Uploaded 3+ videos for analysis", "category": "milestone"},
    {"badge_id": "streak_master", "name": "Streak Master", "icon": "flame", "description": "Maintained a 3-week upload streak", "category": "streak"},
    {"badge_id": "improving_fast", "name": "Improving Fast", "icon": "trending-up", "description": "10%+ improvement between two analyses", "category": "improvement"},
    {"badge_id": "pro_level", "name": "Pro Level", "icon": "crown", "description": "Achieved Advanced or Expert skill level", "category": "skill"},
    {"badge_id": "multi_sport", "name": "Multi-Sport Athlete", "icon": "medal", "description": "Analyzed videos in 2+ different sports", "category": "variety"},
    # Sport-specific badges
    {"badge_id": "smash_master", "name": "Smash Master", "icon": "zap", "description": "Scored 80+ on a badminton smash", "category": "sport", "sport": "badminton"},
    {"badge_id": "ace_machine", "name": "Ace Machine", "icon": "target", "description": "Scored 80+ on a tennis serve", "category": "sport", "sport": "tennis"},
    {"badge_id": "spin_wizard", "name": "Spin Wizard", "icon": "rotate-cw", "description": "Scored 80+ on a table tennis spin shot", "category": "sport", "sport": "table_tennis"},
    {"badge_id": "dink_master", "name": "Dink Master", "icon": "hand", "description": "Scored 80+ on a pickleball dink", "category": "sport", "sport": "pickleball"},
    {"badge_id": "cover_drive_king", "name": "Cover Drive King", "icon": "swords", "description": "Scored 80+ on a cricket cover drive", "category": "sport", "sport": "cricket"},
    {"badge_id": "free_kick_pro", "name": "Free Kick Pro", "icon": "goal", "description": "Scored 80+ on a football kick", "category": "sport", "sport": "football"},
    {"badge_id": "perfect_stroke", "name": "Perfect Stroke", "icon": "waves", "description": "Scored 80+ on a swimming technique", "category": "sport", "sport": "swimming"},
    {"badge_id": "five_analyses", "name": "Dedicated Learner", "icon": "book-open", "description": "Completed 5 video analyses", "category": "milestone"},
    {"badge_id": "ten_analyses", "name": "Analysis Pro", "icon": "bar-chart", "description": "Completed 10 video analyses", "category": "milestone"},
    {"badge_id": "week_warrior", "name": "Week Warrior", "icon": "calendar-check", "description": "Completed 7 days of training", "category": "training"},
    {"badge_id": "month_master", "name": "Month Master", "icon": "award", "description": "Completed 30 days of training", "category": "training"},
]

BADGE_MAP = {b["badge_id"]: b for b in BADGE_DEFINITIONS}


async def check_and_award_badges(user_id: str, analysis_record: dict = None):
    """Check all badge conditions and award any newly earned badges. Returns list of new badges."""
    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        return []

    existing_badges = profile.get("badges", [])
    existing_ids = {b["badge_id"] for b in existing_badges}
    new_badges = []
    now = datetime.now(timezone.utc).isoformat()

    # Count analyses
    analysis_count = await db.video_analyses.count_documents({"user_id": user_id})

    # First Upload
    if "first_upload" not in existing_ids and analysis_count >= 1:
        new_badges.append({"badge_id": "first_upload", **BADGE_MAP["first_upload"], "earned_date": now})

    # Consistent Player (3+)
    if "consistent_player" not in existing_ids and analysis_count >= 3:
        new_badges.append({"badge_id": "consistent_player", **BADGE_MAP["consistent_player"], "earned_date": now})

    # Dedicated Learner (5+)
    if "five_analyses" not in existing_ids and analysis_count >= 5:
        new_badges.append({"badge_id": "five_analyses", **BADGE_MAP["five_analyses"], "earned_date": now})

    # Analysis Pro (10+)
    if "ten_analyses" not in existing_ids and analysis_count >= 10:
        new_badges.append({"badge_id": "ten_analyses", **BADGE_MAP["ten_analyses"], "earned_date": now})

    # Pro Level
    if "pro_level" not in existing_ids:
        skill = profile.get("skill_level", "")
        ai_skill = profile.get("ai_skill_level", "")
        if any(s in ["Advanced", "Expert", "Elite"] for s in [skill, ai_skill]):
            new_badges.append({"badge_id": "pro_level", **BADGE_MAP["pro_level"], "earned_date": now})

    # Multi-Sport Athlete
    if "multi_sport" not in existing_ids:
        distinct_sports = await db.video_analyses.distinct("sport", {"user_id": user_id})
        if len(distinct_sports) >= 2:
            new_badges.append({"badge_id": "multi_sport", **BADGE_MAP["multi_sport"], "earned_date": now})

    # Improving Fast (10%+ improvement)
    if "improving_fast" not in existing_ids and analysis_count >= 2:
        analyses = await db.video_analyses.find(
            {"user_id": user_id}, {"_id": 0, "shot_analysis": 1}
        ).sort("date", -1).to_list(2)
        if len(analyses) >= 2:
            curr_score = _extract_score(analyses[0])
            prev_score = _extract_score(analyses[1])
            if curr_score and prev_score and prev_score > 0:
                improvement = ((curr_score - prev_score) / prev_score) * 100
                if improvement >= 10:
                    new_badges.append({"badge_id": "improving_fast", **BADGE_MAP["improving_fast"], "earned_date": now})

    # Streak Master (3 consecutive weeks of uploads)
    if "streak_master" not in existing_ids:
        upload_streak = await _calculate_upload_streak_weeks(user_id)
        if upload_streak >= 3:
            new_badges.append({"badge_id": "streak_master", **BADGE_MAP["streak_master"], "earned_date": now})

    # Sport-specific badges (score 80+ in specific sport)
    if analysis_record:
        sport = analysis_record.get("sport", "badminton")
        score = _extract_score(analysis_record)
        sport_badge_map = {
            "badminton": "smash_master",
            "tennis": "ace_machine",
            "table_tennis": "spin_wizard",
            "pickleball": "dink_master",
            "cricket": "cover_drive_king",
            "football": "free_kick_pro",
            "swimming": "perfect_stroke",
        }
        badge_id = sport_badge_map.get(sport)
        if badge_id and badge_id not in existing_ids and score and score >= 80:
            new_badges.append({"badge_id": badge_id, **BADGE_MAP[badge_id], "earned_date": now})

    # Training badges
    training_days = await db.training_progress.count_documents({"user_id": user_id})
    if "week_warrior" not in existing_ids and training_days >= 7:
        new_badges.append({"badge_id": "week_warrior", **BADGE_MAP["week_warrior"], "earned_date": now})
    if "month_master" not in existing_ids and training_days >= 30:
        new_badges.append({"badge_id": "month_master", **BADGE_MAP["month_master"], "earned_date": now})

    # Save new badges
    if new_badges:
        all_badges = existing_badges + new_badges
        await db.player_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"badges": all_badges, "updated_at": now}}
        )
        logger.info(f"Awarded {len(new_badges)} new badges to user {user_id}: {[b['badge_id'] for b in new_badges]}")

    return new_badges


async def _calculate_upload_streak_weeks(user_id: str) -> int:
    """Calculate how many consecutive weeks the user has uploaded at least one video."""
    analyses = await db.video_analyses.find(
        {"user_id": user_id}, {"_id": 0, "date": 1}
    ).sort("date", -1).to_list(100)

    if not analyses:
        return 0

    # Group by ISO week
    weeks_with_uploads = set()
    for a in analyses:
        try:
            d = datetime.fromisoformat(a["date"].replace("Z", "+00:00"))
            iso_year, iso_week, _ = d.isocalendar()
            weeks_with_uploads.add((iso_year, iso_week))
        except Exception:
            continue

    if not weeks_with_uploads:
        return 0

    # Sort weeks descending and check consecutive streak
    sorted_weeks = sorted(weeks_with_uploads, reverse=True)
    streak = 1
    for i in range(1, len(sorted_weeks)):
        prev_year, prev_week = sorted_weeks[i - 1]
        curr_year, curr_week = sorted_weeks[i]
        # Check if consecutive
        expected_week = prev_week - 1
        expected_year = prev_year
        if expected_week == 0:
            expected_week = 52
            expected_year -= 1
        if curr_year == expected_year and curr_week == expected_week:
            streak += 1
        else:
            break

    return streak


async def update_upload_streak(user_id: str):
    """Update the weekly upload streak in the player profile."""
    streak_weeks = await _calculate_upload_streak_weeks(user_id)

    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        return

    longest = max(profile.get("longest_upload_streak", 0), streak_weeks)

    await db.player_profiles.update_one(
        {"user_id": user_id},
        {"$set": {
            "current_upload_streak": streak_weeks,
            "longest_upload_streak": longest,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )


@api_router.get("/badges/{user_id}")
async def get_badges(user_id: str, authorization: str = Header(None)):
    """Get earned badges for a user."""
    if user_id == "guest":
        return {"earned_badges": [], "all_badges": [], "total_earned": 0, "total_available": 0, "current_upload_streak": 0, "longest_upload_streak": 0}
    user = await get_current_user_or_none(authorization)
    if not user:
        return {"earned_badges": [], "all_badges": [], "total_earned": 0, "total_available": 0, "current_upload_streak": 0, "longest_upload_streak": 0}
    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    earned = profile.get("badges", [])

    # Also return all available badges with earned status
    all_badges = []
    earned_ids = {b["badge_id"] for b in earned}
    for bd in BADGE_DEFINITIONS:
        badge = {**bd}
        if bd["badge_id"] in earned_ids:
            badge["earned"] = True
            earned_badge = next((b for b in earned if b["badge_id"] == bd["badge_id"]), None)
            badge["earned_date"] = earned_badge.get("earned_date") if earned_badge else None
        else:
            badge["earned"] = False
            badge["earned_date"] = None
        all_badges.append(badge)

    return {
        "earned_badges": earned,
        "all_badges": all_badges,
        "total_earned": len(earned),
        "total_available": len(BADGE_DEFINITIONS),
        "current_upload_streak": profile.get("current_upload_streak", 0),
        "longest_upload_streak": profile.get("longest_upload_streak", 0),
    }


# ─── Share System ───

@api_router.get("/share/generate-card/{analysis_id}")
async def generate_share_card(analysis_id: str, authorization: str = Header(None)):
    """Generate a shareable analysis summary card data."""
    user = await get_current_user_or_none(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to share analysis")

    analysis = await db.video_analyses.find_one(
        {"id": analysis_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    profile = await db.player_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    user_data = await db.users.find_one({"id": user["id"]}, {"_id": 0})

    shot = analysis.get("shot_analysis", {})
    sport = analysis.get("sport", "badminton")
    skill_level = analysis.get("skill_level", "Unknown")

    # Build share card data
    card = {
        "player_name": (user_data or {}).get("name", "AthlyticAI Player"),
        "sport": sport.replace("_", " ").title(),
        "skill_level": skill_level,
        "shot_name": shot.get("shot_name", shot.get("shot_type", "Analysis")),
        "grade": shot.get("grade"),
        "score": shot.get("score"),
        "date": analysis.get("date"),
        "strengths": (profile or {}).get("strengths", [])[:3],
        "play_style": (profile or {}).get("play_style", ""),
        "quick_summary": analysis.get("quick_summary", ""),
        "pro_comparison_score": (analysis.get("pro_comparison") or {}).get("overall_score"),
        "badges_count": len((profile or {}).get("badges", [])),
        "analysis_count": await db.video_analyses.count_documents({"user_id": user["id"]}),
    }

    # Build share text
    share_text_lines = [
        f"My AthlyticAI Analysis Result!",
        f"Sport: {card['sport']}",
        f"Shot: {card['shot_name']}",
    ]
    if card["grade"]:
        share_text_lines.append(f"Grade: {card['grade']}")
    if card["score"] is not None:
        share_text_lines.append(f"Score: {card['score']}/100")
    share_text_lines.append(f"Skill Level: {card['skill_level']}")
    if card["pro_comparison_score"]:
        share_text_lines.append(f"Pro Comparison: {card['pro_comparison_score']}%")
    share_text_lines.append("")
    share_text_lines.append("Analyze your game at AthlyticAI!")

    share_text = "\n".join(share_text_lines)

    return {
        "card": card,
        "share_text": share_text,
        "share_url": f"https://athlyticai.com/share/{analysis_id}",
    }


@api_router.get("/share/player-card/{user_id}")
async def generate_player_share_card(user_id: str, authorization: str = Header(None)):
    """Generate shareable player card data."""
    if user_id == "guest":
        return {"card": None, "share_text": "Check out AthlyticAI!"}
    user_obj = await get_current_user_or_none(authorization)
    if not user_obj:
        return {"card": None, "share_text": "Check out AthlyticAI!"}

    profile = await db.player_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    user_data = await db.users.find_one({"id": user_id}, {"_id": 0})
    analysis_count = await db.video_analyses.count_documents({"user_id": user_id})
    training_days = await db.training_progress.count_documents({"user_id": user_id})
    badges = profile.get("badges", [])

    card = {
        "player_name": (user_data or {}).get("name", "AthlyticAI Player"),
        "sport": (profile.get("active_sport", "badminton")).replace("_", " ").title(),
        "skill_level": profile.get("skill_level", "Unknown"),
        "play_style": profile.get("play_style", ""),
        "primary_goal": profile.get("primary_goal", ""),
        "strengths": profile.get("strengths", [])[:4],
        "focus_areas": profile.get("focus_areas", [])[:3],
        "badges_count": len(badges),
        "recent_badges": badges[-3:] if badges else [],
        "analysis_count": analysis_count,
        "training_days": training_days,
        "current_streak": profile.get("current_upload_streak", 0),
        "selected_sports": profile.get("selected_sports", []),
    }

    share_text = (
        f"My AthlyticAI Player Card\n"
        f"Sport: {card['sport']}\n"
        f"Skill: {card['skill_level']}\n"
        f"Style: {card['play_style']}\n"
        f"Badges: {card['badges_count']} earned\n"
        f"Analyses: {card['analysis_count']}\n\n"
        f"Train smarter with AthlyticAI!"
    )

    return {
        "card": card,
        "share_text": share_text,
        "share_url": f"https://athlyticai.com/card/{user_id}",
    }


# ─── Blog Data & Endpoints ───

BLOG_POSTS = [
    {
        "id": "how-to-choose-badminton-racket",
        "title": "How to Choose the Right Badminton Racket for Your Playing Style",
        "description": "Learn how to pick the perfect badminton racket based on weight, balance, string tension, and your skill level. A complete buyer's guide for all players.",
        "category": "gear",
        "sport": "badminton",
        "tags": ["badminton", "racket", "equipment", "buying guide", "gear review"],
        "published_date": "2024-11-15",
        "read_time": "7 min read",
        "thumbnail_emoji": "\U0001f3f8",
        "content": """<h2>Finding Your Perfect Badminton Racket</h2>
<p>Choosing the right badminton racket is one of the most important decisions you'll make as a player. The wrong racket can hold back your development, cause injuries, and make the game less enjoyable. This guide breaks down every factor you need to consider.</p>

<h3>1. Racket Weight: The Foundation of Your Choice</h3>
<p>Badminton rackets are classified by weight using a "U" system. The higher the U number, the lighter the racket:</p>
<ul>
<li><strong>2U (90-94g):</strong> Heavy rackets for power players. These generate massive smash speed but require strong wrists and shoulders. Best for advanced players with good technique.</li>
<li><strong>3U (85-89g):</strong> The most popular weight class. Offers a solid balance between power and maneuverability. Great for intermediate to advanced players.</li>
<li><strong>4U (80-84g):</strong> Lightweight and fast. Ideal for beginners and doubles players who need quick reactions at the net.</li>
<li><strong>5U (75-79g):</strong> Ultra-light rackets for maximum speed. Suited for defensive players and those with wrist issues.</li>
</ul>
<p><strong>Recommendation:</strong> Beginners should start with 4U or 5U rackets. As your technique and strength improve, you can move to heavier options.</p>

<h3>2. Balance Point: Head-Heavy vs. Head-Light</h3>
<p>The balance point determines where the racket's weight is concentrated:</p>
<ul>
<li><strong>Head-heavy (balance &gt;295mm):</strong> More weight in the racket head means more momentum during smashes. Players like Lin Dan famously used head-heavy rackets for their devastating attacks. The trade-off is slower recovery between shots.</li>
<li><strong>Even balance (285-295mm):</strong> A versatile option that doesn't sacrifice power or speed. Perfect for all-round players who switch between offense and defense.</li>
<li><strong>Head-light (balance &lt;285mm):</strong> Weight concentrated in the handle allows for lightning-fast drives and net play. Doubles specialists and defensive players prefer this configuration.</li>
</ul>

<h3>3. String Tension: Finding Your Sweet Spot</h3>
<p>String tension affects both power and control, but not in the way most beginners think:</p>
<ul>
<li><strong>Low tension (20-23 lbs):</strong> Creates a larger sweet spot and generates more power through a trampoline effect. Beginners and intermediate players benefit most from lower tensions.</li>
<li><strong>Medium tension (24-27 lbs):</strong> Balances power with control. You'll start to feel more precision in your shot placement at these tensions.</li>
<li><strong>High tension (28-32 lbs):</strong> Maximum control and shot precision, but the sweet spot shrinks dramatically. Only advanced players with consistent technique should use high tensions.</li>
</ul>
<p><strong>Pro tip:</strong> Don't copy professional players' string tensions. They restring rackets every few matches and have the technique to hit the tiny sweet spot consistently.</p>

<h3>4. Shaft Flexibility</h3>
<p>The shaft connects the handle to the racket head, and its flexibility affects your shots:</p>
<ul>
<li><strong>Flexible shaft:</strong> Bends more during swings, acting like a whip to generate power even with slower swing speeds. Best for beginners.</li>
<li><strong>Medium flex:</strong> Good for intermediate players transitioning to more advanced techniques.</li>
<li><strong>Stiff shaft:</strong> Transfers energy more directly, giving precise control to players with fast, technically sound swing speeds. For advanced players only.</li>
</ul>

<h3>5. Grip Size</h3>
<p>Grip size is often overlooked but affects comfort and injury prevention. Grip sizes range from G1 (largest) to G5 (smallest). Most players use G4 or G5 and add overgrips to customize thickness. Your fingers should almost touch your palm when gripping the racket.</p>

<h3>Putting It All Together</h3>
<p>Here are quick recommendations by player type:</p>
<ul>
<li><strong>Beginner:</strong> 4U or 5U, even balance, flexible shaft, 20-23 lbs tension</li>
<li><strong>Intermediate singles:</strong> 3U, head-heavy, medium flex, 24-26 lbs</li>
<li><strong>Advanced attacker:</strong> 3U or 2U, head-heavy, stiff shaft, 27-30 lbs</li>
<li><strong>Doubles specialist:</strong> 4U, head-light, medium flex, 24-26 lbs</li>
</ul>
<p>Use AthlyticAI's equipment recommendation engine to get personalized racket suggestions based on your exact playing profile, skill level, and budget.</p>"""
    },
    {
        "id": "common-badminton-mistakes-beginners",
        "title": "5 Common Badminton Mistakes Beginners Make (And How to Fix Them)",
        "description": "Avoid these 5 beginner badminton mistakes that hold players back. Learn the correct grip, footwork, clearing technique, serving form, and court positioning.",
        "category": "tips",
        "sport": "badminton",
        "tags": ["badminton", "beginner tips", "mistakes", "technique", "improvement"],
        "published_date": "2024-11-10",
        "read_time": "6 min read",
        "thumbnail_emoji": "\U0001f3f8",
        "content": """<h2>Stop Making These Beginner Badminton Mistakes</h2>
<p>Every badminton player goes through a learning curve, but some mistakes are so common that they become deeply ingrained habits if not corrected early. Here are the five most frequent errors beginners make and exactly how to fix them.</p>

<h3>Mistake 1: Using the Wrong Grip</h3>
<p>The most damaging mistake beginners make is holding the racket like a frying pan. This "panhandle grip" feels natural but severely limits your shot variety and power.</p>
<p><strong>The fix:</strong> Use the <em>basic forehand grip</em> (also called the handshake grip). Hold the racket as if you're shaking hands with it. Your thumb and index finger should form a V-shape on the narrow side of the handle. The racket face should be perpendicular to the floor, not parallel.</p>
<p>For backhand shots, rotate your thumb to press flat against the wider back surface of the handle. This gives you the leverage needed for strong backhand clears and drives.</p>
<p><strong>Drill:</strong> Practice switching between forehand and backhand grips without looking at your hand. Do this for 5 minutes daily until it becomes automatic.</p>

<h3>Mistake 2: Flat-Footed Movement</h3>
<p>Beginners often stand flat-footed and then sprint to reach the shuttle. This leads to being late on shots and poor balance when hitting.</p>
<p><strong>The fix:</strong> Stay on the balls of your feet at all times. After every shot, return to the center of the court with a "split step" — a small hop that puts you on your toes, ready to move in any direction. Your base position should have feet shoulder-width apart with knees slightly bent.</p>
<p><strong>Movement pattern:</strong> Use a lunge step to reach shots at the front of the court. For rear court shots, use a chasse (side-shuffle) step followed by a scissor kick for overhead shots. Never cross your feet while moving sideways.</p>
<p><strong>Drill:</strong> Practice shadow footwork for 10 minutes. Move to all six corners of the court and back to center without a shuttle, focusing on the split step between each movement.</p>

<h3>Mistake 3: Weak Clearing</h3>
<p>A common problem is hitting clears that don't reach the back of the opponent's court. Short clears are easy targets for smashes and put you on the defensive.</p>
<p><strong>The fix:</strong> The power in a clear comes from rotation, not arm strength. Turn your body sideways to the net with your non-racket shoulder pointing forward. As you swing, rotate your hips and shoulders together, transferring energy from your core through your arm to the racket. Contact the shuttle at the highest point you can reach.</p>
<p><strong>Key checkpoints:</strong></p>
<ul>
<li>Your elbow should lead the swing, not your wrist</li>
<li>Snap your forearm and wrist at the moment of contact</li>
<li>Follow through fully — your racket should end up on the opposite side of your body</li>
<li>Use your non-racket arm for balance by pointing it at the shuttle</li>
</ul>

<h3>Mistake 4: Incorrect Service</h3>
<p>Many beginners serve by swinging the racket like a tennis serve (overhead). In badminton, the serve must be hit below waist height, and the entire shuttle must be below the server's waist at the moment of contact.</p>
<p><strong>The fix for short serve (doubles):</strong> Hold the shuttle by the feathers at waist height. Use a gentle pushing motion with minimal backswing. The shuttle should barely clear the net and land just past the service line. Keep your wrist firm — this is a controlled push, not a hit.</p>
<p><strong>The fix for long serve (singles):</strong> Stand near the center line. Drop the shuttle and swing with an underhand motion, using wrist snap to send it high and deep to the back of the service court. The shuttle should reach near the back line.</p>

<h3>Mistake 5: Poor Court Positioning</h3>
<p>Beginners tend to stay in one spot or drift toward the net after hitting, leaving the rear court exposed.</p>
<p><strong>The fix:</strong> After every shot, return to your "base position" in the center of the court. In singles, this is roughly the center. In doubles, it shifts depending on whether you're in attack (front-back formation) or defense (side-by-side formation).</p>
<p><strong>The golden rule:</strong> Always recover to center before your opponent hits the shuttle. Watch the shuttle and your opponent simultaneously — their body position tells you where they'll hit next.</p>

<h3>Track Your Progress</h3>
<p>Upload your match videos to AthlyticAI and our AI analysis will automatically identify these technical errors and track your improvement over time.</p>"""
    },
    {
        "id": "ai-video-analysis-sports-performance",
        "title": "How AI Video Analysis Can Improve Your Sports Performance",
        "description": "Discover how AI-powered video analysis tools like AthlyticAI can break down your technique, identify weaknesses, and accelerate your improvement.",
        "category": "tutorials",
        "sport": "general",
        "tags": ["AI", "video analysis", "sports technology", "performance", "AthlyticAI"],
        "published_date": "2024-11-05",
        "read_time": "6 min read",
        "thumbnail_emoji": "\U0001f3be",
        "content": """<h2>The AI Revolution in Sports Training</h2>
<p>Professional athletes have had access to video analysis for decades. Coaches would spend hours reviewing footage, breaking down technique frame by frame. Now, artificial intelligence is making this same level of analysis available to recreational and amateur athletes at a fraction of the cost and time.</p>

<h3>What AI Video Analysis Actually Does</h3>
<p>AI sports analysis uses computer vision and machine learning to automatically detect and analyze key aspects of your performance:</p>
<ul>
<li><strong>Pose estimation:</strong> The AI tracks your body's key points (joints, limbs, head) across every frame of video. This creates a skeleton model of your movement that can be analyzed for technique flaws.</li>
<li><strong>Shot detection:</strong> AI identifies individual shots, serves, or movements within a longer video, categorizing them by type (forehand, backhand, smash, drop shot, etc.).</li>
<li><strong>Technique comparison:</strong> Your form is compared against biomechanically optimal technique, highlighting deviations that affect power, accuracy, or injury risk.</li>
<li><strong>Pattern recognition:</strong> Over multiple sessions, AI identifies patterns in your play — tendencies, strengths, weaknesses, and areas of improvement or regression.</li>
</ul>

<h3>How AthlyticAI Works</h3>
<p>AthlyticAI is built specifically for racket sports players. Here's how our AI analysis pipeline works:</p>
<ol>
<li><strong>Upload your video:</strong> Record yourself playing — a match, practice session, or even shadow practice. You can use any smartphone camera.</li>
<li><strong>AI processing:</strong> Our TensorFlow-powered engine analyzes every frame, detecting your body position, racket angle, footwork patterns, and shot timing.</li>
<li><strong>Instant feedback:</strong> Within minutes, you receive a detailed breakdown of your technique with specific, actionable suggestions for improvement.</li>
<li><strong>Progress tracking:</strong> Each analysis is saved to your profile, so you can see how your technique evolves over weeks and months of training.</li>
</ol>

<h3>Real Benefits for Real Players</h3>
<p>AI analysis isn't just a gimmick. Here's what it concretely helps with:</p>
<ul>
<li><strong>Objective feedback:</strong> Unlike a well-meaning friend, AI gives you unbiased, data-driven feedback. It measures angles, timing, and positioning with precision no human eye can match.</li>
<li><strong>Injury prevention:</strong> Poor technique is a leading cause of sports injuries. AI can spot biomechanical issues — like incorrect elbow position during a smash — before they cause pain.</li>
<li><strong>Faster improvement:</strong> Studies show that athletes who use video feedback improve 25-40% faster than those relying on feel alone. Adding AI analysis amplifies this further by highlighting the most impactful areas to work on.</li>
<li><strong>Coaching between sessions:</strong> Not everyone can afford regular coaching. AI analysis fills the gap between sessions, keeping you on track with continuous feedback.</li>
</ul>

<h3>Getting Started</h3>
<p>You don't need expensive equipment to start with AI video analysis. A smartphone mounted at court level, recording at 60fps or higher, provides enough quality for accurate analysis. Position the camera to capture your full body and at least half the court.</p>
<p>Tips for the best analysis results:</p>
<ul>
<li>Record in good lighting — outdoor courts or well-lit indoor facilities work best</li>
<li>Wear form-fitting clothing so the AI can accurately track your body position</li>
<li>Keep the camera stable (use a tripod or prop it against something solid)</li>
<li>Record from the side for technique analysis, or from behind the baseline for tactical analysis</li>
</ul>
<p>Sign up for AthlyticAI to start analyzing your game today — no coaching experience required.</p>"""
    },
    {
        "id": "table-tennis-grip-techniques-guide",
        "title": "Complete Guide to Table Tennis Grip Techniques",
        "description": "Master the shakehand and penhold grips in table tennis. Learn variations, pros and cons, and when to use each grip style for maximum performance.",
        "category": "guides",
        "sport": "table-tennis",
        "tags": ["table tennis", "grip", "technique", "shakehand", "penhold", "beginner guide"],
        "published_date": "2024-10-28",
        "read_time": "7 min read",
        "thumbnail_emoji": "\U0001f3d3",
        "content": """<h2>Table Tennis Grips: Your Foundation for Every Shot</h2>
<p>Your grip is the single most important technical decision in table tennis. It determines which shots you can play, how much spin you can generate, and even your strategic approach to the game. Unlike badminton or tennis, where grip adjustments between shots are standard, table tennis players typically commit to one grip style and build their entire game around it.</p>

<h3>The Shakehand Grip</h3>
<p>The shakehand grip is the most popular grip worldwide and dominates professional table tennis. As the name suggests, you hold the racket as if shaking hands with it.</p>
<p><strong>How to hold it:</strong></p>
<ol>
<li>Extend your hand as if offering a handshake</li>
<li>Wrap your three lower fingers (middle, ring, pinky) around the handle</li>
<li>Place your index finger on the backhand rubber, resting naturally along the bottom edge</li>
<li>Your thumb rests on the forehand rubber, opposite your index finger</li>
<li>The V between thumb and index finger should sit on top of the handle</li>
</ol>
<p><strong>Advantages:</strong></p>
<ul>
<li>Equal strength on forehand and backhand sides</li>
<li>Natural wrist flexibility for spin generation</li>
<li>Easy to learn and feels intuitive for most players</li>
<li>Dominant in modern professional play</li>
</ul>
<p><strong>Disadvantages:</strong></p>
<ul>
<li>The "crossover point" — the transition zone between forehand and backhand directly in front of your body — can be a weakness</li>
<li>Slightly less wrist snap compared to some penhold variations</li>
</ul>

<h3>Shakehand Variations</h3>
<p><strong>Deep shakehand:</strong> The hand moves deeper on the handle, with the base of the thumb resting against the blade. This provides more stability and power but slightly less wrist flexibility. Common among European players.</p>
<p><strong>Shallow shakehand:</strong> The hand sits higher on the handle, allowing the fingers more contact with the blade itself. This enables finer touch and spin but sacrifices some power. Many Asian shakehand players prefer this variation.</p>

<h3>The Penhold Grip</h3>
<p>The penhold grip originated in Asia and gets its name from the way you hold the racket — similar to holding a pen. It comes in two major variants.</p>

<h4>Chinese Penhold</h4>
<p><strong>How to hold it:</strong></p>
<ol>
<li>Place your thumb and index finger on the forehand side of the racket, pinching the blade near the handle</li>
<li>Curl your remaining three fingers on the backhand side of the blade</li>
<li>The handle points upward rather than extending from your fist</li>
</ol>
<p><strong>Advantages:</strong></p>
<ul>
<li>Exceptional forehand power and wrist snap</li>
<li>Dominant in short game and serving</li>
<li>No crossover point weakness — the forehand can cover the entire table</li>
</ul>

<h4>Japanese/Korean Penhold</h4>
<p>Similar to Chinese penhold but the three back fingers extend straight rather than curling. This variation uses a rectangular handle and is optimized for forehand-dominant play with strong looping attacks.</p>

<h4>Reverse Penhold Backhand (RPB)</h4>
<p>A modern innovation pioneered by Chinese players like Wang Hao. Instead of using only the forehand side, players flip the wrist to use the backhand rubber for backhand shots. This eliminates the traditional penhold weakness and has revitalized the grip style at the professional level.</p>

<h3>Which Grip Should You Choose?</h3>
<ul>
<li><strong>New to table tennis:</strong> Start with shakehand. It's easier to learn, more versatile, and most coaching resources assume this grip.</li>
<li><strong>Forehand-dominant player:</strong> Consider Chinese penhold if you enjoy aggressive, attacking play centered on your forehand.</li>
<li><strong>All-round player:</strong> Shakehand gives you the most balanced offense and defense on both wings.</li>
<li><strong>Already using penhold:</strong> Learn the reverse penhold backhand to shore up the traditional backhand weakness.</li>
</ul>

<h3>Common Grip Mistakes</h3>
<ul>
<li><strong>Gripping too tightly:</strong> A death grip reduces wrist flexibility and causes fatigue. Hold the racket firmly enough that it won't fly out, but loose enough to generate spin with your wrist.</li>
<li><strong>Inconsistent finger pressure:</strong> In shakehand, varying your index finger and thumb pressure between shots causes inconsistency. Find your natural resting pressure and maintain it.</li>
<li><strong>Ignoring the grip in training:</strong> Periodically check your grip during practice. Bad habits creep in when you're focused on other aspects of your game.</li>
</ul>
<p>Track your technique development with AthlyticAI's video analysis — our AI can detect grip-related technique issues in your uploaded match footage.</p>"""
    },
    {
        "id": "analyze-tennis-serve-step-by-step",
        "title": "How to Analyze Your Tennis Serve: A Step-by-Step Guide",
        "description": "Break down your tennis serve technique with this step-by-step analysis guide. Cover toss, stance, swing path, follow-through, and common serving errors.",
        "category": "tutorials",
        "sport": "tennis",
        "tags": ["tennis", "serve", "technique analysis", "tutorial", "improvement"],
        "published_date": "2024-10-20",
        "read_time": "7 min read",
        "thumbnail_emoji": "\U0001f3be",
        "content": """<h2>Breaking Down the Tennis Serve</h2>
<p>The serve is the most complex stroke in tennis and the only shot where you have complete control. A strong serve can dominate matches; a weak one gives your opponent free points. This guide teaches you how to analyze each phase of your serve to identify and fix problems.</p>

<h3>Phase 1: The Stance</h3>
<p>Your starting position sets up everything that follows.</p>
<p><strong>What to check:</strong></p>
<ul>
<li><strong>Foot position:</strong> Your front foot should point toward the right net post (for right-handers). Your back foot is roughly parallel to the baseline, shoulder-width apart from the front foot.</li>
<li><strong>Weight distribution:</strong> Start with weight slightly on your front foot (about 60/40). Many players make the mistake of leaning back from the start.</li>
<li><strong>Grip:</strong> Use the continental grip (hammer grip). The base knuckle of your index finger sits on the second bevel of the handle. This grip allows you to hit flat, slice, and kick serves without changing your hold.</li>
<li><strong>Relaxation:</strong> Your shoulders should be down and relaxed. Tension in the shoulders is the number one cause of serving inconsistency.</li>
</ul>

<h3>Phase 2: The Toss</h3>
<p>The toss is where most serve problems originate. An inconsistent toss makes consistent serving impossible.</p>
<p><strong>What to check:</strong></p>
<ul>
<li><strong>Toss arm:</strong> Release the ball from your fingertips (not your palm) with a straight arm. The lifting motion should come from your shoulder, not your elbow or wrist.</li>
<li><strong>Toss height:</strong> The ball should reach about 6 inches above the maximum height of your extended racket. Too high gives the ball time to drift; too low rushes your swing.</li>
<li><strong>Toss placement:</strong> For a flat serve, the toss should be slightly in front and to the right of your hitting shoulder (for right-handers). For a slice serve, further right. For a kick serve, slightly behind and to the left.</li>
<li><strong>Consistency test:</strong> Toss 10 balls without hitting them. They should all land in roughly the same spot — about 12 inches in front of your front foot inside the baseline.</li>
</ul>

<h3>Phase 3: The Trophy Position</h3>
<p>This is the loaded position right before you swing forward — named because it looks like a trophy statue.</p>
<p><strong>What to check:</strong></p>
<ul>
<li><strong>Racket arm:</strong> Elbow should be at or above shoulder height. The racket hangs behind your back with the tip pointing down (the "racket drop").</li>
<li><strong>Body coil:</strong> Your shoulders should be turned sideways to the net, creating a coil that stores energy for the swing. Your hips should also be turned but less than the shoulders — this differential is what creates rotational power.</li>
<li><strong>Knee bend:</strong> Both knees should be bent, loading your legs like springs. This is where you generate upward force for height and power.</li>
</ul>

<h3>Phase 4: The Swing and Contact</h3>
<p><strong>What to check:</strong></p>
<ul>
<li><strong>Kinetic chain:</strong> Power should flow from legs (push up) to hips (rotate) to shoulders (rotate) to arm (extend) to wrist (snap). If any link is missing, you lose power and stress the remaining joints.</li>
<li><strong>Contact point:</strong> You should contact the ball at full arm extension, slightly in front of your body. Film yourself from the side — the contact point should be at roughly 1 o'clock on an imaginary clock face above your head.</li>
<li><strong>Pronation:</strong> At contact, your forearm naturally rotates inward (like turning a doorknob). This pronation is what gives flat and slice serves their speed and direction. Don't force it — let it happen naturally from proper swing path.</li>
</ul>

<h3>Phase 5: Follow-Through</h3>
<p><strong>What to check:</strong></p>
<ul>
<li>The racket should finish on the left side of your body (for right-handers), not in front</li>
<li>You should land inside the baseline on your front foot</li>
<li>Your body should be facing the net, ready to move for the return</li>
<li>A short, choppy follow-through indicates you're decelerating before contact — wasting potential power</li>
</ul>

<h3>Common Serving Errors</h3>
<ul>
<li><strong>Waiter's tray:</strong> The racket face opens up behind your back instead of dropping edge-first. This causes the serve to float and removes the possibility of pronation.</li>
<li><strong>Rushing:</strong> Not completing the trophy position before swinging. Usually caused by a toss that's too low.</li>
<li><strong>Falling away:</strong> Leaning sideways instead of moving up and into the court. This reduces power and makes placement inconsistent.</li>
</ul>
<p>Use AthlyticAI to record and analyze your serve. Our AI will track your body mechanics across all five phases and highlight specific areas for improvement.</p>"""
    },
    {
        "id": "best-badminton-shoes-guide",
        "title": "Best Badminton Shoes in 2024: What to Look For",
        "description": "A complete guide to choosing badminton shoes. Learn about cushioning, grip, ankle support, weight, and what features matter most for court performance.",
        "category": "gear",
        "sport": "general",
        "tags": ["badminton", "shoes", "gear", "equipment", "buying guide", "court shoes"],
        "published_date": "2024-10-12",
        "read_time": "6 min read",
        "thumbnail_emoji": "\U0001f45f",
        "content": """<h2>Why Badminton Shoes Matter More Than You Think</h2>
<p>Playing badminton in running shoes or casual sneakers is one of the most common mistakes recreational players make. Badminton involves explosive lateral movements, sudden stops, jumps, and lunges — all on hard court surfaces. The wrong shoes increase your injury risk dramatically and limit your movement speed on court.</p>

<h3>Key Features to Look For</h3>

<h4>1. Grip and Traction</h4>
<p>This is the most important feature. Badminton shoes use gum rubber outsoles specifically designed for indoor court surfaces. These soles provide maximum grip on wooden and synthetic courts without leaving marks.</p>
<p><strong>What to check:</strong></p>
<ul>
<li>Look for a non-marking gum rubber outsole (usually translucent or light-colored)</li>
<li>The tread pattern should have multi-directional grooves for lateral stability</li>
<li>A radial pattern on the forefoot helps with pivoting during shots</li>
<li>Avoid shoes with deep lugs designed for outdoor surfaces — these reduce court contact area</li>
</ul>

<h4>2. Cushioning</h4>
<p>Badminton involves constant jumping and landing. Good cushioning absorbs impact and reduces stress on your knees, ankles, and lower back.</p>
<p><strong>What to check:</strong></p>
<ul>
<li>Look for shoes with dedicated cushioning systems in the heel and forefoot</li>
<li>EVA foam is the minimum standard; higher-end shoes use proprietary technologies like Yonex's Power Cushion or Li-Ning's Bounse</li>
<li>Press the midsole with your thumb — it should compress and spring back, not feel rock-hard or mushy</li>
<li>Heavier players need more cushioning; lighter players can prioritize responsiveness</li>
</ul>

<h4>3. Ankle Support</h4>
<p>Ankle sprains are the most common badminton injury. Your shoes play a critical role in prevention.</p>
<ul>
<li><strong>Low-cut shoes:</strong> Maximum mobility and lighter weight, but less ankle support. Best for experienced players with strong ankles.</li>
<li><strong>Mid-cut shoes:</strong> A compromise that provides reasonable ankle support without sacrificing too much agility. Good for most players.</li>
<li><strong>High-cut shoes:</strong> Maximum ankle protection. Recommended for players recovering from ankle injuries or those who play on slippery courts.</li>
</ul>
<p>Regardless of shoe height, look for a firm heel counter (the hard piece at the back of the shoe). It should resist twisting when you squeeze it from the sides.</p>

<h4>4. Weight</h4>
<p>Lighter shoes allow faster movement but may sacrifice cushioning and support. Most badminton shoes weigh between 250-350 grams per shoe.</p>
<ul>
<li><strong>Lightweight (&lt;280g):</strong> For speed-focused players who prioritize quick footwork</li>
<li><strong>Standard (280-320g):</strong> Best balance of performance features for most players</li>
<li><strong>Supportive (&gt;320g):</strong> Extra cushioning and support, good for longer sessions and heavier players</li>
</ul>

<h4>5. Fit and Comfort</h4>
<ul>
<li>Your toes should have about a thumb's width of space in front</li>
<li>The shoe should be snug around the midfoot — not tight, but no sliding</li>
<li>Try shoes on in the afternoon when feet are slightly swollen from the day</li>
<li>Wear your playing socks when trying shoes on</li>
<li>Walk, lunge, and do a small jump in the store to test comfort</li>
</ul>

<h4>6. Court Type Considerations</h4>
<ul>
<li><strong>Wooden courts:</strong> Standard gum rubber outsoles work best</li>
<li><strong>Synthetic/PVC courts:</strong> Look for slightly softer rubber compounds that grip well on these surfaces</li>
<li><strong>Cement/concrete (outdoor):</strong> You'll need shoes with harder, more durable outsoles. Some brands offer outdoor-specific court shoes</li>
</ul>

<h3>How Often to Replace Badminton Shoes</h3>
<p>Even the best shoes wear out. Replace your badminton shoes when:</p>
<ul>
<li>The outsole tread is visibly worn down (especially under the ball of the foot)</li>
<li>You notice less grip on court or start sliding during lunges</li>
<li>The midsole feels flat and no longer cushions impacts</li>
<li>The heel counter has softened and no longer holds your heel firmly</li>
</ul>
<p>For regular players (2-3 times per week), expect to replace shoes every 6-12 months.</p>

<h3>Budget Considerations</h3>
<p>You don't need the most expensive shoes to play well. Mid-range badminton shoes ($50-80) from brands like Yonex, Li-Ning, Victor, and Asics offer excellent performance for most players. Premium shoes ($80-150+) provide marginal improvements in cushioning and weight that matter more at competitive levels.</p>
<p>Use AthlyticAI's equipment recommendations to find shoes that match your playing style and budget.</p>"""
    },
    {
        "id": "how-to-use-athlyticai-training-progress",
        "title": "How to Use AthlyticAI to Track Your Training Progress",
        "description": "A step-by-step walkthrough of using AthlyticAI to upload videos, get AI analysis, read your performance data, and set training goals effectively.",
        "category": "tutorials",
        "sport": "general",
        "tags": ["AthlyticAI", "tutorial", "training", "progress tracking", "app guide"],
        "published_date": "2024-10-05",
        "read_time": "5 min read",
        "thumbnail_emoji": "\U0001f4f1",
        "content": """<h2>Getting the Most Out of AthlyticAI</h2>
<p>AthlyticAI is designed to be your AI-powered training companion. Whether you play badminton, tennis, or table tennis, the app helps you track progress, get personalized equipment recommendations, and improve your game with structured training plans. Here's how to use every feature effectively.</p>

<h3>Step 1: Set Up Your Player Profile</h3>
<p>When you first sign up, AthlyticAI asks you a series of questions to build your player profile:</p>
<ul>
<li><strong>Sport selection:</strong> Choose your primary sport(s). You can add multiple sports and switch between them.</li>
<li><strong>Skill level:</strong> Be honest about your current level (beginner, intermediate, advanced). This determines the difficulty of your training plans and the type of equipment recommended.</li>
<li><strong>Playing style:</strong> Aggressive, defensive, all-round? This helps tailor recommendations to how you actually play.</li>
<li><strong>Playing frequency:</strong> How often you play affects training plan intensity and equipment wear recommendations.</li>
<li><strong>Budget:</strong> Equipment recommendations are filtered to match your spending comfort zone.</li>
</ul>
<p>Your profile can be updated anytime as your game develops. We recommend revisiting it every few months.</p>

<h3>Step 2: Upload and Analyze Videos</h3>
<p>The Analyze feature is the heart of AthlyticAI. Here's how to get the best results:</p>
<ol>
<li>Navigate to the <strong>Analyze</strong> tab from the dashboard</li>
<li>Click <strong>Upload Video</strong> and select a video from your phone or camera</li>
<li>The AI will process your video, detecting body positions, shot types, and movement patterns</li>
<li>Review your analysis report, which includes frame-by-frame technique breakdown</li>
</ol>
<p><strong>Tips for best results:</strong></p>
<ul>
<li>Record in landscape mode at 60fps or higher for smoother analysis</li>
<li>Position the camera at court level, about 3-4 meters from the sideline</li>
<li>Ensure good lighting — the AI needs to see your body clearly</li>
<li>Record full rallies, not just individual shots, for tactical analysis</li>
</ul>

<h3>Step 3: Follow Your Training Plan</h3>
<p>AthlyticAI generates personalized 30-day training plans based on your profile and analysis results.</p>
<ul>
<li>Each plan includes daily exercises, drills, and focus areas</li>
<li>Mark sessions as complete to track your progress streak</li>
<li>The plan adapts based on your improvement areas identified by video analysis</li>
<li>Consistency matters more than intensity — aim to complete at least 4 sessions per week</li>
</ul>

<h3>Step 4: Track Your Progress</h3>
<p>The Progress page shows your development over time:</p>
<ul>
<li><strong>Training streak:</strong> How many consecutive days you've completed sessions</li>
<li><strong>Sessions completed:</strong> Total training sessions logged</li>
<li><strong>Technique scores:</strong> AI-rated scores for different aspects of your game</li>
<li><strong>Improvement trends:</strong> Graphs showing how your metrics change over weeks</li>
</ul>

<h3>Step 5: Get Equipment Recommendations</h3>
<p>Based on your playing profile and skill level, AthlyticAI recommends equipment that matches your game:</p>
<ul>
<li>Rackets matched to your playing style, skill level, and budget</li>
<li>Shoes suited to your movement patterns and court type</li>
<li>Strings and accessories optimized for your game</li>
<li>Price comparisons across major retailers to find the best deals</li>
</ul>

<h3>Step 6: Create and Share Highlights</h3>
<p>AthlyticAI can automatically generate highlight reels from your match videos:</p>
<ul>
<li>The AI identifies exciting rallies, winning shots, and impressive plays</li>
<li>Highlights are compiled into shareable clips</li>
<li>Share directly to social media or download for your records</li>
</ul>

<h3>Step 7: Join the Community</h3>
<p>Connect with other players, share tips, and find training partners through the Community feature. Compare your player card stats, challenge friends, and stay motivated together.</p>
<p>The key to improvement is consistency. Use AthlyticAI regularly — upload videos weekly, follow your training plan daily, and review your progress monthly. Small, consistent improvements compound into dramatic results over time.</p>"""
    },
    {
        "id": "table-tennis-spin-guide-beginners",
        "title": "Beginner's Guide to Table Tennis Spin: Topspin, Backspin & Sidespin",
        "description": "Learn the mechanics of topspin, backspin, and sidespin in table tennis. Includes drills, grip adjustments, and common mistakes to avoid for beginners.",
        "category": "training",
        "sport": "table-tennis",
        "tags": ["table tennis", "spin", "topspin", "backspin", "sidespin", "technique", "drills"],
        "published_date": "2024-09-28",
        "read_time": "8 min read",
        "thumbnail_emoji": "\U0001f3d3",
        "content": """<h2>Understanding Spin in Table Tennis</h2>
<p>Spin is what separates table tennis from every other racket sport. The ball is light, the rubber is grippy, and the distances are short — creating conditions where spin dominates every aspect of play. A player who masters spin controls the table; a player who ignores spin will always struggle against competent opponents.</p>

<h3>The Physics of Spin</h3>
<p>When you brush the ball with your rubber, friction between the rubber surface and the ball creates rotation. This rotation affects the ball's trajectory through the air (the Magnus effect) and, critically, how it bounces off your opponent's rubber.</p>
<p><strong>Key principle:</strong> When a spinning ball contacts your rubber, the spin reverses. A topspin ball coming at you will kick downward off your rubber if you just block it. A backspin ball will pop up. Understanding this is fundamental to returning spin effectively.</p>

<h3>Topspin</h3>
<p>Topspin is the most important spin to learn. The ball rotates forward (top of the ball moving in the direction of travel), causing it to dip downward and accelerate off the bounce.</p>
<p><strong>How to generate topspin:</strong></p>
<ol>
<li>Start your stroke below the ball with a slightly closed (angled forward) racket face</li>
<li>Brush upward and forward against the back of the ball</li>
<li>The contact should be thin — you're brushing the ball, not hitting through it</li>
<li>Follow through upward, finishing with your racket near forehead height</li>
<li>Use your wrist to snap through the contact for extra rotation</li>
</ol>
<p><strong>Forehand topspin drill:</strong> Have a partner feed backspin balls to your forehand. Start close to the table and focus on the brushing motion. Aim to clear the net by just 2-3 inches — heavy topspin will bring the ball down onto the table. Do sets of 20 balls, focusing on consistency before power.</p>
<p><strong>Common mistake:</strong> Hitting through the ball instead of brushing it. If you hear a loud "thwack" contact, you're hitting flat. Topspin should produce a quieter, brushing sound.</p>

<h3>Backspin</h3>
<p>Backspin (also called underspin or chop) makes the ball rotate backward, causing it to float through the air and stay low after bouncing. It's the foundation of defensive play and essential for effective pushing and chopping.</p>
<p><strong>How to generate backspin:</strong></p>
<ol>
<li>Start your stroke above the ball with an open (angled backward) racket face</li>
<li>Brush downward and forward under the ball</li>
<li>Keep the contact thin — slice under the ball like spreading butter</li>
<li>Follow through forward and slightly downward</li>
<li>Keep your wrist stable for consistent backspin on pushes</li>
</ol>
<p><strong>Backspin push drill:</strong> Practice pushing with a partner, both players using backspin. Keep the ball low over the net (no more than 2 inches clearance). Count how many consecutive pushes you can maintain. Target: 20+ in a row with consistent, heavy backspin.</p>
<p><strong>Common mistake:</strong> Pushing with a flat racket face. If your pushes pop up high, you're not getting under the ball enough. Open the racket face more and focus on a downward brushing motion.</p>

<h3>Sidespin</h3>
<p>Sidespin makes the ball curve laterally through the air and kick sideways off the bounce. It's most commonly used in serves and is a powerful weapon for wrong-footing opponents.</p>
<p><strong>How to generate sidespin:</strong></p>
<ol>
<li>Contact the side of the ball rather than the top or bottom</li>
<li>For right sidespin: brush from left to right across the ball</li>
<li>For left sidespin: brush from right to left across the ball</li>
<li>Sidespin is often combined with topspin or backspin for complex serves</li>
</ol>
<p><strong>Sidespin serve drill:</strong> Practice a pendulum serve: hold the ball in your open palm, toss it up 6 inches, and swing your racket like a pendulum across the ball. Alternate between left and right sidespin. Aim for the ball to curve visibly in the air.</p>

<h3>Reading Your Opponent's Spin</h3>
<p>Generating spin is only half the equation. You must also read your opponent's spin to return it effectively:</p>
<ul>
<li><strong>Watch the racket angle:</strong> The direction the racket moves at contact tells you the spin type</li>
<li><strong>Watch the contact:</strong> Thick contact (loud) means less spin; thin contact (quiet) means heavy spin</li>
<li><strong>Watch the ball's logo:</strong> If you can see the ball's logo spinning clearly, there's less spin. A blur means heavy spin.</li>
<li><strong>Trust the bounce:</strong> Use the first bounce to confirm the spin type, then adjust for the second bounce</li>
</ul>

<h3>Practice Progression</h3>
<ol>
<li><strong>Week 1-2:</strong> Master consistent topspin and backspin in isolation</li>
<li><strong>Week 3-4:</strong> Practice transitioning between topspin and backspin in rallies</li>
<li><strong>Week 5-6:</strong> Add sidespin serves to your game</li>
<li><strong>Week 7-8:</strong> Work on reading and returning different spins</li>
</ol>
<p>Upload your practice sessions to AthlyticAI to track your spin technique development and get AI-powered feedback on your brushing angles and contact quality.</p>"""
    },
    {
        "id": "why-athletes-need-training-plan",
        "title": "Why Every Athlete Needs a Training Plan (And How to Create One)",
        "description": "Learn why structured training plans are essential for athletic improvement. Covers periodization basics, goal setting, and using AI to build your plan.",
        "category": "training",
        "sport": "general",
        "tags": ["training plan", "periodization", "goal setting", "improvement", "structured training"],
        "published_date": "2024-09-20",
        "read_time": "6 min read",
        "thumbnail_emoji": "\U0001f4cb",
        "content": """<h2>The Case for Structured Training</h2>
<p>Most recreational athletes train the same way every session: show up, play some games, go home. While this approach is fun, it's one of the slowest paths to improvement. Research consistently shows that athletes who follow structured training plans improve 2-3 times faster than those who don't.</p>

<h3>Why Random Practice Doesn't Work</h3>
<p>Playing matches is excellent for applying skills, but it's terrible for developing them. Here's why:</p>
<ul>
<li><strong>No repetition focus:</strong> In a match, you might hit 5 backhand clears all night. That's not enough repetition to improve the stroke. Deliberate practice requires hundreds of focused repetitions.</li>
<li><strong>No progressive overload:</strong> Your body and skills adapt to the demands placed on them. If you always play at the same level, you plateau. A training plan progressively increases difficulty.</li>
<li><strong>No recovery planning:</strong> Training without rest leads to overuse injuries and burnout. Structured plans build in recovery days and lighter weeks.</li>
<li><strong>No weakness targeting:</strong> In matches, you naturally avoid your weaknesses. Training plans force you to work on the areas that need the most improvement.</li>
</ul>

<h3>The Basics of Periodization</h3>
<p>Periodization is the systematic planning of athletic training. It divides your training into cycles, each with a specific focus.</p>

<h4>Macrocycle (3-12 months)</h4>
<p>Your overall training period, usually aligned with a competitive season or a major goal. Example: "I want to improve from intermediate to advanced in badminton over the next 6 months."</p>

<h4>Mesocycle (2-6 weeks)</h4>
<p>A training block with a specific focus within the macrocycle. Example: "Weeks 1-4: Focus on footwork and court coverage. Weeks 5-8: Focus on attacking shots."</p>

<h4>Microcycle (1 week)</h4>
<p>Your weekly training schedule. This is where you plan specific sessions. A sample weekly microcycle for an intermediate badminton player might look like:</p>
<ul>
<li><strong>Monday:</strong> Footwork drills + shadow practice (45 min)</li>
<li><strong>Tuesday:</strong> Net play practice + short serve training (60 min)</li>
<li><strong>Wednesday:</strong> Rest or light stretching</li>
<li><strong>Thursday:</strong> Clear and smash drills (60 min)</li>
<li><strong>Friday:</strong> Match play — apply new skills in games (90 min)</li>
<li><strong>Saturday:</strong> Fitness training — agility, core strength (45 min)</li>
<li><strong>Sunday:</strong> Rest</li>
</ul>

<h3>How to Create Your Training Plan</h3>

<h4>Step 1: Assess Your Current Level</h4>
<p>Before planning where to go, know where you are. Rate yourself honestly on key aspects of your sport. In badminton, that might be: clear technique (7/10), net play (4/10), footwork (5/10), smash (6/10), serve (8/10). Your lowest scores are your biggest opportunities for improvement.</p>

<h4>Step 2: Set Specific Goals</h4>
<p>Vague goals like "get better" don't work. Use the SMART framework:</p>
<ul>
<li><strong>Specific:</strong> "Improve my backhand clear to consistently reach the back court"</li>
<li><strong>Measurable:</strong> "8 out of 10 clears should land past the back service line"</li>
<li><strong>Achievable:</strong> Based on your current level and available practice time</li>
<li><strong>Relevant:</strong> Aligned with your overall playing goals</li>
<li><strong>Time-bound:</strong> "Achieve this within 4 weeks"</li>
</ul>

<h4>Step 3: Plan Your Sessions</h4>
<p>Each training session should have a clear structure:</p>
<ol>
<li><strong>Warm-up (10 min):</strong> Dynamic stretching and light hitting</li>
<li><strong>Skill focus (30 min):</strong> Deliberate practice on your target skill</li>
<li><strong>Game application (15 min):</strong> Modified games that force you to use the practiced skill</li>
<li><strong>Cool-down (5 min):</strong> Static stretching and reflection</li>
</ol>

<h4>Step 4: Track and Adjust</h4>
<p>A plan is only as good as your adherence and adaptation. Track completed sessions, record how drills feel, and adjust difficulty as you improve. If a drill becomes easy, make it harder. If you're consistently failing, simplify.</p>

<h3>Using AI to Build Better Plans</h3>
<p>AthlyticAI automates much of this process. Based on your player profile, video analysis results, and progress data, the app generates personalized 30-day training plans that adapt to your improvement. Each plan includes daily sessions with specific drills, video tutorials, and progress milestones.</p>
<p>The AI also identifies when you're plateauing and suggests new drills or focus areas to break through. It's like having a coach who's always analyzing your data and adjusting your program.</p>
<p>Start your first structured training plan today on AthlyticAI — it takes less than 5 minutes to set up and can accelerate your improvement dramatically.</p>"""
    },
    {
        "id": "create-match-highlights-sports-videos",
        "title": "How to Create Match Highlights from Your Sports Videos",
        "description": "Learn how to create professional-looking highlight reels from your sports match videos using AI. Tips for recording, editing, and sharing your best moments.",
        "category": "tutorials",
        "sport": "general",
        "tags": ["highlights", "video editing", "match recording", "sharing", "social media"],
        "published_date": "2024-09-12",
        "read_time": "5 min read",
        "thumbnail_emoji": "\U0001f3ac",
        "content": """<h2>Capturing and Sharing Your Best Sporting Moments</h2>
<p>Every athlete has moments they wish they had on camera — a perfect smash, an impossible save, a rally that had everyone watching. Match highlights aren't just for professionals anymore. With a smartphone and the right tools, you can create highlight reels that capture your best plays and share them with friends, coaches, or social media.</p>

<h3>Why Match Highlights Matter</h3>
<ul>
<li><strong>Motivation:</strong> Watching your best plays builds confidence and reminds you of your progress during tough training periods.</li>
<li><strong>Learning:</strong> Reviewing highlights helps you understand what you did right so you can replicate it. It's just as valuable as analyzing mistakes.</li>
<li><strong>Sharing:</strong> Share your achievements with friends, family, and your sports community. Highlights are more engaging than full match footage.</li>
<li><strong>Coaching:</strong> Send highlights to your coach to show progress or to get feedback on specific plays.</li>
<li><strong>Memory:</strong> Years from now, you'll love having a collection of your best sporting moments captured on video.</li>
</ul>

<h3>Recording Tips for Better Highlights</h3>
<p>The quality of your highlights depends on the quality of your recording. Follow these tips:</p>

<h4>Camera Positioning</h4>
<ul>
<li>Place your phone at court level on a tripod or stable surface</li>
<li>Position it at mid-court, about 3-4 meters from the sideline for the best angle</li>
<li>Landscape orientation is essential — vertical video loses too much court coverage</li>
<li>Make sure the entire court (or at least your half) is visible in the frame</li>
</ul>

<h4>Camera Settings</h4>
<ul>
<li>Record at 60fps if your phone supports it. This makes slow-motion replays much smoother</li>
<li>Use 1080p resolution as a minimum. 4K is better but uses more storage</li>
<li>Turn off auto-focus if possible — the constant refocusing can make footage unusable</li>
<li>Ensure adequate lighting. Indoor courts often need the camera's exposure manually adjusted</li>
</ul>

<h4>Practical Tips</h4>
<ul>
<li>Charge your phone fully or use a power bank — recording drains battery fast</li>
<li>Free up at least 5GB of storage before recording</li>
<li>Start recording before the match begins and stop after it ends. It's easier to trim than to miss key moments</li>
<li>Ask a friend to hold the camera if you want dynamic angles (following the play)</li>
</ul>

<h3>How AthlyticAI Creates Highlights Automatically</h3>
<p>Manually editing highlights from a 30-60 minute match video is time-consuming. AthlyticAI automates this process using AI:</p>
<ol>
<li><strong>Upload your full match video</strong> through the Analyze tab</li>
<li><strong>AI detection:</strong> Our computer vision model identifies every rally, shot, and point in the video. It detects shot types (smashes, drops, clears), rally length, and winning shots.</li>
<li><strong>Automatic scoring:</strong> Each rally is scored based on factors like rally length, shot variety, winning shot quality, and dramatic moments (close net exchanges, diving saves, etc.)</li>
<li><strong>Highlight compilation:</strong> The top-scoring rallies are compiled into a highlight reel, typically 2-5 minutes long from a full match</li>
<li><strong>Review and customize:</strong> You can add or remove specific rallies from the highlight reel before finalizing</li>
</ol>

<h3>Sharing Your Highlights</h3>
<p>Once your highlights are ready, sharing is simple:</p>
<ul>
<li><strong>WhatsApp:</strong> Share directly with your playing group or friends</li>
<li><strong>Instagram Reels/Stories:</strong> Highlight reels are perfectly sized for social media</li>
<li><strong>YouTube:</strong> Upload longer highlight compilations for your channel</li>
<li><strong>AthlyticAI Community:</strong> Share with other players on the platform and see their highlights too</li>
</ul>

<h3>Tips for Better Highlights</h3>
<ul>
<li><strong>Focus on variety:</strong> A good highlight reel shows different types of winning shots, not just smashes</li>
<li><strong>Include context:</strong> Show enough of the rally leading up to the winning shot so viewers understand the setup</li>
<li><strong>Keep it short:</strong> 2-3 minutes is the sweet spot. Longer compilations lose viewer attention</li>
<li><strong>Add slow-motion:</strong> AthlyticAI can slow down key moments for dramatic effect</li>
</ul>
<p>Start creating your match highlights today — upload your next match video to AthlyticAI and let AI find your best moments automatically.</p>"""
    },
    {
        "id": "increase-badminton-smash-speed",
        "title": "How to Increase Your Badminton Smash Speed: 10 Pro Tips",
        "description": "Learn 10 proven techniques to add power and speed to your badminton smash. From grip to wrist snap, master the fundamentals used by pros like Lee Chong Wei and Viktor Axelsen.",
        "category": "tips",
        "sport": "badminton",
        "tags": ["badminton smash", "badminton power", "smash technique", "badminton training"],
        "published_date": "2026-04-12",
        "read_time": "9 min read",
        "thumbnail_emoji": "\U0001f3f8",
        "content": """<h2>Unleashing the Most Powerful Shot in Badminton</h2>
<p>The smash is badminton's signature weapon. Tan Boon Heong once hit a smash recorded at 493 km/h, and even club players can comfortably push 200+ km/h with the right technique. Speed doesn't come from brute force; it comes from a chain of small, correct movements. Here are 10 tips, in the order you should work on them, to make your smash faster and harder.</p>

<h3>1. Master Your Grip (Especially the Thumb Release)</h3>
<p>Hold the racket with a basic forehand grip, like shaking hands with it. The most common beginner mistake is squeezing the handle all the way through the swing. Instead, keep the grip relaxed until the moment of contact, then squeeze hard. That sudden tightening is what transfers energy into the shuttle. If your forearm is sore after a session, your grip is too tight for too long.</p>

<h3>2. Get Behind and Under the Shuttle</h3>
<p>You can't smash a shuttle that's above or in front of you. Use quick chasse steps or a scissor-kick jump to position yourself so the shuttle is slightly in front and above your hitting shoulder. Watch Viktor Axelsen — he is almost always behind the shuttle before he even thinks about smashing.</p>

<h3>3. Use Full Body Rotation, Not Just Your Arm</h3>
<p>Power flows from the ground up: legs drive, hips rotate, shoulders rotate, arm whips, wrist snaps. Try this drill: stand side-on to the net, point your non-racket hand at the shuttle, then rotate your whole torso through the shot. If your feet didn't move and your hips didn't turn, you're arming the shot.</p>

<h3>4. The Non-Racket Arm Matters</h3>
<p>Your non-racket arm is a counterweight. Raise it and point at the shuttle during the preparation phase, then pull it down sharply as you swing. This pulling action rotates your shoulders faster, adding 10-15% to your racket head speed for free.</p>

<h3>5. Wrist Snap and Forearm Pronation</h3>
<p>This is the single biggest secret to a fast smash. At the moment of contact, your forearm pronates (rotates inward) and your wrist flicks forward. It's not a "wrist smash" in isolation — it's a pronation snap. Practice shadow swings in front of a mirror, focusing on the forearm rotating like you're turning a doorknob at the top.</p>

<h3>6. Hit the Shuttle Flat and Downward</h3>
<p>A smash should travel in a steep downward line. If the shuttle is floating flat, you're hitting it too late or your contact point is too low. Aim to contact the shuttle as high as you can reach, and angle the racket face slightly downward at impact.</p>

<h3>7. Strength Training for Smash Power</h3>
<p>You can't separate technique from physical capacity. Add these to your weekly routine:</p>
<ul>
<li><strong>Medicine ball slams</strong> (3 x 10) — mimic the whole-body smash chain</li>
<li><strong>Rotational cable chops</strong> (3 x 12 each side) — hip and core rotation</li>
<li><strong>Wrist curls and reverse wrist curls</strong> (3 x 15) — forearm strength for wrist snap</li>
<li><strong>Box jumps</strong> (3 x 8) — explosive leg drive for jump smashes</li>
</ul>

<h3>8. Shadow Smash Drill (Daily)</h3>
<p>Stand in your backcourt without a shuttle. Do 3 sets of 15 shadow smashes focusing on: (1) getting behind the shuttle with chasse steps, (2) non-racket arm pointing up, (3) rotating the torso, (4) pronating the forearm, (5) landing with a scissor kick. Technique burned into muscle memory beats random hitting every time.</p>

<h3>9. Fix Your Common Mistakes on Video</h3>
<p>Most players have no idea what their smash actually looks like. Film yourself from the side and compare with a pro on YouTube. Use our <a href="/analyze?sport=badminton">free AI video analyzer</a> to automatically detect issues like late contact point, no hip rotation, or locked wrist — it tells you exactly what to fix.</p>

<h3>10. Smash Less, Place More</h3>
<p>Ironically, the fastest path to a faster smash is hitting fewer of them. Rally until the shuttle is high, slightly in front, and you've moved into position. A 280 km/h smash from a bad position is worse than a 220 km/h smash perfectly placed on your opponent's backhand corner. Speed without placement is vanity; placement with speed wins matches.</p>

<h2>Putting It All Together</h2>
<p>Work on these in order: grip, positioning, rotation, non-racket arm, wrist snap. Spend two weeks on each before moving on. Film every session, compare to the previous week, and let your <a href="/training">training plan</a> track your progress. Within 6-8 weeks, most players see a 15-25% jump in smash speed — and more importantly, fewer injuries from bad mechanics.</p>

<p>Ready to check your smash form? Upload a video to our <a href="/analyze?sport=badminton">AI analyzer</a> and get personalized feedback in under 60 seconds.</p>"""
    },
    {
        "id": "best-badminton-rackets-under-3000",
        "title": "Best Badminton Rackets Under Rs 3000 in 2026 (Tested and Reviewed)",
        "description": "The 7 best budget badminton rackets under Rs 3000 in India for 2026. Honest reviews, pros and cons, and who each racket is best for.",
        "category": "gear",
        "sport": "badminton",
        "tags": ["badminton racket", "budget gear", "India", "buying guide", "equipment"],
        "published_date": "2026-04-12",
        "read_time": "10 min read",
        "thumbnail_emoji": "\U0001f3f8",
        "content": """<h2>Great Badminton Rackets Don't Have to Be Expensive</h2>
<p>Walking into a sports shop in India, you'll see badminton rackets ranging from Rs 500 to Rs 20,000. The good news: the Rs 1,500-3,000 sweet spot has never been better. Today's budget rackets use full graphite frames, decent string beds, and balanced designs that would have cost twice as much five years ago. Here are the 7 best picks for 2026, tested across club-level play.</p>

<h3>1. Yonex Nanoray Light 18i (Rs 1,800-2,200)</h3>
<p><strong>Best for:</strong> Beginners and doubles players.</p>
<p>A 77-gram (5U) head-light racket that's extremely easy to swing. The flexible shaft is forgiving, so even slow swings generate decent shuttle speed. It's the most-sold budget Yonex in India for a reason — it just works.</p>
<ul>
<li><strong>Pros:</strong> Very light, great maneuverability, durable T-joint</li>
<li><strong>Cons:</strong> Limited smash power, not ideal for singles attackers</li>
</ul>

<h3>2. Li-Ning G-Force Superlite 3900 (Rs 2,400-2,800)</h3>
<p><strong>Best for:</strong> Intermediate all-round players.</p>
<p>At 79 grams with even balance, this racket is shockingly good for the price. Li-Ning's G-Force series uses the same graphite blend as their more expensive rackets, just with a simpler paint job. The 30 lbs string tolerance means it can grow with you.</p>
<ul>
<li><strong>Pros:</strong> Excellent all-round performance, high tension capacity</li>
<li><strong>Cons:</strong> Stock string is mediocre — replace it for full potential</li>
</ul>

<h3>3. Victor Auraspeed 9 (Rs 2,700-3,000)</h3>
<p><strong>Best for:</strong> Fast doubles players.</p>
<p>Victor's aero-frame design actually slices through the air, making drives and flat pushes noticeably quicker. Head-light at 84g, it excels in front-court exchanges.</p>
<ul>
<li><strong>Pros:</strong> Superb handling for doubles, quality build</li>
<li><strong>Cons:</strong> Less effective for singles smashers</li>
</ul>

<h3>4. Yonex Arcsaber Lite (Rs 2,500-2,900)</h3>
<p><strong>Best for:</strong> Control-focused players.</p>
<p>An isometric head and even balance make this an accurate, predictable racket. It won't win power contests but shot placement feels dialed in. Great for players who win with deception rather than speed.</p>
<ul>
<li><strong>Pros:</strong> Precise, forgiving sweet spot</li>
<li><strong>Cons:</strong> Underwhelming power</li>
</ul>

<h3>5. Li-Ning Turbo Charging 75 Instinct (Rs 2,600-2,900)</h3>
<p><strong>Best for:</strong> Intermediate attackers on a budget.</p>
<p>This is the cheapest genuinely head-heavy racket that doesn't feel like a brick. 3U weight with a stiff-medium shaft means if you have decent technique, you can generate real smash power. It is the budget attacker's dream.</p>
<ul>
<li><strong>Pros:</strong> Real head-heavy smash feel, stiff enough to reward good technique</li>
<li><strong>Cons:</strong> Demanding for beginners, wrist fatigue possible</li>
</ul>

<h3>6. Yonex Muscle Power 29 Light (Rs 1,900-2,300)</h3>
<p><strong>Best for:</strong> First-time buyers upgrading from aluminum.</p>
<p>Full graphite, extremely durable, 84 grams, flexible shaft. It's not exciting, but if you're buying your first real racket, it's the safest choice in the category. You won't outgrow it for at least a year.</p>
<ul>
<li><strong>Pros:</strong> Bulletproof durability, great value</li>
<li><strong>Cons:</strong> Unremarkable once your level improves</li>
</ul>

<h3>7. Victor Drive X 7K (Rs 2,800-3,000)</h3>
<p><strong>Best for:</strong> Intermediate players wanting a do-everything racket.</p>
<p>Even balance, medium flex, 4U weight, 30 lbs tension tolerance. It attacks well, defends well, and feels premium in hand. If we had to recommend one racket to an intermediate player blindly, this would be it.</p>
<ul>
<li><strong>Pros:</strong> Balanced, premium feel, high tension ceiling</li>
<li><strong>Cons:</strong> None at this price point</li>
</ul>

<h2>What to Look For When Buying</h2>
<ul>
<li><strong>Full graphite construction:</strong> Avoid aluminum or "graphite composite" under Rs 2,000</li>
<li><strong>String tension rating:</strong> Should handle at least 26 lbs</li>
<li><strong>T-joint:</strong> Must be seamless — cracked T-joints are the #1 cause of budget racket failure</li>
<li><strong>Restringing:</strong> Replace stock strings after 20-30 hours with BG65 or similar (Rs 300-400 job)</li>
</ul>

<h3>Counterfeits Are a Real Problem</h3>
<p>India has a massive market for fake Yonex and Li-Ning rackets. Always buy from authorized dealers or platforms like Decathlon, Khelmart, or the official brand websites. A Rs 1,200 "Yonex Astrox 99" on a random online store is always fake.</p>

<p>Once you've got your racket, compare your performance over time with our <a href="/progress">progress tracker</a>, or get personalized gear suggestions through the <a href="/equipment">equipment page</a>.</p>"""
    },
    {
        "id": "tennis-serve-speed-tips",
        "title": "Tennis Serve Speed: How to Hit a Faster Serve (Complete Guide)",
        "description": "Increase your tennis serve speed with proven mechanics, drills, and training tips. Learn the techniques used by pros to hit serves over 200 km/h.",
        "category": "tips",
        "sport": "tennis",
        "tags": ["tennis serve", "serve technique", "tennis tips", "tennis training"],
        "published_date": "2026-04-12",
        "read_time": "9 min read",
        "thumbnail_emoji": "\U0001f3be",
        "content": """<h2>The Serve Is the Most Important Shot in Tennis</h2>
<p>It's the only shot where you have full control — no opponent dictates it. A faster, more reliable serve means free points, shorter rallies, and massive confidence. Isner, Raonic, and Opelka built entire careers on their serves. You don't need to hit 230 km/h to benefit, but adding even 15 km/h to your average serve transforms your game.</p>

<h3>1. Start With the Right Grip</h3>
<p>Use the Continental grip (the "hammer grip"), not Eastern forehand. Many club players serve with a forehand grip because it feels natural, but it locks out pronation — the single biggest source of serve power. Hold the racket like an axe; the V between thumb and index finger should sit on the top-left bevel.</p>

<h3>2. Nail the Toss (Seriously)</h3>
<p>A bad toss is the #1 reason serves stall. The ideal toss for a flat serve lands slightly in front of you and to your right (for a righty), about 30-45 cm inside the baseline. Release the ball with an open palm, not with your fingers. Toss height should be at the top of your reach with the racket fully extended — no higher. Practice tossing 50 times a day against a wall without even swinging.</p>

<h3>3. Use the Trophy Pose Correctly</h3>
<p>At the top of your windup, you should look like a classic trophy: knees bent, racket dropped behind your head, non-racket arm pointing at the toss, shoulders coiled. If you skip this position, you're arming the serve.</p>

<h3>4. Leg Drive: The Engine of a Fast Serve</h3>
<p>Top pros get 30-40% of their serve speed from their legs. Bend your knees deeply during the toss and explode upward as you swing. You should leave the ground on a proper first serve. Drill: serve a bucket of balls from a dead stop, then serve another bucket with explosive leg drive. The speed difference will shock you.</p>

<h3>5. Shoulder-Over-Shoulder Rotation</h3>
<p>This is often called "cartwheeling" the shoulders. As you swing up, your non-racket shoulder goes down and your racket shoulder goes up — rotating around your spine. This transfers angular momentum into the racket head.</p>

<h3>6. Pronation: The Real Power Source</h3>
<p>Forearm pronation — the rotation that turns the palm from facing you to facing away — is what actually accelerates the racket head at contact. Without pronation, even perfect leg drive can't produce speed. Drill: stand at the service line, hold the racket at the trophy pose, and practice throwing the racket head up at the ball using only pronation. No full swing — just feel the rotation.</p>

<h3>7. Contact Point: High and Out in Front</h3>
<p>Contact should be at or near your maximum reach, with the ball slightly in front of your body. Low contact means you're slapping the ball down and losing speed. Film yourself from the side and check — your contact point should be the highest point of the entire motion.</p>

<h3>8. Relaxation = Speed</h3>
<p>Counterintuitive but true: tense muscles are slow muscles. Elite servers are loose until the split-second of contact. If you feel your shoulder tightening during the windup, restart the motion. Shake out your arm before each serve.</p>

<h2>Common Mistakes That Kill Serve Speed</h2>
<ul>
<li><strong>Arming the serve:</strong> Using only the arm without legs or rotation. Fix: start the motion from the ground up.</li>
<li><strong>Pushing instead of swinging:</strong> Trying to steer the ball. Fix: commit to a full, fast swing.</li>
<li><strong>Low toss:</strong> Forces a rushed, chopped motion. Fix: toss higher and more in front.</li>
<li><strong>Locked wrist:</strong> Blocks pronation. Fix: practice wrist-snap drills isolated from the full motion.</li>
<li><strong>No follow-through:</strong> The racket should end up near the left hip (for righties), not stopped at the shoulder.</li>
</ul>

<h2>Training Drills to Add 15-20 km/h</h2>
<ol>
<li><strong>Medicine ball throws (3 x 10):</strong> Overhead slam throws mimic the serve chain</li>
<li><strong>Service box targets:</strong> Set up cones in the corners of the service box and hit 50 serves to each</li>
<li><strong>Kneeling serve drill:</strong> Serve from your knees to isolate the upper-body motion — forces proper shoulder rotation and pronation</li>
<li><strong>Radar gun feedback:</strong> Pocket radar guns (Rs 15,000-20,000) give immediate feedback. No gun? Use our <a href="/analyze?sport=tennis">AI serve analyzer</a> to estimate speed and mechanics from video.</li>
</ol>

<h2>Realistic Expectations</h2>
<p>A club player averaging 140 km/h can realistically reach 170-180 km/h in 3 months of focused work. Women's club players can gain 15-25 km/h. Past that point, gains slow dramatically and depend on strength training and years of refinement. Don't chase pro speeds — chase reliability first. A consistent 160 km/h first serve beats an erratic 190 km/h serve every single match.</p>

<p>Record your next practice session and upload to our <a href="/analyze?sport=tennis">free AI analyzer</a> — it'll pinpoint exactly which phase of your serve needs work.</p>"""
    },
    {
        "id": "table-tennis-forehand-vs-backhand",
        "title": "Table Tennis Forehand vs Backhand: Which Should You Master First?",
        "description": "Forehand or backhand — which side should you develop first in table tennis? A breakdown of technique, tactics, and a training plan for each shot.",
        "category": "tips",
        "sport": "table_tennis",
        "tags": ["table tennis", "ping pong", "forehand", "backhand", "technique"],
        "published_date": "2026-04-12",
        "read_time": "8 min read",
        "thumbnail_emoji": "\U0001f3d3",
        "content": """<h2>The Classic Dilemma for New Table Tennis Players</h2>
<p>You've got limited practice time. Should you pour it into perfecting your forehand loop, or build a rock-solid backhand first? The answer depends on your playing style, your age, and what kind of player you want to become. Here's the full breakdown.</p>

<h3>The Case for Forehand First</h3>
<p>Most Chinese coaches teach forehand first, and for good reason: the forehand is capable of higher speed and heavier spin than the backhand for the vast majority of players. Ma Long, widely considered the greatest of all time, won most of his career points with a forehand loop from the middle of the table.</p>
<p>A strong forehand gives you:</p>
<ul>
<li><strong>Match-ending power:</strong> Forehand loops can generate 2-3x the racket head speed of backhands</li>
<li><strong>Bigger coverage area:</strong> Skilled players cover 70% of the table with their forehand</li>
<li><strong>Spin variety:</strong> Forehand can produce heavier topspin, sidespin, and combinations</li>
</ul>

<h3>The Case for Backhand First</h3>
<p>The European school (think Timo Boll) traditionally emphasizes a balanced, backhand-first game. Here's why it's tempting:</p>
<ul>
<li><strong>Easier to learn:</strong> The backhand has a shorter, simpler motion</li>
<li><strong>More consistent in rallies:</strong> Beginners struggle to footwork around every ball to use forehand</li>
<li><strong>Essential for receive:</strong> A weak backhand means your opponent targets it every point</li>
<li><strong>Modern game demands it:</strong> Today's game has shifted — backhand banana flicks and over-the-table backhand loops are now elite weapons</li>
</ul>

<h2>Our Recommendation: Backhand Foundation, Forehand Weapon</h2>
<p>For most club players, the best approach is:</p>
<ol>
<li><strong>Months 1-2:</strong> Build a consistent backhand drive and backhand push. These are the shots you'll use in 60% of rallies at beginner level.</li>
<li><strong>Months 2-4:</strong> Introduce the forehand topspin loop. This is your weapon shot — the one that wins points.</li>
<li><strong>Months 4-6:</strong> Combine both with footwork, learning when to step around your backhand to hit a forehand (the "pivot").</li>
</ol>

<h3>Forehand Technique Breakdown</h3>
<p>The forehand topspin loop:</p>
<ul>
<li><strong>Stance:</strong> Right foot slightly back (for righties), knees bent, weight on balls of feet</li>
<li><strong>Backswing:</strong> Rotate hips and shoulders back, racket drops below table level for heavy topspin</li>
<li><strong>Swing:</strong> Rotate hips forward first, then shoulders, then arm. Brush up and forward on the ball.</li>
<li><strong>Contact:</strong> Hit the top-back of the ball with a thin brush for maximum spin</li>
<li><strong>Follow through:</strong> Racket finishes near your left ear (for righties)</li>
</ul>

<h3>Backhand Technique Breakdown</h3>
<p>The backhand drive (your foundation shot):</p>
<ul>
<li><strong>Stance:</strong> Square to the table, elbow slightly in front of body</li>
<li><strong>Backswing:</strong> Small — racket comes back to about belly-button level</li>
<li><strong>Swing:</strong> Elbow stays as a pivot, forearm snaps forward, wrist adds final acceleration</li>
<li><strong>Contact:</strong> Meet the ball at the peak of its bounce, slightly in front of your body</li>
<li><strong>Follow through:</strong> Short — racket ends pointing at your target</li>
</ul>

<h2>When to Use Each Shot</h2>
<p>Use the <strong>forehand</strong> when:</p>
<ul>
<li>The ball is in the middle or right side of your court (righty)</li>
<li>You have time to set up and transfer weight</li>
<li>You want to end the point with a powerful loop</li>
<li>The opponent serves a long ball to your forehand side</li>
</ul>
<p>Use the <strong>backhand</strong> when:</p>
<ul>
<li>The ball is to your backhand corner and you don't have time to pivot</li>
<li>In fast over-the-table exchanges (banana flick receives, backhand-to-backhand rallies)</li>
<li>Serving short to set up a forehand-pivot third ball attack</li>
<li>Defending blocks and counter-drives at high speed</li>
</ul>

<h2>Training Split for Fast Improvement</h2>
<p>In a 1-hour practice session:</p>
<ul>
<li>10 min warm-up (easy backhand-to-backhand rallies)</li>
<li>15 min backhand drills (consistency, then push, then drive)</li>
<li>15 min forehand drills (topspin loop against block)</li>
<li>15 min footwork combining both (figure-8 drill, falkenberg drill)</li>
<li>5 min serves</li>
</ul>

<p>Film a few rallies and run them through our <a href="/analyze?sport=table_tennis">AI table tennis analyzer</a> — it'll show you which side you're actually using in matches (vs. which side you think you're using). Often there's a big gap. Pair that with a <a href="/training">structured training plan</a> for fastest progress.</p>

<h2>The Real Answer</h2>
<p>Don't ask which to master first. Build backhand consistency so you can survive rallies, then develop forehand power so you can win them. You need both, but the order matters: survive first, thrive second.</p>"""
    },
    {
        "id": "badminton-footwork-guide",
        "title": "The Complete Guide to Badminton Footwork (With Drills)",
        "description": "Master badminton footwork with this complete guide covering 6-corner movement, split step, recovery, and the best drills to improve court coverage.",
        "category": "tips",
        "sport": "badminton",
        "tags": ["badminton footwork", "court coverage", "badminton drills", "movement"],
        "published_date": "2026-04-12",
        "read_time": "10 min read",
        "thumbnail_emoji": "\U0001f3f8",
        "content": """<h2>Footwork Wins Badminton Matches</h2>
<p>Ask any coach what separates club players from competitive players, and they'll say the same thing: footwork. You can have the best smash in the city, but if you can't get to the shuttle in position, you'll lose to players with weaker strokes and better movement. This guide covers everything you need to build pro-level footwork.</p>

<h3>The Base Position (Home Position)</h3>
<p>Every rally starts and resets here: roughly in the center of the court, about one step behind the short service line. Stand with feet shoulder-width apart, knees bent, weight on the balls of your feet, racket held up in front of you. You should feel springy — ready to explode in any direction.</p>

<h3>The Split Step: Your Most Important Move</h3>
<p>The split step is a small hop you make the moment your opponent hits the shuttle. You land with knees bent, on the balls of your feet, ready to push off. This tiny movement pre-loads your muscles so your first step is 20-30% faster than from a static stance. Every pro does this on every shot — miss it, and you're always late.</p>

<h3>The 6 Corners of the Court</h3>
<p>Badminton footwork is organized around 6 positions you must cover:</p>
<ol>
<li>Forehand rear (deep, attacking corner)</li>
<li>Backhand rear (the "weak" corner everyone targets)</li>
<li>Forehand mid-court (side)</li>
<li>Backhand mid-court (side)</li>
<li>Forehand net</li>
<li>Backhand net</li>
</ol>
<p>Your job: reach any corner in 2-3 steps from the base position, play the shot, and recover back to base before your opponent hits again.</p>

<h2>Movement Techniques by Corner</h2>

<h3>Forehand Rear (Smash Corner)</h3>
<p>Use a <strong>chasse step</strong> turn: pivot on your right foot, bring your left foot back, then push off with a scissor-kick jump. Land on the opposite foot you jumped from. This is the standard movement for jumping smashes.</p>

<h3>Backhand Rear</h3>
<p>This is the trickiest corner. Most beginners try to reach around with a backhand — it's a guaranteed weak shot. Instead, turn your body using a pivot step: rotate 180 degrees, run to the corner, and hit a forehand round-the-head shot. Pros use this 90% of the time.</p>

<h3>Mid-Court Sides</h3>
<p>One or two chasse steps are enough. Keep your racket up and ready — these shots usually become drives or pushes.</p>

<h3>Net Shots</h3>
<p>The <strong>lunge</strong> is your primary move. Push off your back foot, extend your front foot forward into a long lunge (racket-side foot forward), bend the front knee deeply but never past your toes. Get your racket hand out early. Push off the front foot to recover.</p>

<h2>Recovery: The Forgotten Half</h2>
<p>Moving to the shuttle is only half the job. Recovery — getting back to base position — is what lets you handle the next shot. After every stroke:</p>
<ol>
<li>Push off with purpose (don't drift back)</li>
<li>Move back at an angle that anticipates your opponent's likely reply</li>
<li>Arrive at base position before they strike</li>
<li>Execute the split step again</li>
</ol>

<h2>Essential Footwork Drills</h2>

<h3>1. Shadow 6-Corner Drill (No Shuttle)</h3>
<p>Coach or partner calls out corners; you move to each with proper technique and recover. Start at 20 seconds, build to 60 seconds. Focus on form, not speed.</p>

<h3>2. Multi-Shuttle Feeding</h3>
<p>Partner stands on the other side and feeds shuttles rapidly to specific corners. You hit and recover. Build up to 30-shuttle sets.</p>

<h3>3. Shadow Badminton</h3>
<p>Imagine a full rally — move as if playing points for 60 seconds. Do 5-8 sets. This builds the endurance your footwork needs.</p>

<h3>4. Line Touches</h3>
<p>Classic conditioning: sprint from baseline to each line and back. 10 reps at match pace. Not sexy, but it builds the engine.</p>

<h3>5. Ladder Drills</h3>
<p>Agility ladders develop foot speed, coordination, and ankle stability. Do 10-15 minutes of in-and-outs, lateral shuffles, and ickey shuffles 3 times per week.</p>

<h3>6. Skipping Rope</h3>
<p>Boxers are the best footwork athletes in sports, and every one of them skips rope. 5-10 minutes daily builds calf strength, rhythm, and split-step quickness.</p>

<h2>Common Footwork Mistakes</h2>
<ul>
<li><strong>Flat feet:</strong> Standing on your heels kills reaction time. Always be on the balls of your feet.</li>
<li><strong>Crossing feet:</strong> Crossing your legs when moving laterally is slow and unbalanced. Use chasse steps.</li>
<li><strong>No recovery:</strong> Staying where you hit the shot leaves huge gaps. Always move back.</li>
<li><strong>Reaching instead of moving:</strong> Lazy players lean for the shuttle. Pros move their feet into position so they can hit balanced shots.</li>
<li><strong>Ignoring the split step:</strong> The single biggest cause of "I'm always late" problems.</li>
</ul>

<h2>How AI Can Help</h2>
<p>Footwork is hard to self-correct because you can't see yourself. Upload a match video to our <a href="/analyze?sport=badminton">AI analyzer</a> — it tracks your court position, time to reach corners, and recovery patterns. Most club players are shocked when they realize how rarely they actually return to base position.</p>

<p>Add a dedicated footwork session to your <a href="/training">weekly training plan</a>. Twenty minutes, three times a week, will outperform hours of unfocused rally practice within two months.</p>"""
    },
    {
        "id": "ai-sports-training-2026",
        "title": "How AI Is Changing Sports Training in 2026",
        "description": "A look at how AI is transforming sports training in 2026 — from video analysis and biomechanics to personalized coaching for amateurs.",
        "category": "ai",
        "sport": "general",
        "tags": ["AI sports", "sports technology", "video analysis", "future of sports", "coaching"],
        "published_date": "2026-04-12",
        "read_time": "9 min read",
        "thumbnail_emoji": "\U0001f916",
        "content": """<h2>The Coaching Revolution Is Already Here</h2>
<p>Five years ago, AI in sports was mostly hype: vague "analytics dashboards" for pro teams and not much for the rest of us. In 2026, that's changed dramatically. AI tools now give amateur athletes feedback that would have required a personal coach and a biomechanics lab a decade ago. Here's what's actually happening on the ground in 2026.</p>

<h3>Computer Vision Goes Mainstream</h3>
<p>The biggest leap has been in pose estimation. Models like MediaPipe, OpenPose, and the newer transformer-based trackers can now extract 30+ body landmarks from a phone video at 60 fps on a mid-range laptop. Once you know where an athlete's joints are at every frame, you can calculate shoulder rotation, knee angles, hip velocity — all the things that used to require motion-capture suits.</p>
<p>This is the engine behind services like AthlyticAI: you shoot a video with your phone, upload it, and within 30 seconds you get back specific, actionable feedback on your technique. No studio, no sensors, no $20,000 setup.</p>

<h3>Personalized Training Plans Built by LLMs</h3>
<p>Large language models have quietly become incredible at structuring training plans. Given your skill level, training history, injuries, goals, and weekly availability, an LLM can generate a 4-week plan that rivals what a good coach would produce — and update it weekly based on your feedback. This is not a replacement for elite coaching, but for the 99% of amateur athletes who've never worked with a coach, it's a massive upgrade from "doing whatever drills I saw on YouTube."</p>

<h3>Real-Time Feedback via Edge AI</h3>
<p>Smart glasses and phone holders with on-device AI can now give you coaching prompts during practice — not after. "Your elbow dropped on that backhand." "Toss was 15 cm behind you." "Recovery to base was 0.3 seconds slow." This is the closest thing to having a coach watching every rep.</p>

<h3>Injury Prevention Through Movement Screening</h3>
<p>Perhaps the most impactful use of sports AI isn't performance — it's injury prevention. Movement screening apps detect asymmetries, mobility limitations, and load imbalances before they become injuries. Physical therapy clinics now routinely use AI screening for ACL return-to-play protocols, and amateur athletes can run similar screens at home.</p>

<h2>Real-World Examples From the Pro World</h2>
<ul>
<li><strong>Tennis:</strong> ATP's Hawk-Eye system now powers real-time stroke analytics. Players see serve speed trends, rally length distributions, and return-depth heatmaps at every changeover.</li>
<li><strong>Football (soccer):</strong> Clubs use AI vision to track every player's positioning for 90 minutes, generating data sets that would have taken a team of analysts weeks to produce.</li>
<li><strong>Basketball:</strong> The NBA's player-tracking system feeds into shot-quality models that estimate the expected value of every attempt — information that's now filtering down to college and high school programs.</li>
<li><strong>Golf:</strong> Launch monitors combined with AI swing analysis give club golfers club-fitting and lesson-quality feedback from their garage.</li>
</ul>

<h2>What's Different for Amateurs in 2026</h2>
<p>The shift from "pro-only tools" to "anyone with a phone" is the real story. A decade ago, if you wanted biomechanics feedback on your badminton smash, you needed a sports science department. Today, you film the rally and upload it. The analysis isn't quite as detailed as a lab report, but it's 95% as useful for 0.1% of the cost.</p>
<p>At AthlyticAI, we designed our analyzer around this principle: the right feedback at the right time beats perfect feedback you never see. You upload a video, you get three things you can fix this week, and you come back next week with a new video to check progress. That feedback loop — not fancy graphics — is what creates improvement.</p>

<h2>The Honest Limitations</h2>
<p>AI in sports isn't magic. A few things it still doesn't do well:</p>
<ul>
<li><strong>Tactical judgment:</strong> AI can tell you your forehand loop has low brush contact, but it won't tell you that you should have played a drop instead of a smash in that moment.</li>
<li><strong>Emotional coaching:</strong> Motivation, handling pressure, dealing with slumps — human coaches still dominate here.</li>
<li><strong>Video quality dependence:</strong> Poor lighting, bad angles, and crowded backgrounds degrade analysis quality.</li>
<li><strong>Subjective preferences:</strong> There are multiple "correct" techniques, and the best model for you depends on body type, style, and level — AI sometimes flattens this into one "ideal."</li>
</ul>

<h2>What's Coming Next</h2>
<p>Three trends to watch over the next 18 months:</p>
<ol>
<li><strong>Multi-athlete comparison:</strong> AI models that can compare your technique against a specific pro (not just an abstract "ideal") and explain differences</li>
<li><strong>Sport-specific foundation models:</strong> Rather than generic pose estimation, specialized models trained on millions of hours of tennis, badminton, or table tennis video</li>
<li><strong>Federated feedback:</strong> Your AI coach learning from the whole user base's improvements — spotting what actually works for people like you</li>
</ol>

<h2>How to Use AI Without Losing the Plot</h2>
<p>A few tips for integrating AI tools into your training:</p>
<ul>
<li>Film one session a week, not every session — avoid analysis paralysis</li>
<li>Focus on the top 2-3 issues the AI flags, ignore the rest</li>
<li>Re-measure after 2-3 weeks to see if changes stuck</li>
<li>Keep playing for joy. AI is a tool, not the game.</li>
</ul>

<p>Curious what your technique looks like through AI eyes? Upload a 30-second clip to our <a href="/analyze">free analyzer</a> — no account needed. You'll see exactly what AI sports coaching feels like in 2026.</p>"""
    },
    {
        "id": "7-day-badminton-training-plan-intermediate",
        "title": "7-Day Badminton Training Plan for Intermediate Players",
        "description": "A complete day-by-day 7-day badminton training plan for intermediate players. Covers footwork, strokes, fitness, and recovery with specific drills.",
        "category": "training",
        "sport": "badminton",
        "tags": ["badminton training", "training plan", "intermediate", "drills", "schedule"],
        "published_date": "2026-04-12",
        "read_time": "10 min read",
        "thumbnail_emoji": "\U0001f3f8",
        "content": """<h2>Structured Practice Beats Random Rallies</h2>
<p>Most intermediate players are stuck not because they don't play enough but because they play unstructured. You show up, rally for an hour, play a few games, and go home. This 7-day plan fixes that by organizing your week around specific technical, physical, and tactical goals. It assumes you can train roughly 1-2 hours per day and have access to a court 4-5 times per week.</p>

<h3>Who This Plan Is For</h3>
<ul>
<li>You have basic strokes (clear, drop, smash, net shot) but they're inconsistent</li>
<li>Your footwork needs work — you're often late to the shuttle</li>
<li>You play local club or league level and want to break through</li>
<li>You're injury-free and can do 4-5 sessions per week</li>
</ul>

<h2>Day 1 (Monday) — Footwork and Fitness Base</h2>
<p><strong>Goal:</strong> Build the engine. 75 minutes.</p>
<ul>
<li>10 min warm-up: jogging, dynamic stretches, skipping</li>
<li>15 min shadow 6-corner footwork: 6 sets of 45 seconds on, 30 seconds rest</li>
<li>15 min multi-shuttle: partner feeds 30 shuttles to random corners, you recover between each</li>
<li>20 min on-court conditioning: line touches, split-step drills, defensive lunges</li>
<li>10 min cooldown: static stretching, calf release, hip mobility</li>
</ul>

<h2>Day 2 (Tuesday) — Stroke Technique Day</h2>
<p><strong>Goal:</strong> Clean up your strokes without fatigue interfering. 90 minutes.</p>
<ul>
<li>10 min warm-up</li>
<li>20 min clear drills: straight clears, cross-court clears, 30 of each with a partner</li>
<li>20 min drop shot drills: fast drops, slow drops, from forehand and backhand rear court</li>
<li>20 min net shot drills: tight net shots, net kills, spinning net drops</li>
<li>15 min smash drills: half-court smashes (easier to repeat), full-court smashes with defense</li>
<li>5 min cooldown</li>
</ul>

<h2>Day 3 (Wednesday) — Recovery and Strength</h2>
<p><strong>Goal:</strong> Get stronger off-court. 60 minutes, no court needed.</p>
<ul>
<li>10 min warm-up</li>
<li>Strength circuit (3 rounds):
<ul>
<li>10 goblet squats</li>
<li>10 medicine ball slams</li>
<li>10 single-leg glute bridges per side</li>
<li>15 wrist curls each direction</li>
<li>12 reverse lunges per side</li>
<li>30-second plank</li>
</ul>
</li>
<li>10 min core work: Russian twists, dead bugs, bird dogs</li>
<li>10 min mobility: hips, shoulders, ankles</li>
</ul>

<h2>Day 4 (Thursday) — Match Simulation</h2>
<p><strong>Goal:</strong> Apply technique under pressure. 90 minutes.</p>
<ul>
<li>10 min warm-up</li>
<li>15 min half-court singles: forces lateral footwork and consistency</li>
<li>20 min constraint games: only smashes and drops allowed / only cross-court shots / net-only rallies</li>
<li>30 min full matches: play 2-3 games to 21, focus on implementing what you worked on Day 2</li>
<li>10 min video review: film one game and watch it back (30 seconds at a time) to spot issues</li>
<li>5 min cooldown</li>
</ul>

<h2>Day 5 (Friday) — Technical Fix Day</h2>
<p><strong>Goal:</strong> Work on the issues you found Thursday. 75 minutes.</p>
<ul>
<li>10 min warm-up</li>
<li>30 min targeted drills: whatever you identified as weak yesterday (e.g., backhand clear, defensive blocks)</li>
<li>20 min multi-shuttle focused on that weakness</li>
<li>10 min serve practice: 30 low serves to each target, 15 high serves</li>
<li>5 min cooldown</li>
</ul>

<h2>Day 6 (Saturday) — Competitive Play</h2>
<p><strong>Goal:</strong> Play real matches. 90-120 minutes.</p>
<ul>
<li>15 min warm-up and stroke knock-up</li>
<li>60-90 min doubles or singles matches against varied opponents</li>
<li>Between games: review one thing you did well, one thing to fix</li>
<li>10 min cooldown</li>
</ul>

<h2>Day 7 (Sunday) — Active Recovery</h2>
<p><strong>Goal:</strong> Let the body adapt. 30-45 minutes.</p>
<ul>
<li>20 min easy cardio: walking, cycling, swimming</li>
<li>15 min full-body stretching</li>
<li>10 min video analysis of Saturday's matches using our <a href="/analyze?sport=badminton">AI analyzer</a></li>
</ul>

<h2>How to Progress Weekly</h2>
<ul>
<li><strong>Weeks 1-2:</strong> Focus on form. Do every drill slowly and correctly.</li>
<li><strong>Weeks 3-4:</strong> Add intensity. Shorter rest intervals, more shuttles per drill.</li>
<li><strong>Weeks 5-6:</strong> Increase match play proportion. More competitive games.</li>
<li><strong>Week 7:</strong> Deload. Reduce volume by 40% to let your body absorb the work.</li>
</ul>

<h2>Tracking What Matters</h2>
<p>Keep a simple log (phone note is fine):</p>
<ul>
<li>How each session felt (1-10)</li>
<li>One thing you did well</li>
<li>One thing to fix next time</li>
<li>Weekly match results</li>
</ul>
<p>After 4 weeks, patterns emerge. You'll see which drills actually moved the needle and which were wasted time. You can also auto-generate a personalized version of this plan on our <a href="/training">training page</a> based on your level, schedule, and goals.</p>

<p>Stick to this plan for 6 weeks and you'll see measurable improvement in footwork speed, stroke consistency, and match results. Shortcut it and you'll stay stuck. The plan isn't magic — showing up is.</p>"""
    },
    {
        "id": "best-tennis-racquets-beginners-2026",
        "title": "Best Tennis Racquets for Beginners in 2026 (Buying Guide)",
        "description": "The best tennis racquets for beginners in 2026. Reviews of 6 top picks, plus a complete sizing guide and tips on what to look for in your first racquet.",
        "category": "gear",
        "sport": "tennis",
        "tags": ["tennis racquet", "beginner tennis", "buying guide", "equipment", "tennis gear"],
        "published_date": "2026-04-12",
        "read_time": "10 min read",
        "thumbnail_emoji": "\U0001f3be",
        "content": """<h2>Your First Tennis Racquet Matters More Than You Think</h2>
<p>The wrong first racquet can cause wrist pain, slow your learning, and push you to quit. The right one makes the ball go where you want with less effort and sets the foundation for good technique. This guide covers the 6 best beginner racquets of 2026 and what actually matters when you're choosing.</p>

<h2>What to Look For in a Beginner Racquet</h2>

<h3>Head Size: Go Big</h3>
<p>Beginner racquets should have a 100-110 sq inch head. Bigger heads mean a bigger sweet spot — you'll get solid contact even on mis-hits. Small 95-98 sq inch frames are for advanced players with consistent swings.</p>

<h3>Weight: Stay Light</h3>
<p>Look for racquets between 260-290 grams (unstrung). Lighter racquets are easier to swing and maneuver. You can always graduate to a heavier frame later.</p>

<h3>Balance: Head-Heavy Helps Beginners</h3>
<p>Beginner racquets are often head-heavy to compensate for slower swing speeds. This gives the ball more "pop" without you having to swing harder.</p>

<h3>Stiffness (RA Rating)</h3>
<p>Stiffer racquets transfer more power but also more vibration. Beginners should target 62-68 RA — enough power, still comfortable. Above 70 RA can cause tennis elbow in players without developed technique.</p>

<h3>Grip Size</h3>
<p>Most adults use 4 1/4" or 4 3/8". Rule of thumb: when holding the grip in your dominant hand, you should fit your non-dominant hand's index finger in the gap between your fingertips and the heel of your palm.</p>

<h2>The 6 Best Beginner Racquets of 2026</h2>

<h3>1. Wilson Clash 108 (Best Overall, $229)</h3>
<p>The Clash's FreeFlex technology creates a unique "flex through contact" feel that's both powerful and arm-friendly. At 108 sq inches and 280g, it's forgiving and maneuverable.</p>
<ul>
<li><strong>Pros:</strong> Huge sweet spot, arm-friendly, great feel</li>
<li><strong>Cons:</strong> Less precision as you improve</li>
</ul>

<h3>2. Babolat Boost Drive ($129)</h3>
<p>A true budget champion. 105 sq in, 260g, and pre-strung. It's basic but it works, and the price means you won't feel bad replacing it when you level up.</p>
<ul>
<li><strong>Pros:</strong> Very affordable, light, forgiving</li>
<li><strong>Cons:</strong> Mediocre strings, limited advanced potential</li>
</ul>

<h3>3. Head Ti.S6 ($99)</h3>
<p>The legendary beginner racquet. It's been on the market for 20+ years because it works: huge 115 sq inch head, ultra-light 225g frame, head-heavy for easy power. It's the tennis equivalent of the Toyota Corolla.</p>
<ul>
<li><strong>Pros:</strong> Cheapest reliable option, extremely easy to swing</li>
<li><strong>Cons:</strong> Feels cheap to advanced players, stiff</li>
</ul>

<h3>4. Yonex EZONE 100L ($219)</h3>
<p>Slightly more refined than pure beginner frames. At 285g and 100 sq in, it's a great "buy once" racquet — you can play on it for years as you improve. Comfortable and powerful.</p>
<ul>
<li><strong>Pros:</strong> Long-term value, comfortable, good control</li>
<li><strong>Cons:</strong> Price</li>
</ul>

<h3>5. Wilson Blade 104 v9 ($249)</h3>
<p>A slightly larger version of the classic Blade, designed for players who want advanced control without advanced demands. More for upper-beginner to intermediate.</p>
<ul>
<li><strong>Pros:</strong> Beautiful feel, advanced players love the Blade line</li>
<li><strong>Cons:</strong> Too demanding for true beginners</li>
</ul>

<h3>6. Prince Textreme Tour 100P ($199)</h3>
<p>Prince's Textreme frames dampen vibration better than most. Great pick if you're older or have any wrist/elbow concerns. 100 sq in, 290g.</p>
<ul>
<li><strong>Pros:</strong> Best comfort for sensitive arms</li>
<li><strong>Cons:</strong> Less powerful than oversize options</li>
</ul>

<h2>Strings Matter (A Lot)</h2>
<p>A good racquet with bad strings plays like a bad racquet. Most pre-strung beginner racquets come with synthetic gut — fine to start. When you need to restring (usually after 20-40 hours), consider:</p>
<ul>
<li><strong>Multifilament (Wilson NXT, Head Velocity):</strong> Soft, arm-friendly, good for beginners ($20-30 + stringing)</li>
<li><strong>Polyester (Luxilon ALU Power, Solinco Hyper-G):</strong> Durable, spin-friendly, but harsh on the arm — skip as a beginner</li>
<li><strong>Natural gut:</strong> Best feel in the world, but $50+ per set. Not for beginners.</li>
</ul>

<h2>Common Beginner Buying Mistakes</h2>
<ul>
<li><strong>Buying the racquet your favorite pro uses:</strong> Pro racquets are heavy, unforgiving, and designed for technique you don't have yet</li>
<li><strong>Going too small on grip size:</strong> Too-small grips cause you to squeeze harder, leading to wrist and forearm injuries</li>
<li><strong>Obsessing over the racquet before lessons:</strong> A $100 racquet in good hands beats a $300 racquet with poor technique every time</li>
<li><strong>Ignoring comfort:</strong> If it vibrates painfully, you won't play. Always test-swing in the store.</li>
</ul>

<h2>Our Recommendations</h2>
<ul>
<li><strong>Absolute beginner, tight budget:</strong> Head Ti.S6</li>
<li><strong>Beginner with room to grow:</strong> Wilson Clash 108</li>
<li><strong>Older beginner / arm concerns:</strong> Prince Textreme Tour 100P</li>
<li><strong>Planning to stick with tennis seriously:</strong> Yonex EZONE 100L</li>
</ul>

<p>Once you've got your racquet and you're swinging, upload a few rally clips to our <a href="/analyze?sport=tennis">AI tennis analyzer</a> — it'll tell you if your grip size, swing weight, or technique is creating issues. You can also find more gear recommendations tailored to your level on the <a href="/equipment">equipment page</a>.</p>"""
    },
    {
        "id": "pickleball-basics-getting-started",
        "title": "Pickleball Basics: Rules, Equipment, and How to Get Started",
        "description": "A complete beginner's guide to pickleball. Learn the rules, what equipment you need, basic strategy, and how to start playing America's fastest-growing sport.",
        "category": "tips",
        "sport": "general",
        "tags": ["pickleball", "beginner guide", "rules", "equipment", "how to play"],
        "published_date": "2026-04-12",
        "read_time": "9 min read",
        "thumbnail_emoji": "\U0001f3d3",
        "content": """<h2>Welcome to the Fastest-Growing Sport in the World</h2>
<p>Pickleball has exploded from a niche backyard game invented in 1965 to the fastest-growing sport in North America. In 2025, there were over 50 million players worldwide. It combines elements of tennis, badminton, and table tennis in a compact, social, low-impact package that appeals to everyone from teenagers to 80-year-olds. Here's everything a beginner needs to know.</p>

<h3>What Is Pickleball, Exactly?</h3>
<p>Pickleball is played on a court the size of a doubles badminton court (20 x 44 feet) with a solid paddle (bigger than a ping pong paddle, smaller than a tennis racquet) and a perforated plastic ball. It can be played as singles or doubles, though doubles is the standard format.</p>

<h2>The Rules (Simplified)</h2>

<h3>Scoring</h3>
<ul>
<li>Games are played to 11 points, win by 2. Tournament games can go to 15 or 21.</li>
<li>Only the serving team can score points (like old-school badminton)</li>
<li>Score is called as three numbers: your score, opponent's score, and (in doubles) server number (1 or 2)</li>
</ul>

<h3>Serving</h3>
<ul>
<li>Serves must be underhand, below the waist, made diagonally into the opposite service box</li>
<li>The ball must clear the "kitchen" (non-volley zone) — serving into the kitchen is a fault</li>
<li>In doubles, both players on a team serve before the serve switches to the other team (except at the start of the game, where only one player serves first)</li>
</ul>

<h3>The Two-Bounce Rule (Critical)</h3>
<p>This is what makes pickleball different from tennis: after the serve, the receiving team must let it bounce before returning. Then the serving team must also let the return bounce before hitting. After those two bounces, volleys are allowed.</p>

<h3>The Kitchen (Non-Volley Zone)</h3>
<p>The 7-foot zone in front of the net is called the kitchen. You cannot volley (hit the ball out of the air) while standing in the kitchen. You can enter it to hit a ball that has already bounced, but your momentum can't carry you into it after a volley. This rule is the single biggest source of faults for beginners.</p>

<h3>Faults (How You Lose a Point)</h3>
<ul>
<li>Ball in the net</li>
<li>Ball out of bounds</li>
<li>Volleying from the kitchen</li>
<li>Violating the two-bounce rule</li>
<li>Ball bouncing twice on your side</li>
</ul>

<h2>Equipment: What You Actually Need</h2>

<h3>Paddle ($40-200)</h3>
<p>Beginners should get a mid-weight (7.5-8.0 oz) composite or graphite paddle. Avoid wood paddles (too heavy, poor control). Good beginner options:</p>
<ul>
<li><strong>Selkirk SLK Evo Hybrid ($70):</strong> Great entry paddle</li>
<li><strong>Head Radical Elite ($80):</strong> Very forgiving</li>
<li><strong>Paddletek Bantam EX-L ($130):</strong> Step up, great control</li>
</ul>

<h3>Balls ($3-5 each)</h3>
<p>Outdoor balls have 40 holes and are harder; indoor balls have 26 larger holes. Don't mix them up — outdoor balls skip off wood floors and indoor balls fly in the wind. Dura Fast 40 is the most popular outdoor ball.</p>

<h3>Shoes</h3>
<p>Tennis or court shoes — NOT running shoes. Running shoes don't support lateral movement and cause ankle injuries. Any court shoe will do for the first year.</p>

<h3>Clothing</h3>
<p>Anything comfortable. Pickleball is not a fashion sport.</p>

<h2>Basic Strategy for Beginners</h2>

<h3>Get to the Kitchen Line</h3>
<p>The #1 rule of pickleball strategy: the team at the kitchen line (both players right behind the non-volley zone) wins 80% of points. Your entire game plan should revolve around advancing to the kitchen line as quickly as possible after your team's serve and return.</p>

<h3>The Third Shot Drop</h3>
<p>After the return of serve bounces, the serving team hits "the third shot." A good player drops this softly into the opponent's kitchen — a "dink" — so they can advance to the kitchen line without getting attacked. This is the hardest shot to learn and the most important.</p>

<h3>Dinks Win Games</h3>
<p>"Dinks" are soft shots that land in the opponent's kitchen after bouncing. You cannot volley a dink (it's in the kitchen zone) so it forces a soft exchange. Whoever makes the first error loses the point. Patience beats power.</p>

<h3>Communicate in Doubles</h3>
<p>Call "mine" and "yours" on shots down the middle. The player with the forehand usually takes middle balls. Move as a unit — if your partner goes to the net, you go with them.</p>

<h2>How to Find Games</h2>
<ul>
<li><strong>Local rec centers:</strong> Most offer beginner drop-in pickleball sessions</li>
<li><strong>Pickleball apps (Places2Play, Pickleball+):</strong> Find courts and open play sessions near you</li>
<li><strong>USA Pickleball membership ($30/year):</strong> Access to tournaments and leagues</li>
<li><strong>Tennis clubs:</strong> Many have converted courts to pickleball or offer both</li>
</ul>

<h2>Common Beginner Mistakes</h2>
<ul>
<li><strong>Staying at the baseline:</strong> You need to advance to the kitchen line</li>
<li><strong>Smashing every ball:</strong> Power gets countered. Learn to dink first.</li>
<li><strong>Stepping into the kitchen on a volley:</strong> Most common fault. Stay behind the line.</li>
<li><strong>Trying to hit winners from the baseline:</strong> Patience wins. Dink, dink, dink, then attack.</li>
<li><strong>Ignoring your partner:</strong> Doubles requires constant communication</li>
</ul>

<h2>A 30-Day Starter Plan</h2>
<ol>
<li><strong>Week 1:</strong> Learn the rules, buy a paddle, play 2-3 games to just feel it out</li>
<li><strong>Week 2:</strong> Practice the serve and return. Play 3-4 games.</li>
<li><strong>Week 3:</strong> Work on dinks. Try to rally 10 dinks without a fault. Play 4-5 games.</li>
<li><strong>Week 4:</strong> Work on the third shot drop. Play 5+ games with focus on kitchen advance.</li>
</ol>

<p>By the end of 30 days, you'll have a real sense of the game and whether you want to pursue it seriously. Pickleball's appeal is how quickly beginners can play fun rallies — unlike tennis, where the first few months can be frustrating. Grab a paddle, find a court, and you'll see why 50 million people are obsessed.</p>"""
    },
    {
        "id": "tennis-injuries-prevention",
        "title": "Common Tennis Injuries and How to Prevent Them",
        "description": "A guide to the most common tennis injuries — tennis elbow, rotator cuff, knee pain — and proven prevention strategies including warm-ups and exercises.",
        "category": "tips",
        "sport": "tennis",
        "tags": ["tennis injury", "tennis elbow", "injury prevention", "warm up", "tennis health"],
        "published_date": "2026-04-12",
        "read_time": "9 min read",
        "thumbnail_emoji": "\U0001f3be",
        "content": """<h2>Tennis Is Tough on the Body (But Injuries Are Largely Preventable)</h2>
<p>Tennis combines explosive sprints, overhead throwing motions, awkward lateral pivots, and high-volume repetitive stress. It's no surprise that most serious players eventually deal with some kind of injury. The good news: the vast majority of tennis injuries are preventable with simple habits. Here's what to know about the most common problems and how to avoid them.</p>

<p><em>Disclaimer: This is general information, not medical advice. If you have pain that persists, see a sports physiotherapist or doctor.</em></p>

<h2>1. Tennis Elbow (Lateral Epicondylitis)</h2>
<p>The classic tennis injury, affecting about 40% of recreational players at some point. It's an overuse injury to the tendons on the outside of the elbow, usually caused by poor backhand technique (leading wrist) and gripping too tightly.</p>
<p><strong>Prevention:</strong></p>
<ul>
<li>Use a two-handed backhand if possible, or learn proper one-handed form (leading elbow, relaxed wrist)</li>
<li>Don't overgrip — hold the racquet loosely except at contact</li>
<li>Use a softer string (multifilament or gut) at lower tension</li>
<li>Do wrist strengthening: wrist curls, reverse wrist curls, pronation/supination work</li>
<li>Consider a heavier, more flexible racquet — stiff frames transmit more shock</li>
</ul>
<p><strong>If you feel it starting:</strong> Rest, ice, NSAIDs if appropriate, and eccentric wrist strengthening exercises. A "Tyler Twist" with a Flexbar is the gold standard rehab exercise.</p>

<h2>2. Rotator Cuff Injuries</h2>
<p>The serve is an overhead throwing motion performed thousands of times a season. Over time, this stresses the four small muscles of the rotator cuff, leading to tendinitis or even tears.</p>
<p><strong>Prevention:</strong></p>
<ul>
<li>Strengthen the rotator cuff: external rotations with light bands or dumbbells (3 x 15, twice a week)</li>
<li>Strengthen the scapular stabilizers: rows, face pulls, and Y-T-W raises</li>
<li>Warm up shoulders specifically before serving — arm circles, band pull-aparts</li>
<li>Don't ramp up serve volume too fast; follow a gradual loading program</li>
<li>Use proper serve technique — no "dropped elbow" that forces the shoulder to compensate</li>
</ul>

<h2>3. Tennis Knee (Patellar Tendinitis)</h2>
<p>The constant squatting, pushing off, and decelerating in tennis stresses the knee, especially the patellar tendon (just below the kneecap). Beginners and older players are most at risk.</p>
<p><strong>Prevention:</strong></p>
<ul>
<li>Strengthen quads with goblet squats, Bulgarian split squats, and leg press</li>
<li>Strengthen glutes — weak glutes make the knee compensate. Do hip thrusts and monster walks.</li>
<li>Work on ankle mobility — stiff ankles force the knee to absorb more load</li>
<li>Use court shoes designed for your surface (clay shoes have herringbone; hard court shoes have more cushioning)</li>
<li>Don't play through sharp knee pain — this is how tendinitis becomes a tear</li>
</ul>

<h2>4. Ankle Sprains</h2>
<p>Tennis involves constant lateral pivots and sudden changes of direction — a recipe for rolled ankles. The outside of the ankle (inversion sprains) is most commonly injured.</p>
<p><strong>Prevention:</strong></p>
<ul>
<li>Do balance work: single-leg stands, eyes closed, progressing to unstable surfaces</li>
<li>Strengthen calves and peroneals (side of lower leg) with heel raises and lateral band work</li>
<li>Wear proper court shoes — running shoes have no lateral support and dramatically increase sprain risk</li>
<li>If you've had a previous sprain, consider an ankle brace for 6-12 months</li>
</ul>

<h2>5. Lower Back Pain</h2>
<p>The serve's twisting motion and repeated flexion during groundstrokes can strain the lumbar spine. Core weakness is the usual culprit.</p>
<p><strong>Prevention:</strong></p>
<ul>
<li>Build core strength: planks, dead bugs, Pallof presses, bird dogs</li>
<li>Don't neglect glute and hip mobility</li>
<li>Avoid serving with extreme back arching ("can opener" serve)</li>
<li>Stretch hip flexors and hamstrings regularly</li>
</ul>

<h2>6. Wrist Injuries</h2>
<p>Heavy topspin forehands (especially with Western grips) stress the wrist tendons. TFCC injuries (triangular fibrocartilage complex) are common in players who hit with heavy Western grips.</p>
<p><strong>Prevention:</strong></p>
<ul>
<li>Don't over-rotate on topspin forehands — the wrist should stabilize, not whip</li>
<li>Strengthen forearms and wrists in all directions</li>
<li>Use multifilament or gut strings to reduce shock</li>
<li>Tape or brace if you feel any twinges</li>
</ul>

<h2>The Universal Warm-Up (10 Minutes Before Every Session)</h2>
<ol>
<li>3 min light cardio: jog around the court, high knees, butt kicks</li>
<li>Dynamic stretches: leg swings, arm circles, torso rotations, walking lunges</li>
<li>Tennis-specific: 2 min of easy mini-tennis at the service line, then gradually move back</li>
<li>Serve prep: 5 easy serves from the service line, then 5 from halfway, then 5 from the baseline</li>
</ol>
<p>Never jump straight into full-speed rallies or hard serves. That's how most acute injuries happen.</p>

<h2>Training Load Management</h2>
<p>Most overuse injuries come from doing too much too fast. Rules of thumb:</p>
<ul>
<li>Increase practice volume by no more than 10% per week</li>
<li>Take at least one full rest day per week</li>
<li>Cross-train with low-impact exercise (swimming, cycling) on off days</li>
<li>If pain persists for more than 3 days, see a physio — don't "push through"</li>
</ul>

<h2>Recovery Basics</h2>
<ul>
<li><strong>Sleep:</strong> 7-9 hours. Non-negotiable for tendon and muscle recovery.</li>
<li><strong>Hydration and nutrition:</strong> Adequate protein (1.6-2.0 g/kg for active players)</li>
<li><strong>Foam rolling and stretching:</strong> 10-15 min post-match</li>
<li><strong>Contrast showers or ice baths:</strong> For heavy training blocks</li>
</ul>

<p>Staying injury-free is often the difference between a lifelong tennis career and someone who "used to play." Build strength, warm up properly, and listen to your body. You can also run your technique through our <a href="/analyze?sport=tennis">AI tennis analyzer</a> — early detection of biomechanical issues (dropped elbow, wristy backhand) is one of the most effective forms of injury prevention. Pair it with a sensible <a href="/training">training plan</a> that manages your workload.</p>"""
    },
    {
        "id": "choose-table-tennis-rubber-guide",
        "title": "How to Choose the Right Table Tennis Rubber (2026 Guide)",
        "description": "A complete guide to choosing table tennis rubbers. Learn the differences between inverted, short pips, long pips, and anti-spin, plus top brand recommendations.",
        "category": "gear",
        "sport": "table_tennis",
        "tags": ["table tennis rubber", "TT equipment", "ping pong gear", "buying guide", "rubber"],
        "published_date": "2026-04-12",
        "read_time": "10 min read",
        "thumbnail_emoji": "\U0001f3d3",
        "content": """<h2>Rubber Is the Most Important Part of Your Table Tennis Setup</h2>
<p>You can have the best blade in the world, but if your rubbers are wrong for your style, your game will suffer. Unlike tennis or badminton where strings are minor, table tennis rubbers fundamentally define how the ball behaves — spin, speed, control. A new player choosing rubber feels overwhelming because there are hundreds of options. This guide cuts through the noise.</p>

<h2>The Four Main Rubber Types</h2>

<h3>1. Inverted (Smooth) Rubber — 90% of Players Use These</h3>
<p>Inverted rubbers have the pimples facing inward and a smooth surface. They grip the ball strongly, allowing heavy spin and fast shots. Virtually every top pro uses inverted on at least one side.</p>
<p><strong>Good for:</strong> Attacking players, looping, modern all-round play</p>
<p><strong>Spin:</strong> High. The defining characteristic.</p>
<p><strong>Speed:</strong> Varies from slow to extremely fast depending on the model</p>

<h3>2. Short Pips (Short Pimples Out)</h3>
<p>Short pips have the pimples facing outward. Shorter than 2mm. They generate less spin than inverted but absorb incoming spin less, giving more predictable shots.</p>
<p><strong>Good for:</strong> Aggressive hitters and counter-attackers who don't want spin variation</p>
<p><strong>Spin:</strong> Medium</p>
<p><strong>Speed:</strong> High, especially on flat hits</p>
<p><strong>Famous user:</strong> Ma Long uses short pips on his backhand for close-to-table play (just kidding — he uses inverted. But many pros do go short pips, like Mattias Karlsson).</p>

<h3>3. Long Pips</h3>
<p>Long pips have long, thin pimples that bend on contact, returning the ball with reversed spin. They're chaos incarnate: if your opponent hits topspin, it comes back as backspin.</p>
<p><strong>Good for:</strong> Defensive choppers and disruptive styles</p>
<p><strong>Spin:</strong> Reversed — your opponent's spin becomes your spin</p>
<p><strong>Speed:</strong> Slow</p>
<p><strong>Warning:</strong> Extremely hard to use — most beginners should avoid for at least 1-2 years of play</p>

<h3>4. Anti-Spin</h3>
<p>Smooth, slick rubber that absorbs spin entirely. The ball comes back with almost no spin regardless of input.</p>
<p><strong>Good for:</strong> Disruptive defensive players who want to neutralize attackers</p>
<p><strong>Spin:</strong> Near zero</p>
<p><strong>Speed:</strong> Very slow</p>

<h2>The Three Properties That Matter</h2>

<h3>Speed Rating</h3>
<p>Usually on a 1-10 or 1-100 scale. Higher means the ball leaves faster. Beginner rubbers should be in the 60-80 range (on a 100 scale). Elite rubbers push 90+ but are nearly impossible to control without pro-level technique.</p>

<h3>Spin Rating</h3>
<p>How much spin the rubber generates. Modern inverted rubbers can reach 95+ spin ratings. For beginners, aim for 80-90.</p>

<h3>Hardness (Sponge Density)</h3>
<p>Measured in degrees (e.g., 37.5, 40, 42.5). Harder sponges are faster and better for advanced hitters; softer sponges are more forgiving and generate spin with less effort. Beginners: start with 37-40 degree sponges.</p>

<h2>Top Rubber Recommendations</h2>

<h3>For Beginners (Rs 1,000-1,800 per sheet)</h3>
<ul>
<li><strong>Yasaka Mark V:</strong> The all-time classic beginner rubber. Balanced, forgiving, teaches proper technique. If in doubt, start here.</li>
<li><strong>Butterfly Sriver:</strong> Another legendary beginner sheet. Slightly faster than Mark V.</li>
<li><strong>DHS Hurricane 3 Neo (boosted or unboosted):</strong> Chinese-style, heavy spin, demanding but rewarding</li>
</ul>

<h3>For Intermediate Players (Rs 1,800-3,500)</h3>
<ul>
<li><strong>Xiom Vega Pro:</strong> Fast, spinny, forgiving — the best all-round intermediate rubber</li>
<li><strong>Tibhar Evolution MX-P:</strong> Very popular among European attackers</li>
<li><strong>Yasaka Rakza 7:</strong> Excellent spin and arc, easy to use</li>
</ul>

<h3>For Advanced Players (Rs 3,500-5,500)</h3>
<ul>
<li><strong>Butterfly Tenergy 05:</strong> The benchmark for spinny loops. Used by many pros. Expensive but legendary.</li>
<li><strong>Butterfly Dignics 09C:</strong> Tenergy's successor, even more control at the top end</li>
<li><strong>Xiom Omega VII Pro:</strong> Pro-level speed and spin at a slightly lower price</li>
</ul>

<h2>Boosting and Tuning</h2>
<p>Many Chinese rubbers (especially DHS Hurricane) are "boosted" — treated with oils to soften the sponge and increase speed. This is legal at amateur levels but banned in ITTF competition. If you're a casual player, boosted rubbers play faster and spinnier; if you compete, stick with factory rubbers.</p>

<h2>Matching Rubber to Your Style</h2>
<ul>
<li><strong>All-round attacker:</strong> Inverted on both sides, medium hardness (Mark V, Rakza 7)</li>
<li><strong>Looping attacker:</strong> Spinny inverted, medium-hard (Tenergy 05, Hurricane 3)</li>
<li><strong>Close-to-table hitter:</strong> Fast inverted or short pips on backhand</li>
<li><strong>Defensive chopper:</strong> Slow inverted on forehand, long pips on backhand</li>
<li><strong>Disruptive defender:</strong> Anti-spin on one side, inverted on the other</li>
</ul>

<h2>Forehand vs Backhand Setup</h2>
<p>Most players use different rubbers on each side to match the demands of each stroke. Typical setup:</p>
<ul>
<li><strong>Forehand:</strong> Harder, slightly spinnier rubber (for looping power)</li>
<li><strong>Backhand:</strong> Slightly softer or different type (for over-the-table control)</li>
</ul>

<h2>How Often to Replace Rubbers</h2>
<p>Inverted rubbers lose their grip over 2-4 months of regular play as the surface dries out and pips compress. Signs it's time to replace:</p>
<ul>
<li>The surface has lost its tacky feel</li>
<li>You can see visible wear or chipping</li>
<li>Spin and speed noticeably decrease</li>
<li>You get more mis-hits than you used to</li>
</ul>

<h2>Buying Tips</h2>
<ul>
<li>Always buy from reputable retailers — counterfeit Butterfly rubbers are a huge problem in India</li>
<li>Buy one rubber at a time and test before committing to a full setup</li>
<li>Ask your club's better players what they use — local knowledge beats forum debates</li>
<li>Don't skip on blade quality — a premium rubber on a $20 blade is wasted</li>
</ul>

<p>Unsure what matches your style? Upload a match video to our <a href="/analyze?sport=table_tennis">AI table tennis analyzer</a> and it'll identify whether you're a looper, hitter, blocker, or chopper — which directly tells you what rubbers to consider. And check the <a href="/equipment">equipment guide</a> for brand-by-brand breakdowns.</p>"""
    },
    {
        "id": "badminton-mental-game-focus",
        "title": "Mental Game in Badminton: How to Stay Focused Under Pressure",
        "description": "Master the mental side of badminton. Learn pre-game routines, visualization, pressure management, and focus techniques used by top players.",
        "category": "tips",
        "sport": "badminton",
        "tags": ["mental game", "sports psychology", "badminton focus", "pressure", "mindset"],
        "published_date": "2026-04-12",
        "read_time": "9 min read",
        "thumbnail_emoji": "\U0001f9e0",
        "content": """<h2>Badminton Is Played in the Head</h2>
<p>At club level, technique differences win matches. At competitive level, everyone has technique — the difference is mental. Every badminton player knows the feeling: you're up 18-14 in the third game, and suddenly your arm feels heavy, your feet slow down, and unforced errors pile up. That's not a technique problem. That's a mental problem. Here's how to fix it.</p>

<h3>The Core Problem: You Can't Think Your Way to Good Shots</h3>
<p>Performance research consistently shows that conscious thinking interferes with trained motor skills. When you're thinking "don't miss the clear, don't miss the clear," you are almost guaranteed to miss the clear. The goal of mental training isn't to think more positively — it's to think less during execution.</p>

<h2>1. Build a Pre-Game Routine</h2>
<p>Top players do exactly the same things before every match. Routines calm the nervous system, shift you into "ready" mode, and prevent overthinking. A solid pre-match routine:</p>
<ul>
<li><strong>45 min before:</strong> Light snack, hydrate, review tactics (not technique)</li>
<li><strong>30 min before:</strong> Dynamic warm-up — skipping, jogging, mobility work</li>
<li><strong>15 min before:</strong> Court knock-up, gradually increasing intensity</li>
<li><strong>5 min before:</strong> Breathing routine (4-7-8 breathing: inhale 4 sec, hold 7, exhale 8)</li>
<li><strong>Right before first point:</strong> A consistent ritual — bounce, breath, eye contact, go</li>
</ul>
<p>The specifics matter less than the consistency. Do it before every match, every time, and it becomes a trigger that puts you in performance mode automatically.</p>

<h2>2. Visualization: The Pro Secret</h2>
<p>Almost every elite athlete visualizes performances. Not vague "picture winning" nonsense — specific, detailed mental rehearsal. Studies show visualization activates the same brain regions as actual performance, training your nervous system without physical load.</p>
<p><strong>How to visualize effectively:</strong></p>
<ul>
<li>Spend 5-10 minutes the night before a match</li>
<li>Picture the opponent, the venue, the conditions</li>
<li>Run through specific rallies: your serve, the return, your reply, the winner</li>
<li>Include the physical sensations: footwork, grip, the sound of the shuttle</li>
<li>Visualize handling adversity — what you'll do when you're down 14-18, when you lose a close point, when the opponent starts playing well</li>
</ul>
<p>Players who visualize losing close points and recovering from them perform noticeably better in actual close matches. You're pre-training your response.</p>

<h2>3. The Point-by-Point Reset</h2>
<p>Your emotional state is the #1 predictor of your next point's outcome. If you're furious about the last error, you'll likely make another. The solution is a reset ritual between points.</p>
<p><strong>Federer's approach (adapted for badminton):</strong></p>
<ol>
<li>After losing a point, turn your back to the court for 2 seconds</li>
<li>Take one deep breath</li>
<li>Adjust your strings (or tap your racquet)</li>
<li>Turn around — the previous point no longer exists</li>
</ol>
<p>This seems silly until you try it. The physical ritual hijacks the emotional response and forces you back into the present.</p>

<h2>4. Controlling What You Can Control</h2>
<p>You can't control: the shuttles, the court, the line judges, the opponent's luck, noise from the next court. You can control: your effort, your footwork, your attitude, your routines. Every moment you spend thinking about things you can't control is a moment your opponent is winning. Write this on a sticky note if you have to.</p>

<h2>5. Managing Pressure</h2>
<p>The classic mental breakdown scenario: you're serving at 19-all in the third game. Your heart rate spikes, your arm feels stiff, your brain floods with "don't lose this." Here's what to do:</p>
<ul>
<li><strong>Accept it:</strong> Pressure means you care. Embrace the butterflies instead of fighting them.</li>
<li><strong>Slow down:</strong> Take an extra 5 seconds before serving. Breathe. Opponents feeling the same pressure rarely slow down with you.</li>
<li><strong>Narrow your focus:</strong> Instead of "I need to win this point," think of one tiny cue: "see the shuttle," "relax the grip," "split step on contact"</li>
<li><strong>Default to patterns:</strong> Don't try to invent under pressure. Play your highest-percentage pattern — your bread-and-butter serve to that corner you've hit 1000 times in practice</li>
</ul>

<h2>6. The Post-Error Protocol</h2>
<p>Unforced errors are inevitable. What you do in the next 5 seconds determines whether one error becomes three. The protocol:</p>
<ol>
<li>Acknowledge it happened ("that was a net shot")</li>
<li>Identify the cause in one word ("late," "grip," "position")</li>
<li>Commit to the fix ("step earlier")</li>
<li>Let it go and move on</li>
</ol>
<p>This takes about 3 seconds and prevents the error from hijacking your attention for the next 3 points.</p>

<h2>7. Positive Self-Talk (Done Right)</h2>
<p>Sports psychology has largely debunked "I am the best" style affirmations. What works better is instructional and process-focused self-talk:</p>
<ul>
<li>Not: "I'm going to crush him"</li>
<li>But: "Low serve, split step, attack the reply"</li>
<li>Not: "Don't miss the next smash"</li>
<li>But: "Full rotation, wrist snap, target the corner"</li>
</ul>

<h2>8. Training the Mental Game Like Technique</h2>
<p>Mental skills improve with deliberate practice. A few drills:</p>
<ul>
<li><strong>Pressure practice:</strong> Play practice games where losing means a penalty (push-ups, court sprints). This creates real pressure in training.</li>
<li><strong>Score-down drills:</strong> Start practice games at 14-18 down. Practice performing from behind.</li>
<li><strong>Distraction drills:</strong> Play with loud music, or with someone calling out random numbers, forcing you to maintain focus despite noise</li>
<li><strong>Video review:</strong> Watch your matches and note emotional reactions. Use our <a href="/analyze?sport=badminton">AI analyzer</a> to see how your body language and pace change when you're under pressure vs. relaxed.</li>
</ul>

<h2>9. Deal With Losing</h2>
<p>Even the best players lose 30-40% of their matches. What matters is what you do with losses. Healthy habits:</p>
<ul>
<li>Allow 24 hours to feel disappointed</li>
<li>Then analyze objectively: what would you do differently?</li>
<li>Extract 1-3 specific things to practice next week</li>
<li>Move on. The loss already taught you everything it could.</li>
</ul>

<h2>Mental Training Routine (Daily, 10 Min)</h2>
<ol>
<li>3 min breathing / box breathing</li>
<li>5 min visualization of upcoming training or match</li>
<li>2 min journaling: one thing that went well, one thing to improve</li>
</ol>
<p>Do this consistently for a month and your performance under pressure will measurably improve. The mental game isn't talent — it's a trained skill, exactly like your smash. Add it to your <a href="/training">weekly training plan</a> and watch your results in close matches start to shift.</p>"""
    },
]


@api_router.get("/blog")
async def list_blog_posts(
    category: Optional[str] = Query(None),
    sport: Optional[str] = Query(None),
):
    """List all blog posts (summary only, no full content)."""
    posts = BLOG_POSTS
    if category:
        posts = [p for p in posts if p["category"] == category]
    if sport:
        posts = [p for p in posts if p["sport"] == sport]
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "description": p["description"],
            "category": p["category"],
            "sport": p["sport"],
            "tags": p["tags"],
            "published_date": p["published_date"],
            "read_time": p["read_time"],
            "thumbnail_emoji": p["thumbnail_emoji"],
        }
        for p in posts
    ]


@api_router.get("/blog/category/{category}")
async def blog_by_category(category: str):
    """Filter blog posts by category."""
    posts = [p for p in BLOG_POSTS if p["category"] == category]
    if not posts:
        raise HTTPException(status_code=404, detail=f"No posts found in category '{category}'")
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "description": p["description"],
            "category": p["category"],
            "sport": p["sport"],
            "tags": p["tags"],
            "published_date": p["published_date"],
            "read_time": p["read_time"],
            "thumbnail_emoji": p["thumbnail_emoji"],
        }
        for p in posts
    ]


@api_router.get("/blog/sport/{sport}")
async def blog_by_sport(sport: str):
    """Filter blog posts by sport."""
    posts = [p for p in BLOG_POSTS if p["sport"] == sport]
    if not posts:
        raise HTTPException(status_code=404, detail=f"No posts found for sport '{sport}'")
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "description": p["description"],
            "category": p["category"],
            "sport": p["sport"],
            "tags": p["tags"],
            "published_date": p["published_date"],
            "read_time": p["read_time"],
            "thumbnail_emoji": p["thumbnail_emoji"],
        }
        for p in posts
    ]


@api_router.get("/blog/{slug}")
async def get_blog_post(slug: str):
    """Get a single blog post by slug (includes full content)."""
    for p in BLOG_POSTS:
        if p["id"] == slug:
            return p
    raise HTTPException(status_code=404, detail="Blog post not found")


# ─── Root / Health ───

@api_router.get("/")
async def root():
    return {"message": "AthlyticAI API", "version": "3.0.0"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


# ─── Explicit OPTIONS preflight handler (fixes CORS 405 on preflight) ───
@app.options("/api/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str):
    return FastAPIResponse(status_code=200, headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    })

# Include router
app.include_router(api_router)

# ─── Serve React Frontend (built static files) ───
FRONTEND_BUILD_DIR = Path(os.environ.get("FRONTEND_BUILD_DIR", str(ROOT_DIR.parent / "frontend" / "build")))


@app.on_event("startup")
async def startup():
    # Pre-load research data (cached in memory)
    try:
        from research_loader import get_research_sports
        loaded = get_research_sports()
        logger.info(f"Research data loaded for: {loaded}")
    except Exception as e:
        logger.warning(f"Research data loading failed: {e}")

    # Seed database — skip on serverless cold starts to avoid repeated seeding
    if not IS_SERVERLESS:
        try:
            from seed_data import seed_database
            await seed_database(db)
        except Exception as e:
            logger.warning(f"Database seeding skipped: {e}")

    # AI model pre-loading: Skip by default since analysis now runs client-side.
    # Set PRELOAD_AI_MODEL=1 to enable server-side analysis (requires 2GB+ RAM).
    if not IS_SERVERLESS and os.environ.get("PRELOAD_AI_MODEL") == "1":
        async def _preload_ai():
            try:
                from pose_estimator import preload_model
                logger.info("Pre-loading AI model in background...")
                await asyncio.get_event_loop().run_in_executor(None, preload_model)
                logger.info("AI model ready!")
            except ImportError:
                logger.warning("AI engine not found — video analysis will be unavailable")
            except Exception as e:
                logger.warning(f"AI model pre-load failed: {e}")
        asyncio.create_task(_preload_ai())
    else:
        logger.info("AI model pre-loading skipped (client-side analysis mode). Set PRELOAD_AI_MODEL=1 to enable.")

    # Mount React static files if build exists (skip on serverless — frontend served separately)
    if not IS_SERVERLESS and FRONTEND_BUILD_DIR.exists() and (FRONTEND_BUILD_DIR / "static").exists():
        app.mount("/static", StaticFiles(directory=str(FRONTEND_BUILD_DIR / "static")), name="react-static")
        logger.info(f"Serving React frontend from {FRONTEND_BUILD_DIR}")
    elif not IS_SERVERLESS:
        logger.warning(f"React build not found at {FRONTEND_BUILD_DIR}. Run 'npm run build' in frontend/")

    _host = os.environ.get("HOST", "0.0.0.0")
    _port = os.environ.get("PORT", "8000")
    logger.info("=" * 50)
    logger.info(f"AthlyticAI + AI Coach ready ({ENVIRONMENT}) at http://{_host}:{_port}")
    logger.info("=" * 50)


# Catch-all: serve React index.html for client-side routing
# MUST be registered after api_router and static mount
# Skip on serverless — frontend is served separately by Vercel's static hosting
if not IS_SERVERLESS:
    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        """Serve React SPA — any non-API route returns index.html."""
        # Don't serve index.html for API routes (already handled by api_router)
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        # Try to serve the exact static file first
        file_path = FRONTEND_BUILD_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))

        # Otherwise serve index.html for client-side routing
        index_path = FRONTEND_BUILD_DIR / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))

        raise HTTPException(status_code=404, detail="Frontend not built. Run: cd frontend && npm run build")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
