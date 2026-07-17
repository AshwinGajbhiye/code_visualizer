import http.server
import socketserver
import json
import urllib.request
import urllib.error
import ssl
import os

PORT = 8090
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

class CodeVisualizerHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/explain':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            code = data.get('code', '')
            steps = data.get('steps', [])
            
            api_key = GEMINI_API_KEY
            if not api_key:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "API key not configured"}).encode('utf-8'))
                return

            prompt = f"""You are an expert computer science tutor explaining code execution step by step.

Below is a C++ code snippet and a chronological trace of its execution steps.
For EACH step, provide a clear, natural language explanation of what is happening.
Write as if teaching someone stepping through a debugger.
Be concise (1-2 sentences max per step).
Explain WHY something is happening (e.g. "Since 1 is not greater than 5, we found a lower buy price, so we move the left pointer").
Include actual values in your explanation where the step data provides them.

C++ Source Code:
```cpp
{code}
```

Execution Steps:
"""
            for i, step in enumerate(steps):
                prompt += f"Step {i}: [Line {step.get('line')}] {step.get('description', '')}\n"

            prompt += """
Return ONLY a valid JSON array of strings. Each string at index i is the explanation for Step i.
Example: ["Initialize variable n to the size of the prices array (6).", "Set the initial profit to 0 since we haven't made any trades yet."]
"""

            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key={api_key}"
            
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.3,
                    "responseMimeType": "application/json"
                }
            }
            
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            try:
                ssl_ctx = ssl.create_default_context()
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE
                with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    text = result['candidates'][0]['content']['parts'][0]['text']
                    
                    try:
                        explanations = json.loads(text)
                        if not isinstance(explanations, list):
                            explanations = []
                    except json.JSONDecodeError:
                        print(f"Failed to parse Gemini response as JSON: {text[:200]}")
                        explanations = []
                        
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"explanations": explanations}).encode('utf-8'))
            except urllib.error.HTTPError as e:
                error_body = ""
                try:
                    error_body = e.read().decode('utf-8')
                except:
                    error_body = str(e)
                print(f"Gemini API HTTP error {e.code}: {error_body[:500]}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Gemini API error: {e.code}", "details": error_body[:300]}).encode('utf-8'))
            except Exception as e:
                print(f"Error calling Gemini API: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not Found"}).encode('utf-8'))

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        # Only log errors and API calls, not static file serving
        msg = format % args
        if '/api/' in msg or 'Error' in msg or '500' in msg:
            print(f"[{self.log_date_time_string()}] {msg}")

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    Handler = CodeVisualizerHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Code Visualizer server running at http://localhost:{PORT}")
        print(f"Gemini API key: {'configured' if GEMINI_API_KEY else 'NOT SET'}")
        httpd.serve_forever()
