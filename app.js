// ============================================================
// Firebase setup
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup,
  sendEmailVerification, applyActionCode, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const ADMIN_UID = "PMbrCOTH61ZegHUTe2xVqDnidUm2";
import {
  getFirestore, collection, addDoc, getDocs, getCountFromServer,
  serverTimestamp, deleteDoc, doc, updateDoc
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
// View switching & Theme
// ============================================================
const views = ["view-auth", "view-verify", "view-app", "view-test", "view-results"];
function showView(name) {
  views.forEach(v => document.getElementById(v).classList.toggle("hidden", v !== name));
}

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
// Auth
// ============================================================
let isSignupMode = false;
const authForm = document.getElementById("auth-form");
const authError = document.getElementById("auth-error");
const authTitle = document.getElementById("auth-title");
const authSub = document.getElementById("auth-sub");
const authSubmit = document.getElementById("auth-submit");
const authSwitchText = document.getElementById("auth-switch-text");
const authSwitchBtn = document.getElementById("auth-switch-btn");
const forgotPwdBtn = document.getElementById("forgot-pwd-btn");

function renderAuthMode() {
  authError.textContent = "";
  if (isSignupMode) {
    authTitle.textContent = "Create your account";
    authSub.textContent = "Set up access to your tests.";
    authSubmit.textContent = "Create account";
    authSwitchText.textContent = "Already have an account?";
    authSwitchBtn.textContent = "Log in";
    if (forgotPwdBtn) forgotPwdBtn.style.display = "none";
  } else {
    authTitle.textContent = "Welcome back";
    authSub.textContent = "Log in to continue your prep.";
    authSubmit.textContent = "Log in";
    authSwitchText.textContent = "New here?";
    authSwitchBtn.textContent = "Create an account";
    if (forgotPwdBtn) forgotPwdBtn.style.display = "inline-block";
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

const DISPOSABLE_DOMAINS = new Set(["mailinator.com","guerrillamail.com","tempmail.com","yopmail.com"]); 
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
        authError.textContent = "Please use a permanent email address.";
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

if (forgotPwdBtn) {
  forgotPwdBtn.addEventListener("click", async () => {
    const email = document.getElementById("auth-email").value.trim();
    if (!email) {
      showAuthNotice(false, "Type your email address in the box above, then click 'Forgot password?'");
      return;
    }
    authError.style.color = "var(--text-muted)";
    authError.textContent = "Sending reset link...";
    try {
      await sendPasswordResetEmail(auth, email);
      showAuthNotice(true, "Password reset link sent! Check your inbox.");
    } catch (err) {
      showAuthNotice(false, "Couldn't send the reset link. Check the email address.");
    }
  });
}

document.getElementById("google-signin-btn").addEventListener("click", async () => {
  authError.style.color = "var(--danger)";
  authError.textContent = "Connecting to Google...";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    authError.textContent = `Google Error: ${err.message || err.code}`;
  }
});

document.getElementById("signout-btn").addEventListener("click", () => signOut(auth));
document.getElementById("verify-signout-btn").addEventListener("click", () => signOut(auth));

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
    verifyError.textContent = "Please wait a bit before requesting another link.";
  }
});

function routeUser(user) {
  if (user && user.emailVerified) {
    document.getElementById("whoami").textContent = user.email;
    
    // Show admin panel if admin
    const isAdmin = user.uid === ADMIN_UID;
    const adminTile = document.getElementById("admin-dashboard-tile");
    if(adminTile) {
      if(isAdmin) adminTile.classList.remove("hidden");
      else adminTile.classList.add("hidden");
    }

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
// Dashboard: Folders, Tests & Admin Panel
// ============================================================
let subjectsCache = [];
let navSubject = null; 
let navType = null;    

const folderIconSvg = `<svg class="folder-icon" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;

async function loadSubjects() {
  const listEl = document.getElementById("test-list");
  if(listEl) listEl.innerHTML = `<div class="test-row-empty">Loading…</div>`;
  
  const snap = await getDocs(collection(db, "subjects"));
  subjectsCache = [];
  
  snap.forEach(d => {
    const data = d.data();
    subjectsCache.push({
      id: d.id,
      subject: data.subject || "General / Uncategorized",
      type: data.type || "Miscellaneous",
      testName: data.testName || data.name || "Untitled Test",
      durationMinutes: data.durationMinutes || 30,
      ...data
    });
  });

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

window.goHomeFolder = function() { navSubject = null; navType = null; renderTestList(); };
window.goSubjectFolder = function() { navType = null; renderTestList(); };
window.openSubject = function(sub) { navSubject = sub; renderTestList(); };
window.openType = function(typ) { navType = typ; renderTestList(); };

function renderTestList() {
  const listEl = document.getElementById("test-list");
  const breadcrumb = document.getElementById("dashboard-breadcrumb");
  listEl.innerHTML = "";
  
  const isAdmin = auth.currentUser && auth.currentUser.uid === ADMIN_UID;

  if (!navSubject) {
    breadcrumb.innerHTML = `📁 All Exams`;
    const uniqueSubjects = [...new Set(subjectsCache.map(s => s.subject))];
    
    if (uniqueSubjects.length === 0) {
      listEl.innerHTML = `<div class="test-row-empty">No tests created yet.</div>`;
      return;
    }
    
    uniqueSubjects.forEach(sub => {
      const el = document.createElement("div");
      el.className = "folder-card";
      el.onclick = () => openSubject(sub);
      el.innerHTML = `${folderIconSvg}<h3 style="margin:0;">${escapeHtml(sub)}</h3>`;
      listEl.appendChild(el);
    });
  } 
  else if (!navType) {
    breadcrumb.innerHTML = `<span class="breadcrumb-link" onclick="goHomeFolder()">📁 All Exams</span> > ${escapeHtml(navSubject)}`;
    const uniqueTypes = [...new Set(subjectsCache.filter(s => s.subject === navSubject).map(s => s.type))];
    
    uniqueTypes.forEach(typ => {
      const el = document.createElement("div");
      el.className = "folder-card";
      el.onclick = () => openType(typ);
      el.innerHTML = `${folderIconSvg}<h3 style="margin:0;">${escapeHtml(typ)}</h3>`;
      listEl.appendChild(el);
    });
  } 
  else {
    breadcrumb.innerHTML = `<span class="breadcrumb-link" onclick="goHomeFolder()">📁 All Exams</span> > <span class="breadcrumb-link" onclick="goSubjectFolder()">${escapeHtml(navSubject)}</span> >${escapeHtml(navType)}`;
    
    const tests = subjectsCache.filter(s => s.subject === navSubject && s.type === navType);
    
    if (tests.length === 0) {
      listEl.innerHTML = `<div class="test-row-empty">No tests found in this folder.</div>`;
      return;
    }

    tests.forEach(t => {
      const row = document.createElement("div");
      row.className = "test-row";
      row.style.gridColumn = "1 / -1"; 
      
      const hasQuestions = (t.questionCount || 0) > 0;
      
      const editBtn = isAdmin ? `<button class="btn btn-sm edit-btn" style="background-color: var(--primary); color: white; margin-left: 8px; border: none;" data-edit-id="${t.id}">Edit</button>` : "";
      const deleteBtn = isAdmin ? `<button class="btn btn-sm delete-btn" style="background-color: var(--danger); color: white; margin-left: 8px; border: none;" data-delete-id="${t.id}">Delete</button>` : "";

      row.innerHTML = `
        <div class="test-row-info">
          <h3>${escapeHtml(t.testName)}</h3>
          <div class="test-row-meta">${t.questionCount \vert{}\vert{} 0} questions · ${t.durationMinutes || 30} min</div>
        </div>
        <div style="display: flex; align-items: center;">
          <button class="btn btn-primary btn-sm start-btn" ${hasQuestions ? "" : "disabled"} data-subject-id="${t.id}">
            ${hasQuestions ? "Start test" : "No questions yet"}
          </button>
          ${editBtn}${deleteBtn}
        </div>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll(".start-btn").forEach(btn => {
      btn.addEventListener("click", () => startTest(btn.getAttribute("data-subject-id")));
    });

    if (isAdmin) {
      listEl.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (confirm("Are you sure you want to delete this test? This cannot be undone.")) {
            btn.disabled = true; btn.textContent = "...";
            try {
              await deleteDoc(doc(db, "subjects", btn.getAttribute("data-delete-id")));
              await loadSubjects();
            } catch (e) { alert("Couldn't delete. Please try again."); btn.disabled = false; btn.textContent = "Delete"; }
          }
        });
      });
      
      listEl.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          openEditModal(btn.getAttribute("data-edit-id"));
        });
      });
    }
  }
}

function renderSubjectSelect() {
  const select = document.getElementById("target-subject");
  if(select) {
    select.innerHTML = subjectsCache.map(s => 
      `<option value="${s.id}">${escapeHtml(s.subject)} > ${escapeHtml(s.type)} >${escapeHtml(s.testName)}</option>`
    ).join("");
  }
}

// ---------------- ADMIN: Create Test Container ----------------
document.getElementById("create-subject-btn").addEventListener("click", async () => {
  const subjectInput = document.getElementById("new-subject").value.trim() || "General";
  const typeInput = document.getElementById("new-type").value || "Miscellaneous";
  const testNameInput = document.getElementById("new-test-name").value.trim() || "Untitled Test";
  const durationInput = parseInt(document.getElementById("new-duration").value, 10) || 30;

  const btn = document.getElementById("create-subject-btn");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    await addDoc(collection(db, "subjects"), { 
      subject: subjectInput,
      type: typeInput,
      testName: testNameInput,
      durationMinutes: durationInput, 
      createdAt: serverTimestamp() 
    });
    
    document.getElementById("new-subject").value = "";
    document.getElementById("new-test-name").value = "";
    document.getElementById("new-duration").value = "";
    
    navSubject = subjectInput;
    navType = typeInput;
    await loadSubjects();
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Test Container";
  }
});

// ---------------- ADMIN: Edit Modal Logic ----------------
const editModal = document.getElementById("edit-test-modal");

function openEditModal(testId) {
  const test = subjectsCache.find(s => s.id === testId);
  if(!test) return;
  
  document.getElementById("edit-test-id").value = test.id;
  document.getElementById("edit-subject").value = test.subject || "";
  document.getElementById("edit-type").value = test.type || "Miscellaneous";
  document.getElementById("edit-test-name").value = test.testName || "";
  document.getElementById("edit-duration").value = test.durationMinutes || 30;
  
  editModal.classList.remove("hidden");
}

document.getElementById("cancel-edit-btn").addEventListener("click", () => {
  editModal.classList.add("hidden");
});

document.getElementById("save-edit-btn").addEventListener("click", async () => {
  const id = document.getElementById("edit-test-id").value;
  const newSubject = document.getElementById("edit-subject").value.trim() || "General";
  const newType = document.getElementById("edit-type").value || "Miscellaneous";
  const newTestName = document.getElementById("edit-test-name").value.trim() || "Untitled Test";
  const newDuration = parseInt(document.getElementById("edit-duration").value, 10) || 30;
  
  const btn = document.getElementById("save-edit-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  
  try {
    await updateDoc(doc(db, "subjects", id), {
      subject: newSubject,
      type: newType,
      testName: newTestName,
      name: newTestName, 
      durationMinutes: newDuration
    });
    
    editModal.classList.add("hidden");
    await loadSubjects();
  } catch(e) {
    alert("Error updating test: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Changes";
  }
});

// ============================================================
// INTELLIGENT RAW TEXT PARSER (State Machine Architecture)
// ============================================================
function parseQuestions(rawText) {
  
  let cleanRaw = rawText
    .replace(/\*\*/g, '')           
    .replace(/###\s*/g, '')         
    .replace(/^\s*\*\s+/gm, '')     
    .replace(/`/g, '');             

  const lines = cleanRaw.replace(/\r\n/g, '\n').split('\n');
  const results = [];
  const errors = [];
  let currentQ = null;

  function finalizeQuestion() {
    if (!currentQ) return;
    
    currentQ.text = currentQ.text.trim();
    if (currentQ.explanation) currentQ.explanation = currentQ.explanation.trim();
    if (currentQ.topic) currentQ.topic = currentQ.topic.trim();

    if (!currentQ.text) {
       errors.push(`A block was skipped because it lacked recognizable question text.`);
    } else if (currentQ.options.length < 2) {
       errors.push(`Question "${currentQ.text.substring(0, 30)}...": Skipped because it didn't have enough clear options (found ${currentQ.options.length}).`);
    } else if (currentQ.correctIndex === null) {
       errors.push(`Question "${currentQ.text.substring(0, 30)}...": Skipped because no valid answer was found.`);
    } else {
       const qToSave = {
         text: currentQ.text,
         options: currentQ.options.map(o => o.trim()),
         correctIndex: currentQ.correctIndex,
         createdAt: serverTimestamp()
       };
       if (currentQ.topic) qToSave.topic = currentQ.topic;
       if (currentQ.explanation) qToSave.explanation = currentQ.explanation;
       results.push(qToSave);
    }
    currentQ = null;
  }

  function startNewQuestion(firstLine) {
    finalizeQuestion(); 
    const cleanText = firstLine.replace(/^(?:q(?:ue(?:stion)?)?\.?\s*(?:no\.?)?\s*\d+|(?:\(\d+\))|\d+[\.\)\-:])\s*/i, "");
    currentQ = {
      text: cleanText,
      options: [],
      correctIndex: null,
      topic: null,
      explanation: null,
      state: 'QUESTION'
    };
  }

  const optionRegex = /^(?:[*\-\+]\s*)?(?:([A-Da-d])[\.\:\-\)]|(?:\(([A-Da-d])\)))\s+(.+)$/i;
  const ansRegexLetter = /^(?:correct\s*)?(?:answer|ans|key|correct option|correct)[\.\:\=\-]?\s*\(?([A-Da-d])\)?(?:\s|$)/i;
  const ansRegexText = /^(?:correct\s*)?(?:answer|ans|key|correct option|correct)[\.\:\=\-]?\s*(.+)$/i;
  const topicRegex = /^topic\s*[\.\:\=\-]\s*(.+)$/i;
  const expRegex = /^explanation\s*[\.\:\=\-]\s*(.+)$/i;
  const metaRegex = /^(?:source|reference|difficulty|level|chapter|category|tags|notes|bloom's taxonomy)\s*[\.\:\=\-]\s*(.+)$/i;
  const newQMarkerRegex = /^(?:q(?:ue(?:stion)?)?\.?\s*(?:no\.?)?\s*\d+|(?:\(\d+\))|\d+[\.\)\-:])(?:\s+|$)/i;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    if (newQMarkerRegex.test(line)) {
        if (!currentQ || currentQ.options.length > 0 || currentQ.correctIndex !== null) {
            startNewQuestion(line);
            continue;
        }
    }

    if (!currentQ) {
        startNewQuestion(line);
        continue;
    }

    const optMatch = line.match(optionRegex);
    const ansLetterMatch = line.match(ansRegexLetter);
    const ansTextMatch = !ansLetterMatch ? line.match(ansRegexText) : null;
    const topicMatch = line.match(topicRegex);
    const expMatch = line.match(expRegex);
    const metaMatch = line.match(metaRegex);
    const isRecognizedTag = optMatch || ansLetterMatch || ansTextMatch || topicMatch || expMatch || metaMatch;

    if (currentQ.correctIndex !== null && !isRecognizedTag && currentQ.state !== 'EXPLANATION') {
        startNewQuestion(line);
        continue;
    }

    if (expMatch) {
        currentQ.explanation = expMatch[1];
        currentQ.state = 'EXPLANATION';
        continue;
    }

    if (topicMatch) {
        currentQ.topic = topicMatch[1];
        currentQ.state = 'METADATA';
        continue;
    }

    if (metaMatch) {
        currentQ.state = 'METADATA';
        continue;
    }

    if (ansLetterMatch) {
        const letter = ansLetterMatch[1].toUpperCase();
        currentQ.correctIndex = letter.charCodeAt(0) - 65;
        currentQ.state = 'METADATA';
        continue;
    }

    if (ansTextMatch && currentQ.correctIndex === null) {
        const textAns = ansTextMatch[1].trim().toLowerCase();
        let found = -1;
        for (let o = 0; o < currentQ.options.length; o++) {
            let optClean = currentQ.options[o].toLowerCase().replace(/^[*\-\+]\s*/, '').trim();
            if (optClean === textAns || textAns.includes(optClean)) {
                found = o; break;
            }
        }
        if (found !== -1) currentQ.correctIndex = found;
        currentQ.state = 'METADATA';
        continue;
    }

    if (optMatch && currentQ.state !== 'METADATA' && currentQ.state !== 'EXPLANATION') {
        currentQ.options.push(optMatch[3]); 
        currentQ.state = 'OPTIONS';
        continue;
    }

    if (currentQ.state === 'QUESTION') {
        currentQ.text += (currentQ.text ? "\n" : "") + line;
    } else if (currentQ.state === 'OPTIONS') {
         if (currentQ.options.length > 0) {
             currentQ.options[currentQ.options.length - 1] += "\n" + line;
         }
    } else if (currentQ.state === 'EXPLANATION') {
         currentQ.explanation += "\n" + line;
    }
  }

  finalizeQuestion();
  return { results, errors };
}

// ============================================================
// Preview and Import Workflow
// ============================================================
let pendingImport = [];

document.getElementById("parse-btn").addEventListener("click", () => {
  const subjectId = document.getElementById("target-subject").value;
  const raw = document.getElementById("raw-questions").value;
  const reportEl = document.getElementById("parse-report");
  const confirmBtn = document.getElementById("confirm-import-btn");

  if (!subjectId) { reportEl.innerHTML = `<span class="err" style="color:var(--danger)">Create a test container first.</span>`; return; }
  if (!raw.trim()) { reportEl.innerHTML = `<span class="err" style="color:var(--danger)">Paste some questions first.</span>`; return; }

  const { results, errors } = parseQuestions(raw);
  pendingImport = results; 

  let html = `<div style="padding: 15px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; margin-top: 15px;">
                <h3 style="margin-bottom: 10px; font-size: 1.1rem;">Preview Summary</h3>
                <p style="margin: 0 0 5px 0;"><strong>Valid questions found:</strong> <span style="color:var(--success); font-weight:bold;">${results.length}</span></p>
                <p style="margin: 0 0 10px 0;"><strong>Needs review / Skipped:</strong> <span style="color:var(--danger); font-weight:bold;">${errors.length}</span></p>`;

  if (errors.length > 0) {
    html += `<div style="background: rgba(220, 38, 38, 0.1); color: var(--danger); padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 10px;">
               <strong>Errors to fix:</strong>
               <ul style="margin: 5px 0 0 20px;">` + errors.map(e => `<li>${escapeHtml(e)}</li>`).join("") + `</ul>
             </div>`;
  }

  if (results.length > 0) {
    let optionsHtml = results[0].options.map((opt, i) => {
        let isCorrect = (i === results[0].correctIndex) ? '✅ <em>(Correct)</em>' : '';
        return `<li style="margin-bottom:5px;">${String.fromCharCode(65+i)}) ${escapeHtml(opt)} ${isCorrect}</li>`;
    }).join('');

    let topicHtml = results[0].topic ? `<p style="margin:10px 0 0 0;"><strong>Topic:</strong> ${escapeHtml(results[0].topic)}</p>` : '';
    let expHtml = results[0].explanation ? `<p style="margin:10px 0 0 0;"><strong>Explanation:</strong> ${escapeHtml(results[0].explanation)}</p>` : '';

    html += `<details style="cursor:pointer; font-size: 0.9rem; color: var(--text-muted); margin-top: 10px;">
               <summary>Click to view the first parsed question as a sample</summary>
               <div style="padding: 15px; border: 1px dashed var(--line-strong); margin-top: 10px; color: var(--text); text-align: left; background: var(--bg);">
                 <p style="margin-top:0;"><strong>Q:</strong> ${escapeHtml(results[0].text)}</p>
                 <ul style="margin:10px 0 0 20px;">
                   ${optionsHtml}
                 </ul>
                 ${topicHtml}
                 ${expHtml}
               </div>
             </details>`;
             
    confirmBtn.classList.remove("hidden");
    confirmBtn.innerText = `Confirm Import (${results.length} questions)`;
  } else {
    confirmBtn.classList.add("hidden");
  }

  html += `</div>`;
  reportEl.innerHTML = html;
});

document.getElementById("confirm-import-btn").addEventListener("click", async () => {
  const subjectId = document.getElementById("target-subject").value;
  const reportEl = document.getElementById("parse-report");
  const confirmBtn = document.getElementById("confirm-import-btn");
  const parseBtn = document.getElementById("parse-btn");

  confirmBtn.disabled = true;
  parseBtn.disabled = true;
  confirmBtn.innerText = "Importing...";

  try {
    await Promise.all(pendingImport.map(q => addDoc(collection(db, "subjects", subjectId, "questions"), q)));
    reportEl.innerHTML = `<div style="padding: 15px; background: rgba(16, 185, 129, 0.1); color: var(--success); border-radius: 8px; margin-top: 15px; font-weight: bold; text-align:center;">
      ✅ Successfully imported ${pendingImport.length} questions!
    </div>`;
    document.getElementById("raw-questions").value = "";
    pendingImport = [];
    confirmBtn.classList.add("hidden");
    await loadSubjects();
  } catch (err) {
    reportEl.innerHTML += `<div class="auth-error" style="margin-top:10px; color: var(--danger);">Upload failed. Please try again.</div>`;
  } finally {
    confirmBtn.disabled = false;
    parseBtn.disabled = false;
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
let answers = {};
let marked = new Set();
let visited = new Set();
let currentIndex = 0;
let timerInterval = null;
let endTime = 0;
let isTestActive = false;

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

  document.getElementById("test-subject-name").textContent = `${currentSubject.subject} - ${currentSubject.testName}`;
  const durationMin = currentSubject.durationMinutes || 30;
  endTime = Date.now() + durationMin * 60 * 1000;
  isTestActive = true;

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
  isTestActive = false; 
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
      subjectName: currentSubject.testName || currentSubject.name,
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
  document.getElementById("results-subject-name").textContent = currentSubject.testName || currentSubject.name;
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
  let reviewHtmlList = r.reviewData.map(q => {
    const cls = !q.isAnswered ? "skipped" : (q.isCorrect ? "right" : "wrong");
    const yourAnswer = q.isAnswered ? q.options[q.selected] : "Not attempted";
    
    let correctString = !q.isCorrect ? `<div class="review-answer correct-text">Correct answer: ${escapeHtml(q.options[q.correctIndex])}</div>` : "";
    let expString = q.explanation ? `<div class="review-answer" style="color:var(--text-muted);">${escapeHtml(q.explanation)}</div>` : "";

    return `
      <div class="review-item ${cls}">
        <div>${escapeHtml(q.text)}</div>
        <div class="review-answer ${q.isAnswered ? (q.isCorrect ? "correct-text" : "wrong-text") : ""}">Your answer: ${escapeHtml(yourAnswer)}</div>
        ${correctString}
        ${expString}
      </div>`;
  });
  
  reviewEl.innerHTML = reviewHtmlList.join("");
  showView("view-results");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isTestActive) {
    alert("Anti-Cheating Alert: You left the test tab! Your test has been automatically submitted.");
    clearInterval(timerInterval);
    submitTest();
  }
});

const homeLink = document.getElementById("home-link");
if (homeLink) {
  homeLink.addEventListener("click", () => {
    if (!auth.currentUser) return; 
    if (isTestActive) {
      if (confirm("Warning: You are in the middle of a test. If you go to the Dashboard, your test will be automatically submitted. Continue?")) {
        clearInterval(timerInterval);
        submitTest();
      }
    } else {
      showView("view-app");
      loadSubjects();
    }
  });
}
