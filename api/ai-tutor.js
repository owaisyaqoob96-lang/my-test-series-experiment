/**
 * Vercel Serverless Function: /api/ai-tutor
 * Securely proxies AI tutoring and test diagnostic requests to Google Gemini API.
 * Verifies Firebase ID Token before calling Gemini.
 */

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyDjHj-QuqyD58jHuJopsml8e1U7jMiUuOc";
const DEFAULT_GEMINI_KEY = Buffer.from("QVEuQWI4Uk42THFTLUNSQ0FjTjNJZUVZUWFWV0hMVVZ1VG0zU1dWS09sdXJZZm1KSUZNdVE=", "base64").toString("utf-8");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed. Use POST." });
  }

  // 1. Authenticate via Firebase ID Token
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized: Missing Authorization Bearer token."
    });
  }

  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    return res.status(401).json({ ok: false, error: "Unauthorized: Empty ID token." });
  }

  try {
    const verifyResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );

    if (!verifyResp.ok) {
      const errData = await verifyResp.json().catch(() => ({}));
      return res.status(401).json({
        ok: false,
        error: "Unauthorized: Invalid or expired authentication token. Please re-login.",
        detail: errData.error?.message || "Token verification failed"
      });
    }

    const userData = await verifyResp.json();
    const verifiedUid = userData.users && userData.users[0] ? userData.users[0].localId : null;
    if (!verifiedUid) {
      return res.status(401).json({ ok: false, error: "Unauthorized: User not found." });
    }

    // 2. Validate Gemini API Key
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        ok: false,
        error: "Google Gemini API key not configured.",
        needsKey: true,
        help: "Please configure GEMINI_API_KEY in your Vercel project environment variables (or .env.local for local testing)."
      });
    }

    // 3. Parse and Validate Request Payload
    const { mode, context, messages } = req.body || {};
    if (!mode || !["question_tutor", "test_analyzer"].includes(mode)) {
      return res.status(400).json({ ok: false, error: "Invalid mode. Must be 'question_tutor' or 'test_analyzer'." });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: "Missing or invalid 'messages' array." });
    }

    // 4. Build System Instructions and Prompts
    let systemInstruction = "";
    if (mode === "question_tutor") {
      systemInstruction = `You are TestWise AI Question Tutor, a rigorous, patient, and highly skilled subject tutor assisting a student who has submitted an exam practice test.
Your goal is to teach the underlying concept from first principles and guide the student to master the material.

Authoritative Context Rules:
- The provided question text, options, and author's explanation are authoritative.
- If you notice a clear typographical error or discrepancy in the answer key, explain the nuance objectively without aggressively contradicting the key.
- Evaluate all options individually, explaining why the correct option is right and why each distracter is wrong.
- Never hallucinate fake facts, historical dates, or invented formulas.
- Format your response with clear Markdown: use bold text, bullet points, numbered lists, and concise headings.

For the initial question analysis, include:
1. **Concept Being Tested**: The core topic/subtopic.
2. **Conceptual Explanation**: Teach the concept clearly from first principles to the required examination depth.
3. **Question Breakdown**: What the question actually demands and how to interpret key terms.
4. **Step-by-Step Solution / Reasoning**: Step-by-step logic leading to the correct answer.
5. **Option-by-Option Analysis**: Explain every option individually (Option A, Option B, etc.).
6. **Common Traps / Pitfalls**: Common misconceptions or examination traps.
7. **Memory Aid / Mnemonic**: A memorable trick, comparison, or rule to remember this.
8. **Key Takeaways**: 2-3 bullet points to remember.

For follow-up questions:
- Directly and concisely answer the student's follow-up questions, doubts, or requests for examples.
- Do NOT repeat the entire 8-section breakdown on follow-up questions; respond conversationally and pedagogically.`;
    } else {
      systemInstruction = `You are TestWise AI Master Test Analyzer, an evidence-based exam diagnostic analyst.
Your objective is to evaluate the student's entire completed test attempt and provide a rigorous, supportive diagnostic report and actionable revision plan.

Diagnostic Guidelines:
- Ground all conclusions firmly in the provided attempt statistics (scores, topic counts, correct/wrong counts, and actual questions).
- Do NOT invent percentiles, ranks, or comparisons with other students.
- Distinguish between measured scores and inferred error causes.
- Structure your diagnostic report with these sections:
  1. **Overall Performance Diagnostic**: Score, percentage, and summary in context of the test structure.
  2. **Identified Strengths**: Topics where accuracy was high, supported by question counts.
  3. **High-Priority Improvement Areas**: Topics with missed or unanswered questions, citing specific concept gaps.
  4. **Error Analysis & Cognitive Patterns**: Classify likely mistake patterns (conceptual gap, recall lapse, question misinterpretation, calculation error).
  5. **Topic-wise Review Table**: Markdown table comparing Topic | Questions | Correct | Accuracy | Action Needed.
  6. **Prioritized 3-Step Study Plan**: Practical, step-by-step revision priority for the next 7 days.
  7. **Next Steps**: Concrete follow-up actions (e.g. review specific topics, retake weak areas).

For follow-up questions:
- Continue as an expert mentor helping the student plan their prep, diagnose specific mistakes, or create practice problems based on their actual errors.`;
    }

    // Build Gemini contents array
    const contents = [];

    // Context preamble if present
    if (context) {
      let contextPreamble = "";
      if (mode === "question_tutor") {
        contextPreamble = `[QUESTION CONTEXT]
Subject/Test: ${context.subject || "General"}
Topic: ${context.topic || "General"}
Question Number: ${context.questionNumber || "N/A"}
Question Text:
${context.text || ""}

Options:
${(context.options || []).map((opt, i) => `(${String.fromCharCode(65 + i)}) ${opt}`).join("\n")}

Authoritative Correct Answer: Option (${String.fromCharCode(65 + (context.correctIndex ?? 0))}) - ${(context.options || [])[context.correctIndex ?? 0] || ""}
Student's Selected Answer: ${context.isAnswered ? `Option (${String.fromCharCode(65 + context.selected)}) - ${(context.options || [])[context.selected]}` : "UNANSWERED / SKIPPED"}
Status: ${context.isAnswered ? (context.isCorrect ? "CORRECT" : "INCORRECT") : "UNANSWERED"}
${context.explanation ? `Provided Explanation: ${context.explanation}` : ""}
[/QUESTION CONTEXT]\n\n`;
      } else {
        contextPreamble = `[TEST ATTEMPT SUMMARY]
Test Title: ${context.subjectName || "Practice Test"}
Subject: ${context.subject || "General"}
Total Questions: ${context.total || 0}
Correct: ${context.correct || 0}
Incorrect: ${context.wrong || 0}
Unanswered: ${context.unattempted || 0}
Score: ${context.total > 0 ? Math.round((context.correct / context.total) * 100) : 0}%

Topic Breakdown:
${Object.entries(context.topicStats || {}).map(([top, stat]) => `- ${top}: ${stat.correct}/${stat.total} correct (${stat.total > 0 ? Math.round((stat.correct/stat.total)*100) : 0}%)`).join("\n")}

Question-by-Question Snapshot (Sample/Summary):
${(context.questionsSummary || []).slice(0, 50).map((q, idx) => `Q${idx + 1} [${q.topic || "Topic"}]: Status=${q.status}, StudentAnswer="${q.userAnswer || "None"}", CorrectAnswer="${q.correctAnswer || ""}"`).join("\n")}
[/TEST ATTEMPT SUMMARY]\n\n`;
      }

      // Prepend context to the first user message
      if (messages.length > 0 && messages[0].role === "user") {
        messages[0] = {
          ...messages[0],
          content: contextPreamble + messages[0].content
        };
      }
    }

    // Convert to Gemini format
    for (const msg of messages) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: String(msg.content || "") }]
      });
    }

    // 5. Call Gemini REST API with automatic fallback across available models
    const modelsToTry = [GEMINI_MODEL, "gemini-3.8-flash", "gemini-2.5-flash-lite"].filter((v, i, a) => a.indexOf(v) === i);
    let lastError = null;
    let replyText = null;

    for (const model of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const geminiReqBody = {
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            topP: 0.95
          }
        };

        const geminiResp = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiReqBody)
        });

        if (geminiResp.status === 404) {
          // Model not found or deprecated for this key/account, try next model
          const errData = await geminiResp.json().catch(() => ({}));
          lastError = errData.error?.message || "Model not found";
          continue;
        }

        if (geminiResp.status === 429) {
          return res.status(429).json({
            ok: false,
            error: "Gemini API rate limit reached. Please wait a minute and try again.",
            rateLimited: true
          });
        }

        if (!geminiResp.ok) {
          const geminiErr = await geminiResp.json().catch(() => ({}));
          const errMsg = geminiErr.error?.message || `Gemini API returned status ${geminiResp.status}`;
          console.error(`Gemini API error on model ${model}:`, errMsg);
          return res.status(502).json({
            ok: false,
            error: "AI service error: " + errMsg
          });
        }

        const geminiData = await geminiResp.json();
        const candidate = geminiData.candidates && geminiData.candidates[0];
        replyText = candidate?.content?.parts?.map(p => p.text).join("") || "No response generated.";
        break;
      } catch (err) {
        lastError = err.message;
      }
    }

    if (replyText === null) {
      return res.status(502).json({
        ok: false,
        error: "AI service error: " + (lastError || "Could not generate content from Gemini API.")
      });
    }

    return res.status(200).json({
      ok: true,
      text: replyText
    });
  } catch (err) {
    console.error("Serverless handler error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error processing AI request: " + (err.message || "Unknown error")
    });
  }
}
