import subprocess
import re
import time
import json
import os

print("[INFO] Starting Cloudflare Public Tunnel for 100% Free Public Internet Access...")
exe = os.path.join(os.path.dirname(__file__), "cloudflared.exe")

proc = subprocess.Popen(
    [exe, "tunnel", "--url", "http://localhost:8080"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1
)

public_url = None
start_t = time.time()

for line in proc.stdout:
    print(line, end="")
    m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
    if m:
        public_url = m.group(0)
        break
    if time.time() - start_t > 30:
        break

if public_url:
    print("\n" + "=" * 60)
    print(f"[SUCCESS] PUBLIC TUNNEL ACTIVE: {public_url}")
    print("=" * 60)
    
    # Save to public_url.json so the frontend can read it
    with open("public_url.json", "w") as f:
        json.dump({"url": public_url}, f)
        
    # Keep the tunnel process running indefinitely
    for line in proc.stdout:
        pass
    proc.wait()
else:
    print("[ERROR] Failed to obtain public tunnel URL")
