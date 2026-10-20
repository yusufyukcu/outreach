"""The Gemini models the API key can use; with --call, one tiny paid call (does the credit work?)."""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")
from eqi.__main__ import _load_env_file
_load_env_file()
from google import genai
from google.genai import errors
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
names = []
for m in client.models.list():
    n = m.name.replace("models/", "")
    if "pro" in n or "flash" in n:
        names.append(n)
print("models:", " ".join(sorted(names)))
if "--call" in sys.argv:
    try:
        r = client.models.generate_content(model="gemini-3.1-pro-preview", contents="Reply with the single word OK.")
        print("call ok:", repr((r.text or "").strip()[:20]), r.usage_metadata.total_token_count, "tokens")
    except errors.APIError as e:
        print("call failed:", e.code, str(e)[:300])
