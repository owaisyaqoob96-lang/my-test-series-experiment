"""
Local Development Server with integrated /api/ai-tutor endpoint.
Runs dual-stack on port 8000 (supporting both IPv4 and IPv6).
Usage: python server.py [port]
"""

import http.server
import json
import os
import socket
import sys
import urllib.request
import urllib.error

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Robustly load .env.local or .env
def load_env_file():
    loaded = {}
    for fname in [".env.local", ".env"]:
        filepath = os.path.join(BASE_DIR, fname)
        if os.path.exists(filepath):
            try:
                # Use utf-8-sig to automatically handle any Windows Notepad UTF-8 BOM
                with open(filepath, "r", encoding="utf-8-sig") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip("\"'")
                            if k:
                                os.environ[k] = v
                                loaded[k] = v
            except Exception as e:
                print(f"[Warning] Could not read {fname}: {e}")
    return loaded

load_env_file()

FIREBASE_WEB_API_KEY = os.environ.get("FIREBASE_API_KEY", "AIzaSyDjHj-QuqyD58jHuJopsml8e1U7jMiUuOc")
GEMINI_MODEL_DEFAULT = "gemini-3.5-flash-lite"

class AppHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Serve actual static files if they exist on disk
        req_path = self.path.split("?")[0]
        local_path = os.path.join(BASE_DIR, req_path.lstrip("/"))
        if os.path.isfile(local_path):
            return super().do_GET()

        # Fallback for static assets requested with subpath (e.g. /exams/styles.css)
        base_asset = os.path.join(BASE_DIR, os.path.basename(req_path))
        if os.path.isfile(base_asset) and req_path.endswith((".css", ".js", ".png", ".svg", ".ico", ".json", ".map", ".woff2", ".ttf")):
            self.path = "/" + os.path.basename(req_path)
            return super().do_GET()
        
        # SPA routing fallback for clean URLs (/login, /dashboard, /exams/*, /test, /results)
        if req_path in ["/", "/login", "/dashboard", "/test", "/results"] or req_path.startswith("/exams"):
            index_path = os.path.join(BASE_DIR, "index.html")
            if os.path.isfile(index_path):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                with open(index_path, "rb") as f:
                    content = f.read()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
        
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/ai-tutor":
            self.handle_ai_tutor()
        else:
            self.send_error(404, "Endpoint not found")

    def send_json(self, status_code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_ai_tutor(self):
        # 1. Verify Authorization Bearer token
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            self.send_json(401, {"ok": False, "error": "Unauthorized: Missing Authorization Bearer token."})
            return

        id_token = auth_header[7:].strip()
        if not id_token:
            self.send_json(401, {"ok": False, "error": "Unauthorized: Empty ID token."})
            return

        # 2. Verify Firebase ID Token via Google Identity Toolkit
        try:
            lookup_url = f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={FIREBASE_WEB_API_KEY}"
            lookup_req = urllib.request.Request(
                lookup_url,
                data=json.dumps({"idToken": id_token}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(lookup_req, timeout=10) as resp:
                user_data = json.loads(resp.read().decode("utf-8"))
                verified_uid = user_data.get("users", [{}])[0].get("localId")
                if not verified_uid:
                    self.send_json(401, {"ok": False, "error": "Unauthorized: User not found."})
                    return
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                detail = err_body.get("error", {}).get("message", "Token verification failed")
            except Exception:
                detail = "Token verification failed"
            self.send_json(401, {"ok": False, "error": "Unauthorized: Invalid or expired token. Please log in again.", "detail": detail})
            return
        except Exception as e:
            self.send_json(500, {"ok": False, "error": f"Failed to verify authentication: {str(e)}"})
            return

        # 3. Check for GEMINI_API_KEY (reload dynamically from file if not yet loaded)
        current_gemini_key = os.environ.get("GEMINI_API_KEY", "")
        if not current_gemini_key:
            load_env_file()
            current_gemini_key = os.environ.get("GEMINI_API_KEY", "")

        if not current_gemini_key:
            self.send_json(503, {
                "ok": False,
                "needsKey": True,
                "error": "Google Gemini API key not configured.",
                "help": "Create a file named .env.local in the project root containing: GEMINI_API_KEY=your_key_here"
            })
            return

        # 4. Read and validate request body
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body)
        except Exception as e:
            self.send_json(400, {"ok": False, "error": f"Malformed JSON request: {str(e)}"})
            return

        mode = payload.get("mode")
        context = payload.get("context", {})
        messages = payload.get("messages", [])

        if mode not in ["question_tutor", "test_analyzer"]:
            self.send_json(400, {"ok": False, "error": "Invalid mode. Must be 'question_tutor' or 'test_analyzer'."})
            return

        if not messages or not isinstance(messages, list):
            self.send_json(400, {"ok": False, "error": "Missing or invalid 'messages' array."})
            return

        # 5. Build system instruction
        if mode == "question_tutor":
            system_instruction = (
                "You are TestWise AI Question Tutor, a rigorous, patient, and highly skilled subject tutor "
                "assisting a student who has submitted an exam practice test.\n"
                "Your goal is to teach the underlying concept from first principles and guide the student to master the material.\n\n"
                "Authoritative Context Rules:\n"
                "- The provided question text, options, and author's explanation are authoritative.\n"
                "- If you notice a clear typographical error or discrepancy in the answer key, explain the nuance objectively without aggressively contradicting the key.\n"
                "- Evaluate all options individually, explaining why the correct option is right and why each distracter is wrong.\n"
                "- Never hallucinate fake facts, historical dates, or invented formulas.\n"
                "- Format your response with clear Markdown: use bold text, bullet points, numbered lists, and concise headings.\n\n"
                "For the initial question analysis, include:\n"
                "1. **Concept Being Tested**: The core topic/subtopic.\n"
                "2. **Conceptual Explanation**: Teach the concept clearly from first principles to the required examination depth.\n"
                "3. **Question Breakdown**: What the question actually demands and how to interpret key terms.\n"
                "4. **Step-by-Step Solution / Reasoning**: Step-by-step logic leading to the correct answer.\n"
                "5. **Option-by-Option Analysis**: Explain every option individually (Option A, Option B, etc.).\n"
                "6. **Common Traps / Pitfalls**: Common misconceptions or examination traps.\n"
                "7. **Memory Aid / Mnemonic**: A memorable trick, comparison, or rule to remember this.\n"
                "8. **Key Takeaways**: 2-3 bullet points to remember.\n\n"
                "For follow-up questions:\n"
                "- Directly and concisely answer the student's follow-up questions, doubts, or requests for examples.\n"
                "- Do NOT repeat the entire 8-section breakdown on follow-up questions; respond conversationally and pedagogically."
            )
        else:
            system_instruction = (
                "You are TestWise AI Master Test Analyzer, an evidence-based exam diagnostic analyst.\n"
                "Your objective is to evaluate the student's entire completed test attempt and provide a rigorous, supportive diagnostic report and actionable revision plan.\n\n"
                "Diagnostic Guidelines:\n"
                "- Ground all conclusions firmly in the provided attempt statistics (scores, topic counts, correct/wrong counts, and actual questions).\n"
                "- Do NOT invent percentiles, ranks, or comparisons with other students.\n"
                "- Distinguish between measured scores and inferred error causes.\n"
                "- Structure your diagnostic report with these sections:\n"
                "  1. **Overall Performance Diagnostic**: Score, percentage, and summary in context of the test structure.\n"
                "  2. **Identified Strengths**: Topics where accuracy was high, supported by question counts.\n"
                "  3. **High-Priority Improvement Areas**: Topics with missed or unanswered questions, citing specific concept gaps.\n"
                "  4. **Error Analysis & Cognitive Patterns**: Classify likely mistake patterns (conceptual gap, recall lapse, question misinterpretation, calculation error).\n"
                "  5. **Topic-wise Review Table**: Markdown table comparing Topic | Questions | Correct | Accuracy | Action Needed.\n"
                "  6. **Prioritized 3-Step Study Plan**: Practical, step-by-step revision priority for the next 7 days.\n"
                "  7. **Next Steps**: Concrete follow-up actions (e.g. review specific topics, retake weak areas).\n\n"
                "For follow-up questions:\n"
                "- Continue as an expert mentor helping the student plan their prep, diagnose specific mistakes, or create practice problems based on their actual errors."
            )

        # Context preamble
        context_preamble = ""
        if context:
            if mode == "question_tutor":
                opts = context.get("options", [])
                opts_str = "\n".join([f"({chr(65 + i)}) {opt}" for i, opt in enumerate(opts)])
                correct_idx = context.get("correctIndex", 0)
                selected_idx = context.get("selected")
                is_answered = context.get("isAnswered", False)
                is_correct = context.get("isCorrect", False)
                correct_opt_str = opts[correct_idx] if 0 <= correct_idx < len(opts) else "N/A"
                selected_opt_str = opts[selected_idx] if (is_answered and selected_idx is not None and 0 <= selected_idx < len(opts)) else "None"

                context_preamble = (
                    f"[QUESTION CONTEXT]\n"
                    f"Subject/Test: {context.get('subject', 'General')}\n"
                    f"Topic: {context.get('topic', 'General')}\n"
                    f"Question Number: {context.get('questionNumber', 'N/A')}\n"
                    f"Question Text:\n{context.get('text', '')}\n\n"
                    f"Options:\n{opts_str}\n\n"
                    f"Authoritative Correct Answer: Option ({chr(65 + correct_idx)}) - {correct_opt_str}\n"
                    f"Student's Selected Answer: {'Option (' + chr(65 + selected_idx) + ') - ' + selected_opt_str if is_answered else 'UNANSWERED / SKIPPED'}\n"
                    f"Status: {'CORRECT' if (is_answered and is_correct) else ('INCORRECT' if is_answered else 'UNANSWERED')}\n"
                    f"{'Provided Explanation: ' + context.get('explanation', '') if context.get('explanation') else ''}\n"
                    f"[/QUESTION CONTEXT]\n\n"
                )
            else:
                topic_stats = context.get("topicStats", {})
                topic_lines = "\n".join([
                    f"- {top}: {stat.get('correct', 0)}/{stat.get('total', 0)} correct"
                    for top, stat in topic_stats.items()
                ])
                qs = context.get("questionsSummary", [])[:50]
                q_lines = "\n".join([
                    f"Q{i+1} [{q.get('topic', 'General')}]: Status={q.get('status')}, StudentAnswer=\"{q.get('userAnswer', 'None')}\", CorrectAnswer=\"{q.get('correctAnswer', '')}\""
                    for i, q in enumerate(qs)
                ])
                context_preamble = (
                    f"[TEST ATTEMPT SUMMARY]\n"
                    f"Test Title: {context.get('subjectName', 'Practice Test')}\n"
                    f"Subject: {context.get('subject', 'General')}\n"
                    f"Total Questions: {context.get('total', 0)}\n"
                    f"Correct: {context.get('correct', 0)}\n"
                    f"Incorrect: {context.get('wrong', 0)}\n"
                    f"Unanswered: {context.get('unattempted', 0)}\n\n"
                    f"Topic Breakdown:\n{topic_lines}\n\n"
                    f"Question-by-Question Snapshot:\n{q_lines}\n"
                    f"[/TEST ATTEMPT SUMMARY]\n\n"
                )

        # Prepare messages
        prepared_messages = list(messages)
        if context_preamble and prepared_messages and prepared_messages[0].get("role") == "user":
            prepared_messages[0] = {
                "role": "user",
                "content": context_preamble + prepared_messages[0].get("content", "")
            }

        gemini_contents = []
        for m in prepared_messages:
            gemini_contents.append({
                "role": "model" if m.get("role") == "assistant" else "user",
                "parts": [{"text": str(m.get("content", ""))}]
            })

        # 6. Dispatch to Gemini with automatic model fallback
        current_model = os.environ.get("GEMINI_MODEL", GEMINI_MODEL_DEFAULT)
        models_to_try = [current_model, "gemini-3.8-flash", "gemini-2.5-flash-lite"]
        seen_models = set()
        unique_models = []
        for m in models_to_try:
            if m not in seen_models:
                seen_models.add(m)
                unique_models.append(m)

        reply_text = None
        last_err = ""
        for model_name in unique_models:
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={current_gemini_key}"
            gemini_payload = {
                "systemInstruction": {"parts": [{"text": system_instruction}]},
                "contents": gemini_contents,
                "generationConfig": {
                    "temperature": 0.4,
                    "maxOutputTokens": 2048,
                    "topP": 0.95
                }
            }
            gemini_req = urllib.request.Request(
                gemini_url,
                data=json.dumps(gemini_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(gemini_req, timeout=30) as resp:
                    gemini_resp = json.loads(resp.read().decode("utf-8"))
                    candidates = gemini_resp.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        reply_text = "".join([p.get("text", "") for p in parts])
                    else:
                        reply_text = "No response generated."
                    break
            except urllib.error.HTTPError as e:
                try:
                    err_data = json.loads(e.read().decode("utf-8"))
                    last_err = err_data.get("error", {}).get("message", f"Gemini API error ({e.code})")
                except Exception:
                    last_err = f"Gemini API error ({e.code})"
                if e.code == 404:
                    continue  # Try next model in sequence
                elif e.code == 429:
                    self.send_json(429, {"ok": False, "error": "Gemini rate limit exceeded. Please wait a moment.", "rateLimited": True})
                    return
                else:
                    self.send_json(502, {"ok": False, "error": f"AI service error: {last_err}"})
                    return
            except Exception as e:
                last_err = str(e)

        if reply_text is not None:
            self.send_json(200, {"ok": True, "text": reply_text})
        else:
            self.send_json(502, {"ok": False, "error": f"AI service error: {last_err or 'Failed communicating with AI provider'}"})


class DualStackServer(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except Exception:
            pass
        super().server_bind()


def run():
    print(f"Starting Test Series Server on port {PORT}...")
    server = DualStackServer(("::", PORT), AppHandler)
    active_model = os.environ.get("GEMINI_MODEL", GEMINI_MODEL_DEFAULT)
    print(f"-> Local preview: http://localhost:{PORT}/ (IPv4 & IPv6)")
    print(f"-> Active Model: {active_model}")
    if os.environ.get("GEMINI_API_KEY"):
        print("-> Gemini API key: Configured (ready for live AI responses)")
    else:
        print("-> Gemini API key: Not configured (add GEMINI_API_KEY to .env.local)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    run()
