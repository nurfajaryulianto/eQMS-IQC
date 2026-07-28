import os
import json

transcript_path = r"C:\Users\fajar.yulianto\.gemini\antigravity-ide\brain\788926ff-976a-4090-8246-9c5ac523717b\.system_generated\logs\transcript_full.jsonl"
if not os.path.exists(transcript_path):
    print("Transcript not found at:", transcript_path)
else:
    print("Reading full transcript...")
    with open(transcript_path, 'r', encoding='utf-8', errors='ignore') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index")
                if step >= 1914:
                    print(f"=== STEP {step} ({data.get('type')}, {data.get('source')}) ===")
                    content = data.get("content", "")
                    if content:
                        print(content[:1500])
                    tool_calls = data.get("tool_calls", [])
                    if tool_calls:
                        print("Tool calls:", json.dumps(tool_calls)[:500])
                    print("=" * 60)
            except Exception as e:
                pass
