import http.server, os, sys, urllib.parse
OUT = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS'); self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); rel = q['path'][0]
        assert '..' not in rel
        p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        n = int(self.headers['Content-Length']); data = self.rfile.read(n)
        with open(p, 'wb') as f: f.write(data)
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8766), H).serve_forever()
