import sys
import os
import time
import base64
import cv2
import numpy as np
from pymongo import MongoClient
from deepface import DeepFace

for stream in (sys.stdout, sys.stderr):
    if stream is not None and hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

client = MongoClient("mongodb://localhost:27017")
db = client["bus-fee-system"]
students = db["students"]

registered_count = 0
for s in students.find():
    photo = s.get("photoUrl") or ""
    if not photo:
        print(f"Skipping {s.get('studentId')} ({s.get('firstName')}): No photoUrl")
        continue

    if "," in photo:
        photo = photo.split(",", 1)[1]

    try:
        raw = base64.b64decode(photo)
        frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            print(f"Could not decode image for {s.get('studentId')}")
            continue

        res = DeepFace.represent(frame, model_name="SFace", detector_backend="yunet", enforce_detection=False)
        if not res or not res[0].get("embedding"):
            print(f"No face detected in photo for {s.get('studentId')}")
            continue

        emb = res[0]["embedding"]
        arr = np.asarray(emb, dtype=np.float32)
        norm = float(np.linalg.norm(arr))
        if norm > 0:
            arr = arr / norm
        unit_emb = [round(float(v), 8) for v in arr]

        students.update_one(
            {"_id": s["_id"]},
            {
                "$set": {
                    "faceRegistrationStatus": "registered",
                    "faceData": {
                        "embeddings": unit_emb,
                        "templates": [unit_emb],
                        "modelVersion": "SFace",
                        "registeredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "lastUpdatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    },
                }
            },
        )
        registered_count += 1
        print(f"SUCCESS: Registered face for {s.get('studentId')} ({s.get('firstName')} {s.get('lastName')}) - 128-d embedding saved.")
    except Exception as e:
        print(f"Error processing {s.get('studentId')}: {e}")

print(f"\nDone! Total faces registered: {registered_count}")
