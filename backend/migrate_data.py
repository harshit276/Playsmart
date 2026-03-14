"""Migration script to update MongoDB with real images, YouTube URLs, and buying links."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

YONEX_RACKET_IMG = "https://static.prod-images.emergentagent.com/jobs/035e25b9-61d2-4df2-9c16-ff5da32e4b84/images/fce066dafc408823a10e0929beab4b14b544421da7155434582845ffd3362d38.png"
LINING_RACKET_IMG = "https://static.prod-images.emergentagent.com/jobs/035e25b9-61d2-4df2-9c16-ff5da32e4b84/images/fb811fb4928833a92d3d96e16b96fe5e3b0cccf10f87773ffb3918881f09cb9b.png"
COURT_SHOES_IMG = "https://static.prod-images.emergentagent.com/jobs/035e25b9-61d2-4df2-9c16-ff5da32e4b84/images/b7e8efbb69f51bbb39bb86d55beebb78b5140365bd09b68d4492eec6f12e8b91.png"
GEAR_IMG = "https://static.prod-images.emergentagent.com/jobs/035e25b9-61d2-4df2-9c16-ff5da32e4b84/images/32ceb3185691844b706704b79a9daf27004521226942e2c415043575e71439c3.png"
SHUTTLECOCK_IMG = "https://images.unsplash.com/photo-1765544581327-b5e9055d986c?w=400"
RACKET_ALT_IMG = "https://images.unsplash.com/photo-1613918702390-48771f69c133?w=400"

async def migrate():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["test_database"]

    # 1. Update equipment images by brand/category
    for brand, img in {"Yonex": YONEX_RACKET_IMG, "Li-Ning": LINING_RACKET_IMG, "Victor": RACKET_ALT_IMG, "Perfly": RACKET_ALT_IMG}.items():
        await db.equipment.update_many({"category": "racket", "brand": brand}, {"$set": {"image_url": img}})
    await db.equipment.update_many({"category": "shoes"}, {"$set": {"image_url": COURT_SHOES_IMG}})
    await db.equipment.update_many({"category": "shuttlecock"}, {"$set": {"image_url": SHUTTLECOCK_IMG}})
    await db.equipment.update_many({"category": {"$in": ["string", "grip", "bag"]}}, {"$set": {"image_url": GEAR_IMG}})
    print("Images updated")

    # 2. Update buying links + add prices for all products
    all_eq = await db.equipment.find({}, {"_id": 0}).to_list(200)
    existing_prices = await db.equipment_prices.find({}, {"_id": 0}).to_list(500)
    existing_map = {}
    for p in existing_prices:
        key = f"{p['product_id']}_{p['marketplace']}"
        existing_map[key] = p

    # Update existing prices with real search URLs
    for p in existing_prices:
        product = next((eq for eq in all_eq if eq["id"] == p["product_id"]), None)
        if not product:
            continue
        st = f"{product['brand']}+{product['model'].replace(' ', '+')}+Badminton+{product['category']}"
        urls = {
            "Amazon": f"https://www.amazon.in/s?k={st}",
            "Flipkart": f"https://www.flipkart.com/search?q={st.replace('+', '%20')}",
            "Decathlon": f"https://www.decathlon.in/search?Ntt={st.replace('+', '%20')}",
        }
        new_url = urls.get(p["marketplace"], p.get("listing_url", ""))
        await db.equipment_prices.update_one(
            {"product_id": p["product_id"], "marketplace": p["marketplace"]},
            {"$set": {"listing_url": new_url}}
        )

    # Add prices for products that don't have any
    products_with_prices = set(p["product_id"] for p in existing_prices)
    new_prices = []
    for eq in all_eq:
        if eq["id"] in products_with_prices:
            continue
        bp = eq.get("price_range_value", 5000)
        st = f"{eq['brand']}+{eq['model'].replace(' ', '+')}+Badminton+{eq['category']}"
        new_prices.append({"product_id": eq["id"], "marketplace": "Amazon", "price": int(bp * 0.9), "mrp": int(bp * 1.1), "discount_percent": 18, "shipping_fee": 0, "delivery_eta": "2-4 days", "listing_url": f"https://www.amazon.in/s?k={st}"})
        new_prices.append({"product_id": eq["id"], "marketplace": "Flipkart", "price": int(bp * 0.95), "mrp": int(bp * 1.1), "discount_percent": 14, "shipping_fee": 0, "delivery_eta": "3-5 days", "listing_url": f"https://www.flipkart.com/search?q={st.replace('+', '%20')}"})
        if eq["brand"] in ["Perfly", "Decathlon"]:
            new_prices.append({"product_id": eq["id"], "marketplace": "Decathlon", "price": int(bp * 0.85), "mrp": int(bp * 1.0), "discount_percent": 15, "shipping_fee": 0, "delivery_eta": "2-3 days", "listing_url": f"https://www.decathlon.in/search?Ntt={st.replace('+', '%20')}"})
    if new_prices:
        await db.equipment_prices.insert_many(new_prices)
    print(f"Prices updated. Added {len(new_prices)} new price entries")

    # 3. Replace drill videos with REAL YouTube URLs
    await db.drill_videos.delete_many({})
    real_videos = [
        {"drill_id": "d001", "video_title": "Footwork Styles: Move Fast on Court", "youtube_url": "https://www.youtube.com/watch?v=nsz448MxkZw", "channel_name": "Tobias Wadenka", "video_focus": "Basic footwork movement patterns"},
        {"drill_id": "d001", "video_title": "4 Corner Footwork Tutorial", "youtube_url": "https://www.youtube.com/watch?v=fBa08o5GEqw", "channel_name": "Badminton Insight", "video_focus": "Step-by-step corner footwork"},
        {"drill_id": "d002", "video_title": "4 Corner Footwork - Step-By-Step", "youtube_url": "https://www.youtube.com/watch?v=fBa08o5GEqw", "channel_name": "Badminton Insight", "video_focus": "Split steps, lunges, and recovery"},
        {"drill_id": "d002", "video_title": "20 Min Four Corners Session", "youtube_url": "https://www.youtube.com/watch?v=N9jukZlmkns", "channel_name": "Tobias Wadenka", "video_focus": "Complete footwork training session"},
        {"drill_id": "d003", "video_title": "Rearcourt Footwork Patterns", "youtube_url": "https://www.youtube.com/watch?v=R_HUNyAlfiY", "channel_name": "Tobias Wadenka", "video_focus": "12 rearcourt footwork patterns"},
        {"drill_id": "d004", "video_title": "Footwork Styles: Move Fast", "youtube_url": "https://www.youtube.com/watch?v=nsz448MxkZw", "channel_name": "Tobias Wadenka", "video_focus": "Advanced footwork patterns"},
        {"drill_id": "d005", "video_title": "Perfect Badminton Clear - 6 Steps", "youtube_url": "https://www.youtube.com/watch?v=vqZ7A9mp1ds", "channel_name": "Coaching Badminton", "video_focus": "Clear technique fundamentals"},
        {"drill_id": "d006", "video_title": "How to Play a CLEAR", "youtube_url": "https://www.youtube.com/watch?v=MYHLzn4VTCQ", "channel_name": "Coaching Badminton", "video_focus": "Clear technique and power"},
        {"drill_id": "d006", "video_title": "Fix Your Clear in 3 Steps", "youtube_url": "https://www.youtube.com/watch?v=sv4mCgqzFEs", "channel_name": "Allegiance Badminton", "video_focus": "Common clear mistakes and fixes"},
        {"drill_id": "d007", "video_title": "Fix Your Clear in 3 Steps", "youtube_url": "https://www.youtube.com/watch?v=sv4mCgqzFEs", "channel_name": "Allegiance Badminton", "video_focus": "Drop shot precision techniques"},
        {"drill_id": "d009", "video_title": "How to Play The PERFECT SMASH", "youtube_url": "https://www.youtube.com/watch?v=faG2NWIVM18", "channel_name": "Basicfeather", "video_focus": "4-phase smash technique"},
        {"drill_id": "d009", "video_title": "Improve Your SMASH Power", "youtube_url": "https://www.youtube.com/watch?v=H7kpZ9inc10", "channel_name": "Badminton Insight", "video_focus": "Smash positioning and power"},
        {"drill_id": "d010", "video_title": "5 Drills for PERFECT SMASH", "youtube_url": "https://www.youtube.com/watch?v=HiRIad6dJBI", "channel_name": "Coaching Badminton", "video_focus": "Smash drills for consistency"},
        {"drill_id": "d011", "video_title": "Master The Stick Smash", "youtube_url": "https://www.youtube.com/watch?v=atct-8dSwcU", "channel_name": "Badminton Insight", "video_focus": "Jump smash and stick smash"},
        {"drill_id": "d011", "video_title": "Play The PERFECT SMASH", "youtube_url": "https://www.youtube.com/watch?v=faG2NWIVM18", "channel_name": "Basicfeather", "video_focus": "Full smash breakdown"},
        {"drill_id": "d012", "video_title": "Improve SMASH Power and Timing", "youtube_url": "https://www.youtube.com/watch?v=H7kpZ9inc10", "channel_name": "Badminton Insight", "video_focus": "Continuous smash technique"},
        {"drill_id": "d013", "video_title": "The 2 Types Of NET KILL", "youtube_url": "https://www.youtube.com/watch?v=BIZ6PJ8z5Uo", "channel_name": "Badminton Insight", "video_focus": "Net shot and net kill basics"},
        {"drill_id": "d014", "video_title": "NET KILL To Win The Point", "youtube_url": "https://www.youtube.com/watch?v=BIZ6PJ8z5Uo", "channel_name": "Badminton Insight", "video_focus": "Easy kill and jump kill"},
        {"drill_id": "d015", "video_title": "NET KILL Techniques", "youtube_url": "https://www.youtube.com/watch?v=BIZ6PJ8z5Uo", "channel_name": "Badminton Insight", "video_focus": "Spinning net shot technique"},
        {"drill_id": "d017", "video_title": "Learn THIS Defensive Technique", "youtube_url": "https://www.youtube.com/watch?v=RVJZHqi_GCo", "channel_name": "Badminton Insight", "video_focus": "Backhand defense fundamentals"},
        {"drill_id": "d017", "video_title": "Defend A Powerful Smash (6 Steps)", "youtube_url": "https://www.youtube.com/watch?v=BQfXztjZcIA", "channel_name": "Badminton Insight", "video_focus": "6 steps to defend smash"},
        {"drill_id": "d018", "video_title": "Defend A Powerful Smash", "youtube_url": "https://www.youtube.com/watch?v=BQfXztjZcIA", "channel_name": "Badminton Insight", "video_focus": "Full-court defense technique"},
        {"drill_id": "d019", "video_title": "Defensive Technique Masterclass", "youtube_url": "https://www.youtube.com/watch?v=RVJZHqi_GCo", "channel_name": "Badminton Insight", "video_focus": "Drive defense and counter"},
        {"drill_id": "d033", "video_title": "Backhand Serve Like A PRO", "youtube_url": "https://www.youtube.com/watch?v=ZlPxYx7VRGA", "channel_name": "Badminton Insight", "video_focus": "Service technique for all levels"},
        {"drill_id": "d034", "video_title": "Backhand Serve Step-By-Step", "youtube_url": "https://www.youtube.com/watch?v=ZlPxYx7VRGA", "channel_name": "Badminton Insight", "video_focus": "Low serve technique"},
        {"drill_id": "d034", "video_title": "BACKHAND FLICK SERVE", "youtube_url": "https://www.youtube.com/watch?v=wad0j6i-j6w", "channel_name": "Badminton Insight", "video_focus": "Flick serve for deception"},
        {"drill_id": "d035", "video_title": "Perfect Clear - 6 Steps", "youtube_url": "https://www.youtube.com/watch?v=vqZ7A9mp1ds", "channel_name": "Coaching Badminton", "video_focus": "Cross-court clear technique"},
        {"drill_id": "d037", "video_title": "4 Corner Footwork Tutorial", "youtube_url": "https://www.youtube.com/watch?v=fBa08o5GEqw", "channel_name": "Badminton Insight", "video_focus": "Front-back movement"},
        {"drill_id": "d038", "video_title": "Footwork Styles for Court", "youtube_url": "https://www.youtube.com/watch?v=nsz448MxkZw", "channel_name": "Tobias Wadenka", "video_focus": "Lateral lunge technique"},
        {"drill_id": "d039", "video_title": "BACKHAND CLEAR Biomechanics", "youtube_url": "https://www.youtube.com/watch?v=GqHK8-wKcLo", "channel_name": "Coaching Badminton", "video_focus": "Backhand clear technique"},
        {"drill_id": "d040", "video_title": "NET KILL Techniques", "youtube_url": "https://www.youtube.com/watch?v=BIZ6PJ8z5Uo", "channel_name": "Badminton Insight", "video_focus": "Backhand drop to net"},
        {"drill_id": "d042", "video_title": "NET KILL To Win Points", "youtube_url": "https://www.youtube.com/watch?v=BIZ6PJ8z5Uo", "channel_name": "Badminton Insight", "video_focus": "Cross-net shot technique"},
        {"drill_id": "d043", "video_title": "5 Drills for PERFECT SMASH", "youtube_url": "https://www.youtube.com/watch?v=HiRIad6dJBI", "channel_name": "Coaching Badminton", "video_focus": "Smash and follow-in drill"},
        {"drill_id": "d047", "video_title": "Defend A Powerful Smash", "youtube_url": "https://www.youtube.com/watch?v=BQfXztjZcIA", "channel_name": "Badminton Insight", "video_focus": "Defense to counter transitions"},
        {"drill_id": "d049", "video_title": "NET KILL Techniques", "youtube_url": "https://www.youtube.com/watch?v=BIZ6PJ8z5Uo", "channel_name": "Badminton Insight", "video_focus": "Net brush shot technique"},
        {"drill_id": "d050", "video_title": "Defensive Technique", "youtube_url": "https://www.youtube.com/watch?v=RVJZHqi_GCo", "channel_name": "Badminton Insight", "video_focus": "Backhand drive technique"},
        {"drill_id": "d051", "video_title": "Rearcourt Footwork Patterns", "youtube_url": "https://www.youtube.com/watch?v=R_HUNyAlfiY", "channel_name": "Tobias Wadenka", "video_focus": "Explosive lunge training"},
        {"drill_id": "d052", "video_title": "4 Corner Footwork", "youtube_url": "https://www.youtube.com/watch?v=fBa08o5GEqw", "channel_name": "Badminton Insight", "video_focus": "Chasse step technique"},
        {"drill_id": "d053", "video_title": "Backhand Serve PRO", "youtube_url": "https://www.youtube.com/watch?v=ZlPxYx7VRGA", "channel_name": "Badminton Insight", "video_focus": "Service rush practice"},
        {"drill_id": "d056", "video_title": "20 Min Footwork Session", "youtube_url": "https://www.youtube.com/watch?v=N9jukZlmkns", "channel_name": "Tobias Wadenka", "video_focus": "Mirror footwork exercises"},
        {"drill_id": "d058", "video_title": "BACKHAND FLICK SERVE", "youtube_url": "https://www.youtube.com/watch?v=wad0j6i-j6w", "channel_name": "Badminton Insight", "video_focus": "Singles serving strategy"},
        {"drill_id": "d059", "video_title": "Master Doubles Rotation", "youtube_url": "https://www.youtube.com/watch?v=oGyUF7CYNVM", "channel_name": "Coaching Badminton", "video_focus": "3-step rotation guide"},
        {"drill_id": "d059", "video_title": "Doubles Rotation Drill", "youtube_url": "https://www.youtube.com/watch?v=1aK3_f4v9hA", "channel_name": "Coach Kowi Chandra", "video_focus": "Attacking rotation drills"},
    ]
    await db.drill_videos.insert_many(real_videos)
    print(f"Inserted {len(real_videos)} real YouTube video links")

    client.close()
    print("Migration complete!")

asyncio.run(migrate())
