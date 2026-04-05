"""
Seed equipment data for Table Tennis, Tennis, and Pickleball.
Includes realistic products with price comparisons.
Run: python seed_sports_equipment.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

# ══════════════════════════════════════
# TABLE TENNIS EQUIPMENT
# ══════════════════════════════════════

TT_BLADES = [
    {"id": "tt_b001", "brand": "Butterfly", "model": "Timo Boll ALC", "category": "tt_blade", "sport": "table_tennis", "weight_grams": 86, "plies": 7, "blade_type": "Offensive", "handle_type": "Flared", "speed": 9, "control": 8, "stiffness": "Medium", "recommended_skill_level": ["Intermediate", "Advanced"], "recommended_play_style": ["Offensive", "All-round"], "price_range": "Premium", "price_range_value": 12000, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Arylate-Carbon blade used by Timo Boll. Excellent speed with great control for advanced loopers."},
    {"id": "tt_b002", "brand": "Butterfly", "model": "Viscaria", "category": "tt_blade", "sport": "table_tennis", "weight_grams": 87, "plies": 7, "blade_type": "Offensive+", "handle_type": "Flared", "speed": 9.5, "control": 7, "stiffness": "Stiff", "recommended_skill_level": ["Advanced"], "recommended_play_style": ["Offensive"], "price_range": "Premium", "price_range_value": 15000, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Legendary carbon blade. Used by Zhang Jike to win World Championships. Maximum power."},
    {"id": "tt_b003", "brand": "Stiga", "model": "Carbonado 245", "category": "tt_blade", "sport": "table_tennis", "weight_grams": 85, "plies": 7, "blade_type": "Offensive", "handle_type": "Flared", "speed": 9, "control": 7.5, "stiffness": "Medium-Stiff", "recommended_skill_level": ["Intermediate", "Advanced"], "recommended_play_style": ["Offensive", "All-round"], "price_range": "High", "price_range_value": 9000, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "TeXtreme carbon technology for explosive power with controlled touch."},
    {"id": "tt_b004", "brand": "DHS", "model": "Hurricane Long 5", "category": "tt_blade", "sport": "table_tennis", "weight_grams": 90, "plies": 5, "blade_type": "Offensive", "handle_type": "Flared", "speed": 8.5, "control": 9, "stiffness": "Medium", "recommended_skill_level": ["Intermediate", "Advanced"], "recommended_play_style": ["Offensive", "All-round"], "price_range": "High", "price_range_value": 8000, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Ma Long's blade. Pure wood for maximum feel and spin. The choice of champions."},
    {"id": "tt_b005", "brand": "Butterfly", "model": "Primorac", "category": "tt_blade", "sport": "table_tennis", "weight_grams": 82, "plies": 5, "blade_type": "All-round+", "handle_type": "Flared", "speed": 7, "control": 9, "stiffness": "Flexible", "recommended_skill_level": ["Beginner", "Beginner+"], "recommended_play_style": ["All-round", "Defensive"], "price_range": "Medium", "price_range_value": 4500, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Classic 5-ply blade for developing players. Excellent control and feel at the table."},
    {"id": "tt_b006", "brand": "Stiga", "model": "Allround Classic", "category": "tt_blade", "sport": "table_tennis", "weight_grams": 80, "plies": 5, "blade_type": "All-round", "handle_type": "Flared", "speed": 6, "control": 10, "stiffness": "Flexible", "recommended_skill_level": ["Beginner", "Beginner+"], "recommended_play_style": ["All-round", "Defensive"], "price_range": "Low", "price_range_value": 2500, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Best-selling beginner blade worldwide. Maximum control for learning proper technique."},
]

TT_RUBBERS = [
    {"id": "tt_r001", "brand": "Butterfly", "model": "Tenergy 05", "category": "tt_rubber", "sport": "table_tennis", "speed": 9.5, "spin": 10, "control": 8, "sponge_thickness": "2.1mm", "rubber_type": "Inverted", "recommended_skill_level": ["Intermediate", "Advanced"], "price_range": "Premium", "price_range_value": 5500, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Gold standard rubber. Maximum spin with Spring Sponge technology. Used by most pros."},
    {"id": "tt_r002", "brand": "DHS", "model": "Hurricane 3 Neo", "category": "tt_rubber", "sport": "table_tennis", "speed": 8, "spin": 10, "control": 8.5, "sponge_thickness": "2.15mm", "rubber_type": "Chinese Tacky", "recommended_skill_level": ["Intermediate", "Advanced"], "price_range": "Medium", "price_range_value": 2500, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Chinese national team rubber. Insane spin with tacky topsheet. Excellent value."},
    {"id": "tt_r003", "brand": "Butterfly", "model": "Rozena", "category": "tt_rubber", "sport": "table_tennis", "speed": 8, "spin": 8.5, "control": 9, "sponge_thickness": "2.1mm", "rubber_type": "Inverted", "recommended_skill_level": ["Beginner+", "Intermediate"], "price_range": "High", "price_range_value": 3500, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Forgiving rubber with good spin. Spring Sponge technology at a lower price than Tenergy."},
    {"id": "tt_r004", "brand": "Yasaka", "model": "Mark V", "category": "tt_rubber", "sport": "table_tennis", "speed": 7, "spin": 8, "control": 9.5, "sponge_thickness": "2.0mm", "rubber_type": "Inverted", "recommended_skill_level": ["Beginner", "Beginner+"], "price_range": "Low", "price_range_value": 1800, "image_url": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400", "description": "Classic training rubber. Consistent, predictable, and affordable. Perfect for beginners."},
]

# ══════════════════════════════════════
# TENNIS EQUIPMENT
# ══════════════════════════════════════

TENNIS_RACKETS = [
    {"id": "tn_r001", "brand": "Wilson", "model": "Pro Staff 97 v14", "category": "tennis_racket", "sport": "tennis", "weight_grams": 315, "head_size": 97, "balance": "Head Light", "string_pattern": "16x19", "stiffness": 63, "recommended_skill_level": ["Intermediate", "Advanced"], "recommended_play_style": ["Baseliner", "All-Court"], "price_range": "Premium", "price_range_value": 22000, "image_url": "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400", "description": "Roger Federer's legendary racket line. Precision and feel for advanced baseliners."},
    {"id": "tn_r002", "brand": "Babolat", "model": "Pure Aero 2024", "category": "tennis_racket", "sport": "tennis", "weight_grams": 300, "head_size": 100, "balance": "Even", "string_pattern": "16x19", "stiffness": 71, "recommended_skill_level": ["Intermediate", "Advanced"], "recommended_play_style": ["Baseliner", "All-Court"], "price_range": "Premium", "price_range_value": 24000, "image_url": "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400", "description": "Nadal's racket. Aerodynamic frame for maximum topspin. The weapon of choice for clay court warriors."},
    {"id": "tn_r003", "brand": "Head", "model": "Speed MP 2024", "category": "tennis_racket", "sport": "tennis", "weight_grams": 300, "head_size": 100, "balance": "Even", "string_pattern": "16x19", "stiffness": 66, "recommended_skill_level": ["Intermediate", "Advanced"], "recommended_play_style": ["All-Court", "Serve & Volley"], "price_range": "Premium", "price_range_value": 23000, "image_url": "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400", "description": "Djokovic's racket. Perfect balance of power and control for all-court dominance."},
    {"id": "tn_r004", "brand": "Yonex", "model": "EZONE 100 2024", "category": "tennis_racket", "sport": "tennis", "weight_grams": 300, "head_size": 100, "balance": "Even", "string_pattern": "16x19", "stiffness": 68, "recommended_skill_level": ["Beginner+", "Intermediate"], "recommended_play_style": ["All-Court", "Baseliner"], "price_range": "Premium", "price_range_value": 21000, "image_url": "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400", "description": "Osaka's racket. Isometric head shape for larger sweet spot. Comfortable and powerful."},
    {"id": "tn_r005", "brand": "Wilson", "model": "Clash 100 v2", "category": "tennis_racket", "sport": "tennis", "weight_grams": 295, "head_size": 100, "balance": "Even", "string_pattern": "16x19", "stiffness": 55, "recommended_skill_level": ["Beginner", "Beginner+"], "recommended_play_style": ["All-Court", "Counter-Puncher"], "price_range": "High", "price_range_value": 18000, "image_url": "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400", "description": "Revolutionary flex for arm-friendly power. FreeFlex technology bends on both axes."},
    {"id": "tn_r006", "brand": "Babolat", "model": "Boost Drive", "category": "tennis_racket", "sport": "tennis", "weight_grams": 260, "head_size": 105, "balance": "Head Heavy", "string_pattern": "16x19", "stiffness": 70, "recommended_skill_level": ["Beginner", "Beginner+"], "recommended_play_style": ["All-Court", "Baseliner"], "price_range": "Medium", "price_range_value": 8000, "image_url": "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400", "description": "Lightweight beginner racket. Pre-strung, ready to play. Forgiving large head."},
]

# ══════════════════════════════════════
# PICKLEBALL EQUIPMENT
# ══════════════════════════════════════

PB_PADDLES = [
    {"id": "pb_p001", "brand": "JOOLA", "model": "Ben Johns Hyperion CFS 16", "category": "pb_paddle", "sport": "pickleball", "weight_grams": 230, "core": "Polymer Honeycomb", "face": "Carbon Fiber", "shape": "Elongated", "grip_size": "4.25\"", "recommended_skill_level": ["Intermediate", "Advanced"], "recommended_play_style": ["Power", "All-round"], "price_range": "Premium", "price_range_value": 18000, "image_url": "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400", "description": "#1 player Ben Johns' paddle. Carbon friction surface for insane spin. Tournament choice."},
    {"id": "pb_p002", "brand": "Selkirk", "model": "Vanguard Power Air", "category": "pb_paddle", "sport": "pickleball", "weight_grams": 240, "core": "Polymer X5", "face": "Carbon Fiber", "shape": "Standard", "grip_size": "4.25\"", "recommended_skill_level": ["Intermediate", "Advanced"], "recommended_play_style": ["Power", "All-round"], "price_range": "Premium", "price_range_value": 20000, "image_url": "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400", "description": "Air Dynamic Throat for maximum power. ProSpin+ texture for heavy spin on drives."},
    {"id": "pb_p003", "brand": "Engage", "model": "Pursuit MX 6.0", "category": "pb_paddle", "sport": "pickleball", "weight_grams": 225, "core": "Polymer", "face": "Carbon Fiber", "shape": "Elongated", "grip_size": "4.25\"", "recommended_skill_level": ["Beginner+", "Intermediate"], "recommended_play_style": ["Soft Game", "All-round"], "price_range": "High", "price_range_value": 12000, "image_url": "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400", "description": "Great touch and control. Skin technology for consistent spin. Excellent dinking paddle."},
    {"id": "pb_p004", "brand": "HEAD", "model": "Radical Tour", "category": "pb_paddle", "sport": "pickleball", "weight_grams": 220, "core": "Polymer", "face": "Fiberglass", "shape": "Standard", "grip_size": "4.25\"", "recommended_skill_level": ["Beginner", "Beginner+"], "recommended_play_style": ["All-round", "Soft Game"], "price_range": "Medium", "price_range_value": 7000, "image_url": "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400", "description": "Comfortable beginner paddle from HEAD. Forgiving sweet spot with good pop."},
    {"id": "pb_p005", "brand": "Niupipo", "model": "Explorer Pro", "category": "pb_paddle", "sport": "pickleball", "weight_grams": 215, "core": "Polymer Honeycomb", "face": "Fiberglass", "shape": "Standard", "grip_size": "4.25\"", "recommended_skill_level": ["Beginner", "Beginner+"], "recommended_play_style": ["All-round"], "price_range": "Low", "price_range_value": 3000, "image_url": "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400", "description": "Best value beginner paddle. Lightweight, comfortable grip, USAPA approved."},
]

# ══════════════════════════════════════
# PRICE COMPARISONS (all sports)
# ══════════════════════════════════════

ALL_PRICES = [
    # Table Tennis
    {"product_id": "tt_b001", "marketplace": "Amazon", "price": 11500, "mrp": 13000, "discount_percent": 12, "listing_url": "https://www.amazon.in/s?k=butterfly+timo+boll+alc", "shipping": "Free", "delivery_days": 3},
    {"product_id": "tt_b001", "marketplace": "TableTennisStore", "price": 11999, "mrp": 13000, "discount_percent": 8, "listing_url": "https://www.tabletennisstore.in/", "shipping": "Free", "delivery_days": 5},
    {"product_id": "tt_b004", "marketplace": "Amazon", "price": 7200, "mrp": 8500, "discount_percent": 15, "listing_url": "https://www.amazon.in/s?k=dhs+hurricane+long+5", "shipping": "Free", "delivery_days": 3},
    {"product_id": "tt_b005", "marketplace": "Amazon", "price": 4200, "mrp": 5000, "discount_percent": 16, "listing_url": "https://www.amazon.in/s?k=butterfly+primorac", "shipping": "Free", "delivery_days": 3},
    {"product_id": "tt_b006", "marketplace": "Amazon", "price": 2200, "mrp": 2800, "discount_percent": 21, "listing_url": "https://www.amazon.in/s?k=stiga+allround+classic", "shipping": "Free", "delivery_days": 2},
    {"product_id": "tt_b006", "marketplace": "Flipkart", "price": 2350, "mrp": 2800, "discount_percent": 16, "listing_url": "https://www.flipkart.com/search?q=stiga+allround+classic", "shipping": "Free", "delivery_days": 3},
    {"product_id": "tt_r001", "marketplace": "Amazon", "price": 5200, "mrp": 6000, "discount_percent": 13, "listing_url": "https://www.amazon.in/s?k=butterfly+tenergy+05", "shipping": "Free", "delivery_days": 4},
    {"product_id": "tt_r002", "marketplace": "Amazon", "price": 2200, "mrp": 2800, "discount_percent": 21, "listing_url": "https://www.amazon.in/s?k=dhs+hurricane+3+neo", "shipping": "Free", "delivery_days": 3},
    {"product_id": "tt_r004", "marketplace": "Amazon", "price": 1600, "mrp": 2000, "discount_percent": 20, "listing_url": "https://www.amazon.in/s?k=yasaka+mark+v", "shipping": "Free", "delivery_days": 3},
    # Tennis
    {"product_id": "tn_r001", "marketplace": "Amazon", "price": 20500, "mrp": 23000, "discount_percent": 11, "listing_url": "https://www.amazon.in/s?k=wilson+pro+staff+97+v14", "shipping": "Free", "delivery_days": 4},
    {"product_id": "tn_r001", "marketplace": "Tennis-Point", "price": 19999, "mrp": 23000, "discount_percent": 13, "listing_url": "https://www.tennis-point.com/", "shipping": "₹299", "delivery_days": 7},
    {"product_id": "tn_r002", "marketplace": "Amazon", "price": 22500, "mrp": 25000, "discount_percent": 10, "listing_url": "https://www.amazon.in/s?k=babolat+pure+aero+2024", "shipping": "Free", "delivery_days": 4},
    {"product_id": "tn_r004", "marketplace": "Amazon", "price": 19500, "mrp": 22000, "discount_percent": 11, "listing_url": "https://www.amazon.in/s?k=yonex+ezone+100", "shipping": "Free", "delivery_days": 3},
    {"product_id": "tn_r005", "marketplace": "Amazon", "price": 16500, "mrp": 19000, "discount_percent": 13, "listing_url": "https://www.amazon.in/s?k=wilson+clash+100+v2", "shipping": "Free", "delivery_days": 3},
    {"product_id": "tn_r005", "marketplace": "Flipkart", "price": 17200, "mrp": 19000, "discount_percent": 9, "listing_url": "https://www.flipkart.com/search?q=wilson+clash+100", "shipping": "Free", "delivery_days": 4},
    {"product_id": "tn_r006", "marketplace": "Amazon", "price": 7200, "mrp": 8500, "discount_percent": 15, "listing_url": "https://www.amazon.in/s?k=babolat+boost+drive", "shipping": "Free", "delivery_days": 2},
    {"product_id": "tn_r006", "marketplace": "Decathlon", "price": 7499, "mrp": 8500, "discount_percent": 12, "listing_url": "https://www.decathlon.in/search?q=babolat+boost+drive", "shipping": "Free", "delivery_days": 3},
    # Pickleball
    {"product_id": "pb_p001", "marketplace": "Amazon", "price": 16500, "mrp": 19000, "discount_percent": 13, "listing_url": "https://www.amazon.in/s?k=joola+ben+johns+hyperion", "shipping": "Free", "delivery_days": 5},
    {"product_id": "pb_p003", "marketplace": "Amazon", "price": 11000, "mrp": 13000, "discount_percent": 15, "listing_url": "https://www.amazon.in/s?k=engage+pursuit+mx", "shipping": "Free", "delivery_days": 5},
    {"product_id": "pb_p004", "marketplace": "Amazon", "price": 6500, "mrp": 7500, "discount_percent": 13, "listing_url": "https://www.amazon.in/s?k=head+radical+tour+pickleball", "shipping": "Free", "delivery_days": 3},
    {"product_id": "pb_p004", "marketplace": "Decathlon", "price": 6799, "mrp": 7500, "discount_percent": 9, "listing_url": "https://www.decathlon.in/search?q=head+pickleball", "shipping": "Free", "delivery_days": 3},
    {"product_id": "pb_p005", "marketplace": "Amazon", "price": 2500, "mrp": 3500, "discount_percent": 29, "listing_url": "https://www.amazon.in/s?k=niupipo+pickleball+paddle", "shipping": "Free", "delivery_days": 2},
    {"product_id": "pb_p005", "marketplace": "Flipkart", "price": 2800, "mrp": 3500, "discount_percent": 20, "listing_url": "https://www.flipkart.com/search?q=niupipo+pickleball", "shipping": "Free", "delivery_days": 3},
]

ALL_EQUIPMENT = TT_BLADES + TT_RUBBERS + TENNIS_RACKETS + PB_PADDLES


async def seed():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=10000)
    db = client[os.environ['DB_NAME']]

    # Insert equipment (skip if ID already exists)
    inserted = 0
    for eq in ALL_EQUIPMENT:
        existing = await db.equipment.find_one({"id": eq["id"]})
        if not existing:
            await db.equipment.insert_one(eq)
            inserted += 1
    print(f"Inserted {inserted} new equipment items")

    # Insert prices
    price_inserted = 0
    for p in ALL_PRICES:
        existing = await db.equipment_prices.find_one({"product_id": p["product_id"], "marketplace": p["marketplace"]})
        if not existing:
            await db.equipment_prices.insert_one(p)
            price_inserted += 1
    print(f"Inserted {price_inserted} new price entries")

    # Also add sport tag to existing badminton equipment
    result = await db.equipment.update_many(
        {"sport": {"$exists": False}, "category": {"$in": ["racket", "shoes", "shuttlecock", "string", "grip", "bag"]}},
        {"$set": {"sport": "badminton"}}
    )
    print(f"Tagged {result.modified_count} badminton items with sport field")

    # Verify
    for sport in ["badminton", "table_tennis", "tennis", "pickleball"]:
        count = await db.equipment.count_documents({"sport": sport})
        print(f"  {sport}: {count} items")

    total_prices = await db.equipment_prices.count_documents({})
    print(f"  Total prices: {total_prices}")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
