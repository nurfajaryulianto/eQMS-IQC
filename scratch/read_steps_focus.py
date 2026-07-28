import os
import json

transcript_path = r"C:\Users\fajar.yulianto\.gemini\antigravity-ide\brain\788926ff-976a-4090-8246-9c5ac523717b\.system_generated\logs\transcript_full.jsonl"
if os.path.exists(transcript_path):
    with open(transcript_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            try:
                data = json.loads(line)
                step = data.get("step_index")
                if 1900 <= step <= 2000:
                    t = data.get("type")
                    src = data.get("source")
                    if t in ["USER_INPUT", "PLANNER_RESPONSE"] or src in ["USER_EXPLICIT", "MODEL"]:
                        print(f"=== STEP {step} ({t}, {src}) ===")
                        content = data.get("content", "")
                        if content:
                            # print first 300 chars and last 300 chars of content if long
                            if len(content) > 600:
                                print(content[:300] + "\n... [TRUNCATED] ...\n" + content[-300:])
                            else:
                                print(content)
                        tool_calls = data.get("tool_calls", [])
                        if tool_calls:
                            print("Tool Calls:", json.dumps(tool_calls))
                        print("=" * 60)
            except Exception as e:
                pass
