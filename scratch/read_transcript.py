import os
import json

transcript_path = r"C:\Users\fajar.yulianto\.gemini\antigravity-ide\brain\788926ff-976a-4090-8246-9c5ac523717b\.system_generated\logs\transcript.jsonl"
if not os.path.exists(transcript_path):
    print("Transcript not found at:", transcript_path)
    # search parent dir
    brain_dir = r"C:\Users\fajar.yulianto\.gemini\antigravity-ide\brain"
    if os.path.exists(brain_dir):
        print("Brain dir contents:", os.listdir(brain_dir))
else:
    print("Found transcript. Reading user inputs...")
    with open(transcript_path, 'r', encoding='utf-8', errors='ignore') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                if data.get("type") == "USER_INPUT":
                    print(f"Step {data.get('step_index')}:")
                    content = data.get("content", "")
                    # print first 500 chars of content
                    print(content[:500])
                    print("-" * 50)
            except Exception as e:
                print("Error parsing line:", e)
