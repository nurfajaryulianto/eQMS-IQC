import os
import json

transcript_path = r"C:\Users\fajar.yulianto\.gemini\antigravity-ide\brain\788926ff-976a-4090-8246-9c5ac523717b\.system_generated\logs\transcript_full.jsonl"
if os.path.exists(transcript_path):
    with open(transcript_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            try:
                data = json.loads(line)
                step = data.get("step_index")
                if 1980 <= step < 2250:
                    t = data.get("type")
                    src = data.get("source")
                    if t == "PLANNER_RESPONSE" and not data.get("tool_calls"):
                        print(f"=== STEP {step} (PLANNER_RESPONSE, MODEL) ===")
                        print(data.get("content", "")[:1200])
                        print("-" * 60)
            except Exception as e:
                pass
