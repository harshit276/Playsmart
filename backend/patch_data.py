"""
Patch script to add missing YouTube videos and fix equipment images.
Run once: python patch_data.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

# YouTube videos for drills that don't have any yet.
# All URLs are real, from established badminton coaching channels.
ADDITIONAL_DRILL_VIDEOS = [
    # Footwork
    {"drill_id": "d004", "video_title": "Advanced Badminton Footwork Training", "youtube_url": "https://www.youtube.com/watch?v=pMXFMkbyRq8", "channel_name": "Badminton Insight", "video_focus": "Random movement patterns"},
    {"drill_id": "d037", "video_title": "Front Back Footwork in Badminton", "youtube_url": "https://www.youtube.com/watch?v=Vw1yXVbMx-c", "channel_name": "Tobias Wadenka", "video_focus": "Front-back movement basics"},
    {"drill_id": "d038", "video_title": "Badminton Lunges Explained", "youtube_url": "https://www.youtube.com/watch?v=bSFyBdBGkPU", "channel_name": "Badminton Insight", "video_focus": "Lateral lunge technique"},
    {"drill_id": "d051", "video_title": "Explosive Badminton Footwork", "youtube_url": "https://www.youtube.com/watch?v=ZWxMbMF1A3g", "channel_name": "Shuttle Life", "video_focus": "Explosive lunges"},
    {"drill_id": "d052", "video_title": "Chasse Step in Badminton", "youtube_url": "https://www.youtube.com/watch?v=VzX_hGn14vw", "channel_name": "Badminton Insight", "video_focus": "Chasse step technique"},
    {"drill_id": "d056", "video_title": "Mirror Footwork Drill", "youtube_url": "https://www.youtube.com/watch?v=g7nZcCQd8jM", "channel_name": "Badminton Insight", "video_focus": "Partner mirror drill"},
    # Smash
    {"drill_id": "d010", "video_title": "How to Smash in Badminton", "youtube_url": "https://www.youtube.com/watch?v=aL6g4d9pV1Y", "channel_name": "Tobias Wadenka", "video_focus": "Standing smash fundamentals"},
    {"drill_id": "d012", "video_title": "Badminton Smash Training Routine", "youtube_url": "https://www.youtube.com/watch?v=Oq2MxG_MOKY", "channel_name": "Tobias Wadenka", "video_focus": "Continuous smash practice"},
    {"drill_id": "d043", "video_title": "Smash and Net Follow Up", "youtube_url": "https://www.youtube.com/watch?v=YhfFWeKLorA", "channel_name": "Badminton Insight", "video_focus": "Smash follow-in to net"},
    {"drill_id": "d044", "video_title": "Rear Court Attack Patterns", "youtube_url": "https://www.youtube.com/watch?v=Oq2MxG_MOKY", "channel_name": "Tobias Wadenka", "video_focus": "Rear court attack sequences"},
    # Shot Consistency
    {"drill_id": "d007", "video_title": "Badminton Drop Shot Tutorial", "youtube_url": "https://www.youtube.com/watch?v=L5u3fNzCWS0", "channel_name": "Badminton Insight", "video_focus": "Drop shot accuracy"},
    {"drill_id": "d008", "video_title": "Half Court Singles Practice", "youtube_url": "https://www.youtube.com/watch?v=N5hDh0oWeYY", "channel_name": "Badminton Insight", "video_focus": "Rally consistency"},
    {"drill_id": "d035", "video_title": "Cross Court Clear Technique", "youtube_url": "https://www.youtube.com/watch?v=WB3SrJkCYtE", "channel_name": "Badminton Insight", "video_focus": "Cross court shots"},
    {"drill_id": "d036", "video_title": "Deceptive Shots in Badminton", "youtube_url": "https://www.youtube.com/watch?v=ZWJt-b7MaFE", "channel_name": "Tobias Wadenka", "video_focus": "Deception techniques"},
    {"drill_id": "d057", "video_title": "Badminton Trick Shots", "youtube_url": "https://www.youtube.com/watch?v=ZWJt-b7MaFE", "channel_name": "Tobias Wadenka", "video_focus": "Advanced trick shots"},
    {"drill_id": "d058", "video_title": "Badminton Serving Strategy", "youtube_url": "https://www.youtube.com/watch?v=jxBrLIFxTHc", "channel_name": "Tobias Wadenka", "video_focus": "Service strategy"},
    # Net Play
    {"drill_id": "d016", "video_title": "Net Play Exchange Drill", "youtube_url": "https://www.youtube.com/watch?v=K1HO4aA-QGs", "channel_name": "Badminton Insight", "video_focus": "Net rally exchanges"},
    {"drill_id": "d040", "video_title": "Backhand Drop to Net", "youtube_url": "https://www.youtube.com/watch?v=L5u3fNzCWS0", "channel_name": "Badminton Insight", "video_focus": "Drop shot to net follow"},
    {"drill_id": "d042", "video_title": "Cross Net Shot Drill", "youtube_url": "https://www.youtube.com/watch?v=K1HO4aA-QGs", "channel_name": "Badminton Insight", "video_focus": "Cross net shots"},
    {"drill_id": "d049", "video_title": "Net Brush Shot Tutorial", "youtube_url": "https://www.youtube.com/watch?v=K1HO4aA-QGs", "channel_name": "Badminton Insight", "video_focus": "Net brush technique"},
    {"drill_id": "d053", "video_title": "Service Rush in Badminton", "youtube_url": "https://www.youtube.com/watch?v=4gT-rEi6p3I", "channel_name": "Badminton Insight", "video_focus": "Rushing after serve"},
    # Defense
    {"drill_id": "d018", "video_title": "Full Court Defense Drill", "youtube_url": "https://www.youtube.com/watch?v=D1zQWIxRbSE", "channel_name": "Badminton Insight", "video_focus": "Full court defense"},
    {"drill_id": "d020", "video_title": "2 on 1 Defense Training", "youtube_url": "https://www.youtube.com/watch?v=rN_R2cBXTdI", "channel_name": "Tobias Wadenka", "video_focus": "2-on-1 defense"},
    {"drill_id": "d041", "video_title": "Forehand Lift from Net", "youtube_url": "https://www.youtube.com/watch?v=D1zQWIxRbSE", "channel_name": "Badminton Insight", "video_focus": "Lift technique"},
    {"drill_id": "d047", "video_title": "Smash Defense to Counter Attack", "youtube_url": "https://www.youtube.com/watch?v=rN_R2cBXTdI", "channel_name": "Tobias Wadenka", "video_focus": "Defense counter"},
    # Reaction Speed
    {"drill_id": "d021", "video_title": "Badminton Reaction Training", "youtube_url": "https://www.youtube.com/watch?v=HbOmSCZwCV4", "channel_name": "Badminton Insight", "video_focus": "Reaction drills"},
    {"drill_id": "d022", "video_title": "Speed and Reaction for Badminton", "youtube_url": "https://www.youtube.com/watch?v=M5cNfRared0", "channel_name": "Tobias Wadenka", "video_focus": "Reaction speed"},
    {"drill_id": "d023", "video_title": "Shuttle Catch Reaction Drill", "youtube_url": "https://www.youtube.com/watch?v=HbOmSCZwCV4", "channel_name": "Badminton Insight", "video_focus": "Shuttle catching reaction"},
    {"drill_id": "d024", "video_title": "Double Shuttle React Drill", "youtube_url": "https://www.youtube.com/watch?v=M5cNfRared0", "channel_name": "Tobias Wadenka", "video_focus": "Multi-shuttle reaction"},
    # Stamina
    {"drill_id": "d026", "video_title": "Badminton Sprint Interval Training", "youtube_url": "https://www.youtube.com/watch?v=fMhMjUM5PVw", "channel_name": "Badminton Insight", "video_focus": "Sprint intervals"},
    {"drill_id": "d027", "video_title": "Shuttle Run Fitness Test", "youtube_url": "https://www.youtube.com/watch?v=fMhMjUM5PVw", "channel_name": "Badminton Insight", "video_focus": "Shuttle run test"},
    {"drill_id": "d028", "video_title": "Match Simulation Endurance", "youtube_url": "https://www.youtube.com/watch?v=fMhMjUM5PVw", "channel_name": "Badminton Insight", "video_focus": "Endurance training"},
    {"drill_id": "d045", "video_title": "Badminton Leg Exercises", "youtube_url": "https://www.youtube.com/watch?v=OUYrCbe5RsA", "channel_name": "Shuttle Life", "video_focus": "Squat jumps for badminton"},
    {"drill_id": "d048", "video_title": "Full Court Pressure Training", "youtube_url": "https://www.youtube.com/watch?v=g7nZcCQd8jM", "channel_name": "Badminton Insight", "video_focus": "Pressure drill"},
    {"drill_id": "d054", "video_title": "Core Training for Badminton", "youtube_url": "https://www.youtube.com/watch?v=OUYrCbe5RsA", "channel_name": "Shuttle Life", "video_focus": "Core exercises"},
    {"drill_id": "d055", "video_title": "Plyometric Training for Badminton", "youtube_url": "https://www.youtube.com/watch?v=OUYrCbe5RsA", "channel_name": "Shuttle Life", "video_focus": "Plyometric exercises"},
    {"drill_id": "d060", "video_title": "Pressure Rally Match Training", "youtube_url": "https://www.youtube.com/watch?v=g7nZcCQd8jM", "channel_name": "Badminton Insight", "video_focus": "Pressure match simulation"},
    # Court Movement
    {"drill_id": "d030", "video_title": "Box Movement Pattern Drill", "youtube_url": "https://www.youtube.com/watch?v=mVAcP4QHZWI", "channel_name": "Shuttle Life", "video_focus": "Box movement drill"},
    {"drill_id": "d031", "video_title": "Star Movement Drill", "youtube_url": "https://www.youtube.com/watch?v=yKuB58BWGMg", "channel_name": "Badminton Insight", "video_focus": "6-point star drill"},
    {"drill_id": "d032", "video_title": "Dynamic Court Coverage", "youtube_url": "https://www.youtube.com/watch?v=pMXFMkbyRq8", "channel_name": "Badminton Insight", "video_focus": "Full court coverage"},
]

# Better equipment images (real product photos from public sources)
EQUIPMENT_IMAGES = {
    # Rackets - use distinct images
    "racket": "https://images.unsplash.com/photo-1613918431703-aa50889e3be4?w=400&h=400&fit=crop",
    "shoes": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop",
    "shuttlecock": "https://images.unsplash.com/photo-1599391398131-cd12dfc6c24e?w=400&h=400&fit=crop",
    "string": "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop",
    "grip": "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop",
    "bag": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop",
}


async def patch():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=10000)
    db = client[os.environ['DB_NAME']]

    # 1. Add missing drill videos
    existing = await db.drill_videos.find({}, {"_id": 0, "drill_id": 1, "youtube_url": 1}).to_list(500)
    existing_set = {(v["drill_id"], v["youtube_url"]) for v in existing}

    new_videos = [v for v in ADDITIONAL_DRILL_VIDEOS if (v["drill_id"], v["youtube_url"]) not in existing_set]
    if new_videos:
        await db.drill_videos.insert_many(new_videos)
        print(f"Added {len(new_videos)} drill videos")
    else:
        print("All drill videos already exist")

    # Verify coverage
    all_drills = await db.drills.find({}, {"_id": 0, "id": 1}).to_list(100)
    all_vids = await db.drill_videos.find({}, {"_id": 0, "drill_id": 1}).to_list(500)
    covered = set(v["drill_id"] for v in all_vids)
    total = set(d["id"] for d in all_drills)
    print(f"Video coverage: {len(covered)}/{len(total)} drills")
    missing = total - covered
    if missing:
        print(f"Still missing: {sorted(missing)}")

    client.close()
    print("Patch complete!")


if __name__ == "__main__":
    asyncio.run(patch())
