// ============================================================
// Firebase setup
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup,
  sendEmailVerification, applyActionCode
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

// Only this account can create subjects / add questions — everyone else
// who signs up can log in and take tests, but won't see the admin panel,
// and the database rules block them from writing to it even if they tried.
const ADMIN_UID = "PMbrCOTH61ZegHUTe2xVqDnidUm2";
import {
  getFirestore, collection, addDoc, getDocs, getCountFromServer,
  serverTimestamp, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjHj-QuqyD58jHuJopsml8e1U7jMiUuOc",
  authDomain: "my-test-series-experiment.firebaseapp.com",
  projectId: "my-test-series-experiment",
  storageBucket: "my-test-series-experiment.firebasestorage.app",
  messagingSenderId: "238556622937",
  appId: "1:238556622937:web:232ecf120516b875658148",
  measurementId: "G-W37NP3BZ0W"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ============================================================
// View switching
// ============================================================
const views = ["view-auth", "view-verify", "view-app", "view-test", "view-results"];
function showView(name) {
  views.forEach(v => document.getElementById(v).classList.toggle("hidden", v !== name));
}

// ============================================================
// Theme toggle
// ============================================================
const html = document.documentElement;
const savedTheme = localStorage.getItem("ts-theme");
if (savedTheme) html.setAttribute("data-theme", savedTheme);
document.getElementById("theme-toggle").addEventListener("click", () => {
  const current = html.getAttribute("data-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("ts-theme", next);
});

// Decorative exam clock hands, set once to the current time
(function setClockHands() {
  const now = new Date();
  const minDeg = now.getMinutes() * 6;
  const hrDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
  const minHand = document.getElementById("clock-min");
  const hrHand = document.getElementById("clock-hr");
  if (minHand) minHand.style.transform = `rotate(${minDeg}deg)`;
  if (hrHand) hrHand.style.transform = `rotate(${hrDeg}deg)`;
})();

// ============================================================
// Auth — anyone can create an account and take tests; only the
// admin account (ADMIN_UID above) can add subjects/questions.
// ============================================================
let isSignupMode = false;
const authForm = document.getElementById("auth-form");
const authError = document.getElementById("auth-error");
const authTitle = document.getElementById("auth-title");
const authSub = document.getElementById("auth-sub");
const authSubmit = document.getElementById("auth-submit");
const authSwitchText = document.getElementById("auth-switch-text");
const authSwitchBtn = document.getElementById("auth-switch-btn");

function renderAuthMode() {
  authError.textContent = "";
  if (isSignupMode) {
    authTitle.textContent = "Create your account";
    authSub.textContent = "Set up access to your tests.";
    authSubmit.textContent = "Create account";
    authSwitchText.textContent = "Already have an account?";
    authSwitchBtn.textContent = "Log in";
  } else {
    authTitle.textContent = "Welcome back";
    authSub.textContent = "Log in to continue your prep.";
    authSubmit.textContent = "Log in";
    authSwitchText.textContent = "New here?";
    authSwitchBtn.textContent = "Create an account";
  }
}
authSwitchBtn.addEventListener("click", () => { isSignupMode = !isSignupMode; renderAuthMode(); });

function friendlyAuthError(err) {
  const code = err && err.code ? err.code : "";
  if (code.includes("email-already-in-use")) return "That email already has an account — try logging in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "That email and password don't match our records.";
  if (code.includes("weak-password")) return "Password should be at least 6 characters.";
  if (code.includes("invalid-email")) return "That doesn't look like a valid email address.";
  if (code.includes("too-many-requests")) return "Too many attempts — please wait a bit and try again.";
  return "Something went wrong. Please try again.";
}

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","guerrillamail.info","guerrillamail.biz","guerrillamail.de",
  "guerrillamail.net","guerrillamail.org","sharklasers.com","spam4.me","grr.la","10minutemail.com",
  "10minutemail.net","10minutemail.co.uk","temp-mail.org","temp-mail.io","tempmail.com","tempmail.net",
  "tempmail.plus","tempmailaddress.com","throwawaymail.com","throwam.com","yopmail.com","yopmail.fr",
  "yopmail.net","trashmail.com","trashmail.net","trash-mail.com","maildrop.cc","dispostable.com",
  "fakeinbox.com","fakemailgenerator.com","getnada.com","getairmail.com","mailnesia.com","mintemail.com",
  "mytemp.email","moakt.com","moakt.cc","tempinbox.com","emailondeck.com","discard.email","discardmail.com",
  "spamgourmet.com","mailcatch.com","meltmail.com","mohmal.com","byom.de","anonbox.net","tempr.email",
  "mailtemp.top","tmpmail.org","tmpmail.net","tmail.ws","temp-mail.de","inboxbear.com","incognitomail.com",
  "mailexpire.com","mailforspam.com","spambox.us","spamex.com","spamfree24.org","spamherelots.com",
  "trbvm.com","wegwerfmail.de","wegwerfmail.net","wegwerfmail.org","jetable.org","correotemporal.org",
  "einrot.com","filzmail.com","harakirimail.com","hidemail.de","hulapla.de","klassmaster.com","mt2015.com",
  "no-spam.ws","objectmail.com","oneoffemail.com","pookmail.com","proxymail.eu","rcpt.at","safetymail.info",
  "sneakemail.com","spambog.com","teleworm.us","tempemail.net","trash2009.com","veryrealemail.com",
  "willselfdestruct.com","winemaven.info","zoemail.org","dropmail.me","mailslurp.com",
  "guerrillamailblock.com","burnermail.io"
]);

let pendingNotice = null;

function showAuthNotice(ok, text) {
  authError.style.color = ok ? "var(--success)" : "var(--danger)";
  authError.textContent = text;
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.style.color = "var(--danger)";
  authError.textContent = "";
  pendingNotice = null;
  authSubmit.disabled = true;
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  try {
    if (isSignupMode) {
      const domain = email.split("@")[1] ? email.split("@")[1].toLowerCase() : "";
      if (DISPOSABLE_DOMAINS.has(domain)) {
        authError.textContent = "Please use a permanent email address — temporary/disposable inboxes aren't allowed here.";
        return;
      }
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    authError.textContent = friendlyAuthError(err);
  } finally {
    authSubmit.disabled = false;
  }
});

document.getElementById("google-signin-btn").addEventListener("click", async () => {
  authError.style.color = "var(--danger)";
  authError.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    authError.textContent = "Couldn't sign in with Google — please try again.";
  }
});

document.getElementById("signout-btn").addEventListener("click", () => signOut(auth));
document.getElementById("verify-signout-btn").addEventListener("click", () => signOut(auth));

// ---------- Account activation (email link) ----------
document.getElementById("verify-check-btn").addEventListener("click", async () => {
  const verifyError = document.getElementById("verify-error");
  verifyError.style.color = "var(--danger)";
  verifyError.textContent = "";
  await auth.currentUser.reload();
  if (auth.currentUser.emailVerified) {
    routeUser(auth.currentUser);
  } else {
    verifyError.textContent = "Not activated yet — click the link in the email first.";
  }
});

document.getElementById("verify-resend-btn").addEventListener("click", async () => {
  const verifyError = document.getElementById("verify-error");
  try {
    await sendEmailVerification(auth.currentUser);
    verifyError.style.color = "var(--success)";
    verifyError.textContent = "A new activation link is on its way.";
  } catch (err) {
    verifyError.style.color = "var(--danger)";
    verifyError.textContent = err.code && err.code.includes("too-many-requests")
      ? "Please wait a few minutes before requesting another link."
      : "Couldn't send the link right now — please try again shortly.";
  }
});

function routeUser(user) {
  if (user && user.emailVerified) {
    document.getElementById("whoami").textContent = user.email;
    document.querySelector(".admin-panel").classList.toggle("hidden", user.uid !== ADMIN_UID);
    showView("view-app");
    loadSubjects();
  } else if (user && !user.emailVerified) {
    document.getElementById("verify-email-text").textContent = user.email;
    document.getElementById("verify-error").textContent = "";
    showView("view-verify");
  } else {
    renderAuthMode();
    if (pendingNotice) showAuthNotice(pendingNotice.ok, pendingNotice.text);
    showView("view-auth");
  }
}

const urlParams = new URLSearchParams(window.location.search);
const actionReady = (async () => {
  if (urlParams.get("mode") === "verifyEmail" && urlParams.get("oobCode")) {
    try {
      await applyActionCode(auth, urlParams.get("oobCode"));
      pendingNotice = { ok: true, text: "Your account is activated — log in to continue." };
    } catch (err) {
      pendingNotice = { ok: false, text: "That activation link is invalid or has expired. Log in and we'll send you a fresh one." };
    }
    await signOut(auth);
    window.history.replaceState({}, "", window.location.pathname);
  }
})();

onAuthStateChanged(auth, async () => {
  await actionReady;
  routeUser(auth.currentUser);
});

// ============================================================
// Dashboard: subjects list + admin panel
// ============================================================
let subjectsCache = [];

async function loadSubjects() {
  const listEl = document.getElementById("test-list");
  listEl.innerHTML = `<div class="test-row-empty">Loading…</div>`;
  const snap = await getDocs(collection(db, "subjects"));
  subjectsCache = [];
  snap.forEach(d => subjectsCache.push({ id: d.id, ...d.data() }));

  for (const s of subjectsCache) {
    try {
      const countSnap = await getCountFromServer(collection(db, "subjects", s.id, "questions"));
      s.questionCount = countSnap.data().count;
    } catch {
      s.questionCount = 0;
    }
  }

  renderTestList();
  renderSubjectSelect();
}

function renderTestList() {
  const listEl = document.getElementById("test-list");
  if (subjectsCache.length === 0) {
    listEl.innerHTML = `<div class="test-row-empty">No subjects yet — add one below to get your first test running.</div>`;
    return;
  }
  listEl.innerHTML = "";
  
  const isAdmin = auth.currentUser && auth.currentUser.uid === ADMIN_UID;

  subjectsCache.forEach(s => {
    const row = document.createElement("div");
    row.className = "test-row";
    const hasQuestions = (s.questionCount || 0) > 0;
    
    // Add delete button exclusively for admin
    const deleteBtn = isAdmin ? `<button class="btn btn-sm" style="background-color: var(--danger); color: white; margin-left: 8px; border: none;" data-delete-id="${s.id}">Delete</button>` : "";

    row.innerHTML = `
      <div class="test-row-info">
        <h3>${escapeHtml(s.name)}</h3>
        <div class="test-row-meta">${s.questionCount || 0} questions · ${s.durationMinutes || 30} min</div>
      </div>
      <div style="display: flex; align-items: center;">
        <button class="btn btn-primary btn-sm" ${hasQuestions ? "" : "disabled"} data-subject-id="${s.id}">
          ${hasQuestions ? "Start test" : "No questions yet"}
        </button>
        ${deleteBtn}
      </div>
    `;
    listEl.appendChild(row);
  });

  listEl.querySelectorAll("button[data-subject-id]").forEach(btn => {
    btn.addEventListener("click", () => startTest(btn.getAttribute("data-subject-id")));
  });

  // Attach delete logic for admin
  if (isAdmin) {
    listEl.querySelectorAll("button[data-delete-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to delete this test? This cannot be undone.")) {
          btn.disabled = true;
          btn.textContent = "...";
          try {
            await deleteDoc(doc(db, "subjects", btn.getAttribute("data-delete-id")));
            await loadSubjects(); // Refresh the list
          } catch (e) {
            console.error(e);
            alert("Couldn't delete. Please try again.");
            btn.disabled = false;
            btn.textContent = "Delete";
          }
        }
      });
    });
  }
}

function renderSubjectSelect() {
  const select = document.getElementById("target-subject");
  select.innerHTML = subjectsCache.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
}

document.getElementById("create-subject-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-subject-name").value.trim();
  const duration = parseInt(document.getElementById("new-subject-duration").value, 10) || 30;
  if (!name) return;
  const btn = document.getElementById("create-subject-btn");
  btn.disabled = true;
  try {
    await addDoc(collection(db, "subjects"), { name, durationMinutes: duration, createdAt: serverTimestamp() });
    document.getElementById("new-subject-name").value = "";
    await loadSubjects();
  } finally {
    btn.disabled = false;
  }
});

// ---------- Raw-text question parser ----------
function parseQuestions(rawText) {
  const blocks = rawText.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const results = [];
  const errors = [];

  blocks.forEach((block, idx) => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) { errors.push(`Block ${idx + 1}: too short to be a question`); return; }

    let qLine = lines[0].replace(/^\s*\d+\s*[\.\)]\s*/, "");
    const options = [];
    let answerLetter = null, topic = null, explanation = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if ((m = line.match(/^\(?([A-Da-d])\)?[\.\):]\s*(.+)$/))) {
        options.push(m[2].trim());
      } else if ((m = line.match(/^(?:correct\s*)?answer\s*[:\-]?\s*\(?([A-Da-d])\)?/i))) {
        answerLetter = m[1].toUpperCase();
      } else if ((m = line.match(/^topic\s*[:\-]\s*(.+)$/i))) {
        topic = m[1].trim();
      } else if ((m = line.match(/^explanation\s*[:\-]\s*(.+)$/i))) {
        explanation = m[1].trim();
      } else if (options.length === 0 && !answerLetter) {
        qLine += " " + line; // multi-line question text
      }
    }

    if (!qLine || options.length < 2 || !answerLetter) {
      errors.push(`Block ${idx + 1}: couldn't find a question with options and an answer letter`);
      return;
    }
    const correctIndex = answerLetter.charCodeAt(0) - 65;
    if (correctIndex < 0 || correctIndex >= options.length) {
      errors.push(`Block ${idx + 1}: answer "${answerLetter}" doesn't match any option given`);
      return;
    }
    const q = { text: qLine, options, correctIndex, createdAt: serverTimestamp() };
    if (topic) q.topic = topic;
    if (explanation) q.explanation = explanation;
    results.push(q);
  });

  return { results, errors };
}

document.getElementById("parse-btn").addEventListener("click", async () => {
  const subjectId = document.getElementById("target-subject").value;
  const raw = document.getElementById("raw-questions").value;
  const reportEl = document.getElementById("parse-report");
  if (!subjectId) { reportEl.innerHTML = `<span class="err">Create a subject first.</span>`; return; }
  if (!raw.trim()) return;

  const { results, errors } = parseQuestions(raw);
  const btn = document.getElementById("parse-btn");
  btn.disabled = true;
  try {
    await Promise.all(results.map(q => addDoc(collection(db, "subjects", subjectId, "questions"), q)));
    let html = `<span class="ok">Added ${results.length} question${results.length === 1 ? "" : "s"}.</span>`;
    if (errors.length) {
      html += `<br/><span class="err">Skipped ${errors.length}:</span><ul style="margin:4px 0 0 18px;">` +
        errors.map(e => `<li class="err">${escapeHtml(e)}</li>`).join("") + `</ul>`;
    }
    reportEl.innerHTML = html;
    if (results.length > 0) document.getElementById("raw-questions").value = "";
    await loadSubjects();
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("back-to-dashboard").addEventListener("click", () => {
  showView("view-app");
  loadSubjects();
});

// ============================================================
// Test-taking engine
// ============================================================
let currentSubject = null;
let currentQuestions = [];
let answers = {};       // questionId -> selected option index
let marked = new Set(); // questionIds marked for review
let visited = new Set();
let currentIndex = 0;
let timerInterval = null;
let endTime = 0;

async function startTest(subjectId) {
  currentSubject = subjectsCache.find(s => s.id === subjectId);
  if (!currentSubject) return;

  const snap = await getDocs(collection(db, "subjects", subjectId, "questions"));
  currentQuestions = [];
  snap.forEach(d => currentQuestions.push({ id: d.id, ...d.data() }));
  if (currentQuestions.length === 0) return;

  answers = {};
  marked = new Set();
  visited = new Set();
  currentIndex = 0;

  document.getElementById("test-subject-name").textContent = currentSubject.name;
  const durationMin = currentSubject.durationMinutes || 30;
  endTime = Date.now() + durationMin * 60 * 1000;

  showView("view-test");
  renderQuestion();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}

function tickTimer() {
  const remainingMs = endTime - Date.now();
  const timerEl = document.getElementById("timer");
  if (remainingMs <= 0) {
    timerEl.textContent = "00:00";
    clearInterval(timerInterval);
    submitTest();
    return;
  }
  const totalSec = Math.floor(remainingMs / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  timerEl.textContent = `${mm}:${ss}`;
  timerEl.classList.toggle("low", totalSec < 5 * 60);
}

function renderQuestion() {
  const q = currentQuestions[currentIndex];
  visited.add(q.id);

  document.getElementById("q-count").textContent = `Q ${currentIndex + 1} / ${currentQuestions.length}`;
  document.getElementById("q-text").textContent = q.text;

  const topicEl = document.getElementById("q-topic");
  if (q.topic) { topicEl.textContent = q.topic; topicEl.classList.remove("hidden"); }
  else { topicEl.classList.add("hidden"); }

  const optionsEl = document.getElementById("q-options");
  optionsEl.innerHTML = "";
  q.options.forEach((opt, i) => {
    const row = document.createElement("div");
    row.className = "option-row" + (answers[q.id] === i ? " selected" : "");
    row.innerHTML = `<div class="option-marker"></div><div>${escapeHtml(opt)}</div>`;
    row.addEventListener("click", () => {
      answers[q.id] = i;
      renderQuestion();
    });
    optionsEl.appendChild(row);
  });

  renderPalette();
}

function renderPalette() {
  const grid = document.getElementById("palette-grid");
  grid.innerHTML = "";
  currentQuestions.forEach((q, i) => {
    const btn = document.createElement("button");
    const isAnswered = answers[q.id] !== undefined;
    const isMarked = marked.has(q.id);
    const isVisited = visited.has(q.id);
    let cls = "palette-btn";
    if (i === currentIndex) cls += " current";
    if (isMarked && isAnswered) cls += " marked marked-answered";
    else if (isMarked) cls += " marked";
    else if (isAnswered) cls += " answered";
    else if (isVisited) cls += " not-answered";
    btn.className = cls;
    btn.textContent = i + 1;
    btn.addEventListener("click", () => { currentIndex = i; renderQuestion(); });
    grid.appendChild(btn);
  });
}

function goNext() {
  if (currentIndex < currentQuestions.length - 1) currentIndex++;
  renderQuestion();
}

document.getElementById("btn-save-next").addEventListener("click", goNext);
document.getElementById("btn-mark-review").addEventListener("click", () => {
  marked.add(currentQuestions[currentIndex].id);
  goNext();
});
document.getElementById("btn-clear").addEventListener("click", () => {
  delete answers[currentQuestions[currentIndex].id];
  renderQuestion();
});
document.getElementById("btn-submit-test").addEventListener("click", () => {
  if (confirm("Submit the test now? You can't change answers after this.")) {
    clearInterval(timerInterval);
    submitTest();
  }
});

async function submitTest() {
  let correct = 0, wrong = 0, unattempted = 0;
  const topicStats = {};
  const reviewData = [];

  currentQuestions.forEach(q => {
    const sel = answers[q.id];
    const isAnswered = sel !== undefined;
    const isCorrect = isAnswered && sel === q.correctIndex;
    if (!isAnswered) unattempted++;
    else if (isCorrect) correct++;
    else wrong++;

    if (q.topic) {
      topicStats[q.topic] = topicStats[q.topic] || { correct: 0, total: 0 };
      topicStats[q.topic].total++;
      if (isCorrect) topicStats[q.topic].correct++;
    }
    reviewData.push({ ...q, selected: sel, isAnswered, isCorrect });
  });

  const total = currentQuestions.length;

  try {
    await addDoc(collection(db, "attempts"), {
      uid: auth.currentUser.uid,
      userEmail: auth.currentUser.email,
      subjectId: currentSubject.id,
      subjectName: currentSubject.name,
      correct, wrong, unattempted, total,
      topicStats,
      submittedAt: serverTimestamp()
    });
  } catch (e) {
    console.error("Could not save attempt:", e);
  }

  renderResults({ correct, wrong, unattempted, total, topicStats, reviewData });
}

// ============================================================
// Results
// ============================================================
function renderResults(r) {
  document.getElementById("results-subject-name").textContent = currentSubject.name;
  const pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
  document.getElementById("results-meta").textContent = `${r.correct} of ${r.total} correct`;

  document.getElementById("results-summary").innerHTML = `
    <div class="result-stat"><div class="num">${pct}%</div><div class="label">Score</div></div>
    <div class="result-stat"><div class="num" style="color:var(--success)">${r.correct}</div><div class="label">Correct</div></div>
    <div class="result-stat"><div class="num" style="color:var(--danger)">${r.wrong}</div><div class="label">Wrong</div></div>
    <div class="result-stat"><div class="num" style="color:var(--text-muted)">${r.unattempted}</div><div class="label">Unattempted</div></div>
  `;

  const topicKeys = Object.keys(r.topicStats);
  const topicBarsEl = document.getElementById("topic-bars");
  if (topicKeys.length === 0) {
    topicBarsEl.innerHTML = "";
  } else {
    topicBarsEl.innerHTML = `<h3 style="margin-bottom:14px;">By topic</h3>` + topicKeys.map(topic => {
      const t = r.topicStats[topic];
      const w = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
      return `
        <div class="topic-row">
          <div>${escapeHtml(topic)}</div>
          <div class="topic-track"><div class="topic-fill" style="width:${w}%"></div></div>
          <div style="text-align:right;color:var(--text-muted);">${t.correct}/${t.total}</div>
        </div>`;
    }).join("");
  }

  const reviewEl = document.getElementById("review-list");
  reviewEl.innerHTML = r.reviewData.map(q => {
    const cls = !q.isAnswered ? "skipped" : (q.isCorrect ? "right" : "wrong");
    const yourAnswer = q.isAnswered ? q.options[q.selected] : "Not attempted";
    return `
      <div class="review-item ${cls}">
        <div>${escapeHtml(q.text)}</div>
        <div class="review-answer ${q.isAnswered ? (q.isCorrect ? "correct-text" : "wrong-text") : ""}">Your answer: ${escapeHtml(yourAnswer)}</div>
        ${!q.isCorrect ? `<div class="review-answer correct-text">Correct answer: ${escapeHtml(q.options[q.correctIndex])}</div>` : ""}
        ${q.explanation ? `<div class="review-answer" style="color:var(--text-muted);">${escapeHtml(q.explanation)}</div>` : ""}
      </div>`;
  }).join("");

  showView("view-results");
}

// ============================================================
// Utilities
// ============================================================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
