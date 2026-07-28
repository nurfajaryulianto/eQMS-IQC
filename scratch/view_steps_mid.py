import os
import json

transcript_path = r"C:\Users\fajar.yulianto\.gemini\antigravity-ide\brain\788926ff-976a-4090-8246-9c5ac523717b\.system_generated\logs\transcript_full.jsonl"
if os.path.exists(transcript_path):
    with open(transcript_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            try:
                data = json.loads(line)
                step = data.get("step_index")
                if 1917 <= step < 1979:
                    t = data.get("type")
                    src = data.get("source")
                    if t == "USER_INPUT":
                        print(f"=== STEP {step} (USER_INPUT) ===")
                        print(data.get("content", ""))
                    elif t == "PLANNER_RESPONSE":
                        # print target files of replacements or tool calls
                        calls = data.get("tool_calls", [])
                        if calls:
                            print(f"=== STEP {step} (PLANNER_RESPONSE) ===")
                            for c in calls:
                                print(f"  Tool: {c.get('name')}, Args: {json.dumps(c.get('args'))}")
            except Exception as e:
                pass
