"""Analysis page: `python -m eqi serve` opens a page in the browser where videos are
chosen and analysed. Every analysis gets its own folder (the uploaded video, job.json,
and the usual report.json, report.html and figures) and the page links its report.
The page uses the report's stylesheet. It listens on 127.0.0.1 only and runs one
analysis at a time (an analysis takes most of the memory); the others wait."""

import json
import mimetypes
import os
import queue
import re
import threading
import time
import webbrowser
from datetime import datetime
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from . import config
from .html_report import CSS
from .pipeline import STAGES

STAGE_LABELS = {
    "probe": "Reading the file",
    "shots": "Finding the cuts",
    "visual": "Measuring the picture",
    "audio": "Measuring the sound",
    "scoring": "Video type and K1–K5",
    "ai": "AI review (K6)",
    "report": "Writing the report",
}
CHUNK = 1 << 20  # uploads are written to disk in 1 MB pieces


def safe_name(name: str) -> str:
    """The file name alone, without folders or characters Windows does not allow."""
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "_", Path(name.replace("\\", "/")).name).strip(" .")
    return name[:120] or "video"


class Jobs:
    """The analyses, one folder each under `root`. A job a stopped server left
    unfinished is marked failed: starting it again on its own could spend AI credit."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.waiting: queue.Queue[str] = queue.Queue()
        self._lock = threading.Lock()
        self._jobs: dict[str, dict] = {}
        for path in sorted(self.root.glob("*/job.json")):
            try:
                job = json.loads(path.read_text(encoding="utf-8"))
            except ValueError:
                continue
            if "id" not in job:
                continue
            if job.get("status") not in ("done", "failed"):
                job.update(status="failed", stage=None, error="Stopped: the page was closed before the analysis ended.")
                self._save(job)
            self._jobs[job["id"]] = job

    def folder(self, job_id: str) -> Path:
        return self.root / job_id

    def add(self, name: str, use_ai: bool, repeats: int | None) -> dict:
        name = safe_name(name)
        stem = re.sub(r"[^\w.-]+", "_", Path(name).stem)[:40] or "video"
        with self._lock:
            base = job_id = f"{datetime.now():%Y%m%d-%H%M%S}-{stem}"
            n = 2
            while job_id in self._jobs or self.folder(job_id).exists():
                job_id, n = f"{base}-{n}", n + 1
            (self.folder(job_id) / "video").mkdir(parents=True)
            job = {"id": job_id, "name": name, "video": f"video/{name}", "created": time.time(),
                   "status": "uploading", "stage": None, "ai": use_ai, "repeats": repeats}
            self._jobs[job_id] = job
            self._save(job)
            return dict(job)

    def update(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.update(fields)
            self._save(job)

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def all(self) -> list[dict]:
        with self._lock:
            return sorted((dict(j) for j in self._jobs.values()), key=lambda j: -j["created"])

    def _save(self, job: dict) -> None:
        (self.folder(job["id"]) / "job.json").write_text(json.dumps(job, indent=1), encoding="utf-8")


def work(jobs: Jobs, model: str | None = None) -> None:
    """Analyse the waiting jobs one after the other."""
    from .pipeline import analyze
    while True:
        job_id = jobs.waiting.get()
        job = jobs.get(job_id)
        folder = jobs.folder(job_id)
        jobs.update(job_id, status="running", started=time.time())
        try:
            report = analyze(folder / job["video"], folder, use_ai=job["ai"], model=model, ai_repeats=job["repeats"],
                             progress=lambda stage: jobs.update(job_id, stage=stage))
        except Exception as err:  # the page shows why; the next video goes on
            message = str(err) if isinstance(err, ValueError) else f"{type(err).__name__}: {err}"
            jobs.update(job_id, status="failed", stage=None, finished=time.time(), error=message)
            continue
        jobs.update(job_id, status="done", stage=None, finished=time.time(), eqi=report["eqi"]["full"],
                    eqi_signal=report["eqi"]["signal_only"], ai_error=report["ai_error"],
                    video_type=(report.get("video_type") or {}).get("label"))


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port: int, jobs: Jobs, ai_model: str | None, repeats: int | None):
        super().__init__(("127.0.0.1", port), Handler)
        self.jobs, self.ai_model, self.repeats = jobs, ai_model, repeats


class Handler(BaseHTTPRequestHandler):
    server: Server

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":
            self._send(200, "text/html; charset=utf-8", page(self.server).encode("utf-8"))
        elif url.path == "/api/jobs":
            self._send_json({"now": time.time(), "jobs": self.server.jobs.all()})
        elif url.path.startswith("/reports/"):
            self._send_file(unquote(url.path[len("/reports/"):]))
        else:
            self.send_error(404)

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/api/analyze":
            self.send_error(404)
            return
        query = parse_qs(url.query)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            self._send_json({"error": "The file is empty."}, 400)
            return
        use_ai = query.get("ai", ["0"])[0] == "1" and self.server.ai_model is not None
        jobs = self.server.jobs
        job = jobs.add(query.get("name", ["video"])[0], use_ai, self.server.repeats)
        try:
            with open(jobs.folder(job["id"]) / job["video"], "wb") as fh:
                left = length
                while left > 0:
                    chunk = self.rfile.read(min(CHUNK, left))
                    if not chunk:
                        raise ConnectionError("the upload stopped")
                    fh.write(chunk)
                    left -= len(chunk)
        except OSError as err:
            jobs.update(job["id"], status="failed", error=f"Upload failed: {err}")
            return
        jobs.update(job["id"], status="queued")
        jobs.waiting.put(job["id"])
        self._send_json({"id": job["id"]})

    def _send_file(self, rel: str) -> None:
        """Files of the analyses' reports (report.html, report.json, figures); not the uploaded videos."""
        root = self.server.jobs.root.resolve()
        target = (root / rel).resolve()
        if root not in target.parents or not target.is_file() or "video" in target.relative_to(root).parts[1:2]:
            self.send_error(404)
            return
        kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self._send(200, kind + ("; charset=utf-8" if kind.startswith("text/") else ""), target.read_bytes())

    def _send_json(self, data, code: int = 200) -> None:
        self._send(code, "application/json", json.dumps(data, default=float).encode("utf-8"))

    def _send(self, code: int, kind: str, body: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # the console stays for the analyses
        pass


PAGE_CSS = """
.drop { border: 2px dashed #c9ced6; border-radius: 8px; background: #fff; padding: 28px 16px; text-align: center; }
.drop.over { border-color: #1d2330; background: #eef0f3; }
.drop p { margin: 6px 0; }
.button { display: inline-block; padding: 6px 14px; border-radius: 6px; border: 1px solid #c9ced6; background: #fff; color: #1d2330; font: inherit; cursor: pointer; }
.button.primary { background: #1d2330; border-color: #1d2330; color: #fff; font-weight: 600; padding: 8px 20px; }
.button:disabled { opacity: .45; cursor: default; }
.check { display: flex; gap: 10px; align-items: flex-start; }
.check input { margin-top: 5px; }
.box p { margin: 6px 0 0; }
.actions { display: flex; gap: 14px; align-items: center; margin: 18px 0 8px; }
"""


def page(server: Server) -> str:
    repeats = server.repeats or config.AI_K6_REPEATS
    if server.ai_model:
        ai = (f'<label class="check"><input type="checkbox" id="ai" checked><span><b>AI layer</b> — K6 narrative–visual coherence '
              f'and an opinion on every measured issue, by {escape(server.ai_model)}.</span></label>'
              f'<p class="small muted">For this the video is uploaded to Google Gemini. K6 is the median of {repeats} runs; '
              "a 2-minute video costs about $0.50. The AI's opinions on issues are shown in the report but never change the score.</p>")
    else:
        ai = ('<p><b>AI layer off</b> — GEMINI_API_KEY is not set (environment or tools/eqi/.env), so K1–K5 are measured '
              "and the report gives EQI as measured only (K6 n/a).</p>")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>EQI — analyse a video</title><style>{CSS}{PAGE_CSS}</style></head>
<body><main>
<h1>EQI — analyse a video</h1>
<div class="meta">K1–K5 are measured from the video on this computer; K6 is rated by AI. Every analysis gives the usual EQI report.</div>
<h2>Video</h2>
<div class="drop" id="drop">
  <p><b>Drop videos here</b> or <label class="button">choose files<input type="file" id="file" multiple hidden
     accept="video/*,.mkv,.webm,.avi,.m4v,.mov"></label></p>
  <p class="small muted">Any file ffmpeg can read — MP4, MOV, MKV, WebM, AVI. Portrait, variable-frame-rate and silent videos are fine.</p>
  <p id="chosen" class="small"></p>
</div>
<h2>Options</h2>
<div class="box">{ai}</div>
<div class="actions"><button class="button primary" id="start" disabled>Analyse</button><span id="note" class="small muted"></span></div>
<h2>Analyses</h2>
<table id="jobs"></table>
<p class="small muted">Each analysis is kept in {escape(str(server.jobs.root))}, with the uploaded video. One analysis runs at a time; the next one waits.</p>
</main>
<script>
const LABELS = {json.dumps(STAGE_LABELS, ensure_ascii=False)}, ORDER = {json.dumps(STAGES)};
const HEAD = '<tr><th>Video</th><th>Added</th><th>Status</th><th>EQI</th><th>Measured only</th><th>Report</th></tr>';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({{'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}})[c]);
const clock = (s) => `${{Math.floor(s / 60)}}:${{String(Math.floor(s % 60)).padStart(2, '0')}}`;
let files = [], timer = null;

function choose(list) {{
  files = Array.from(list || []);
  $('chosen').textContent = files.map((f) => `${{f.name}} (${{(f.size / 1048576).toFixed(1)}} MB)`).join(' · ');
  $('start').disabled = !files.length;
}}
$('file').onchange = (e) => choose(e.target.files);
const drop = $('drop');
drop.ondragover = (e) => {{ e.preventDefault(); drop.classList.add('over'); }};
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => {{ e.preventDefault(); drop.classList.remove('over'); choose(e.dataTransfer.files); }};

function upload(file, ai) {{
  return new Promise((resolve) => {{
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/analyze?name=${{encodeURIComponent(file.name)}}&ai=${{ai}}`);
    xhr.upload.onprogress = (e) => {{ $('note').textContent = `Uploading ${{file.name}}: ${{Math.round(100 * e.loaded / e.total)}} %`; }};
    xhr.onload = () => resolve(xhr.status === 200);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  }});
}}

$('start').onclick = async () => {{
  const ai = $('ai') && $('ai').checked ? 1 : 0, todo = files;
  choose([]);
  $('file').value = '';
  let failed = 0;
  for (const file of todo) {{
    if (!(await upload(file, ai))) failed += 1;
    refresh();
  }}
  $('note').textContent = failed ? `${{failed}} upload(s) failed.` : '';
}};

function score(v) {{
  if (v === null || v === undefined) return '<span class="muted">n/a</span>';
  return `<span class="${{v >= 80 ? 'good' : v >= 60 ? 'warn' : 'bad'}}">${{v.toFixed(1)}}</span>`;
}}

function status(j, now) {{
  if (j.status === 'uploading') return '<span class="tag">uploading</span>';
  if (j.status === 'queued') return '<span class="tag">waiting</span>';
  if (j.status === 'running') {{
    const stages = ORDER.filter((s) => j.ai || s !== 'ai'), n = stages.indexOf(j.stage) + 1;
    return `<span class="tag">${{Math.max(n, 1)}}/${{stages.length}}</span> ${{esc(LABELS[j.stage] || 'Starting')}} <span class="small muted">${{clock(now - j.started)}}</span>`;
  }}
  if (j.status === 'failed') return `<span class="tag bad">failed</span> <span class="small">${{esc(String(j.error).slice(0, 300))}}</span>`;
  return '<span class="tag ok">done</span>' + (j.ai_error ? ` <span class="small muted">${{esc(String(j.ai_error).slice(0, 200))}}</span>` : '')
    + ` <span class="small muted">${{clock(j.finished - j.started)}}</span>`;
}}

async function refresh() {{
  const data = await (await fetch('/api/jobs')).json();
  const rows = data.jobs.map((j) => `<tr><td>${{esc(j.name)}}<div class="small muted">${{esc(j.video_type || '')}}</div></td>`
    + `<td class="small">${{new Date(j.created * 1000).toLocaleString()}}</td><td>${{status(j, data.now)}}</td>`
    + `<td>${{j.status === 'done' ? score(j.eqi) : ''}}</td><td>${{j.status === 'done' ? score(j.eqi_signal) : ''}}</td>`
    + `<td>${{j.status === 'done' ? `<a href="/reports/${{encodeURIComponent(j.id)}}/report.html" target="_blank">Open</a>` : ''}}</td></tr>`);
  $('jobs').innerHTML = HEAD + (rows.join('') || '<tr><td colspan="6" class="muted">No analyses yet.</td></tr>');
  clearTimeout(timer);
  if (data.jobs.some((j) => ['uploading', 'queued', 'running'].includes(j.status))) timer = setTimeout(refresh, 2000);
}}
refresh();
</script></body></html>
"""


def serve(out: Path, port: int = 8765, model: str | None = None, repeats: int | None = None,
          open_browser: bool = True) -> None:
    jobs = Jobs(out)
    ai_model = (model or os.environ.get("GEMINI_VIDEO_MODEL") or config.GEMINI_MODEL_DEFAULT) if os.environ.get("GEMINI_API_KEY") else None
    server = Server(port, jobs, ai_model, repeats)
    threading.Thread(target=work, args=(jobs, model), daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"EQI analysis page: {url} — analyses are kept in {jobs.root}; Ctrl+C stops", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
