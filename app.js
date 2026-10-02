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
  serverTimestamp, deleteDoc, doc, updateDoc, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let draggedTestId = null; // admin drag-and-drop reordering (slide-sorter style)

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

async function renderTestList() {
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
    
    const tests = subjectsCache
      .filter(s => s.subject === navSubject && s.type === navType)
      .sort((a, b) => {
        const oa = a.order != null ? a.order : (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0);
        const ob = b.order != null ? b.order : (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0);
        return oa - ob;
      });
    
    if (tests.length === 0) {
      listEl.innerHTML = `<div class="test-row-empty">No tests found in this folder.</div>`;
      return;
    }

    for (let idx = 0; idx < tests.length; idx++) {
      const t = tests[idx];
      const row = document.createElement("div");
      row.className = "test-row";
      row.style.gridColumn = "1 / -1"; 

      const hasQuestions = (t.questionCount || 0) > 0;

      const upBtn = isAdmin ? `<button class="btn btn-sm reorder-btn" ${idx === 0 ? "disabled" : ""} data-dir="up" data-reorder-id="${t.id}" title="Move up">▲</button>` : "";
      const downBtn = isAdmin ? `<button class="btn btn-sm reorder-btn" ${idx === tests.length - 1 ? "disabled" : ""} data-dir="down" data-reorder-id="${t.id}" title="Move down">▼</button>` : "";
      const editBtn = isAdmin ? `<button class="btn btn-sm edit-btn" style="background-color: var(--primary); color: white; margin-left: 8px; border: none;" data-edit-id="${t.id}">Edit</button>` : "";
      const deleteBtn = isAdmin ? `<button class="btn btn-sm delete-btn" style="background-color: var(--danger); color: white; margin-left: 8px; border: none;" data-delete-id="${t.id}">Delete</button>` : "";

      let lastAttempt = null;
      try {
        const attemptSnap = await getDocs(query(
          collection(db, "attempts"),
          where("uid", "==", auth.currentUser.uid),
          where("subjectId", "==", t.id)
        ));
        attemptSnap.forEach(d => {
          const a = d.data();
          const ms = a.submittedAt && a.submittedAt.toMillis ? a.submittedAt.toMillis() : 0;
          if (!lastAttempt || ms > lastAttempt._ms) lastAttempt = { ...a, _ms: ms };
        });
      } catch (e) { /* no prior attempt, or not readable yet — treat as unattempted */ }

      const pct = lastAttempt && lastAttempt.total > 0 ? Math.round((lastAttempt.correct / lastAttempt.total) * 100) : null;
      const attemptBadge = lastAttempt
        ? `<div class="test-row-meta" style="color:var(--success);margin-top:4px;">Attempted · last score ${pct}%</div>`
        : "";
      const startLabel = hasQuestions ? (lastAttempt ? "Retake test" : "Start test") : "No questions yet";

      const dragHandle = isAdmin ? `<span class="drag-handle" title="Drag to reorder">⠿</span>` : "";

      row.innerHTML = `
        <div class="test-row-info" style="display:flex;align-items:flex-start;gap:10px;">
          ${dragHandle}
          <div>
            <h3>${escapeHtml(t.testName)}</h3>
            <div class="test-row-meta">${t.questionCount || 0} questions · ${t.durationMinutes || 30} min</div>
            ${attemptBadge}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap:4px;">
          <button class="btn btn-primary btn-sm start-btn" ${hasQuestions ? "" : "disabled"} data-subject-id="${t.id}">
            ${startLabel}
          </button>
          ${upBtn}${downBtn}${editBtn}${deleteBtn}
        </div>
      `;

      if (isAdmin) {
        row.draggable = true;
        row.addEventListener("dragstart", () => {
          draggedTestId = t.id;
          row.classList.add("dragging");
        });
        row.addEventListener("dragend", () => row.classList.remove("dragging"));
        row.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (draggedTestId && draggedTestId !== t.id) row.classList.add("drag-over");
        });
        row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
        row.addEventListener("drop", async (e) => {
          e.preventDefault();
          row.classList.remove("drag-over");
          if (!draggedTestId || draggedTestId === t.id) return;
          const fromIdx = tests.findIndex(x => x.id === draggedTestId);
          const toIdx = tests.findIndex(x => x.id === t.id);
          if (fromIdx === -1 || toIdx === -1) return;
          const reordered = tests.slice();
          const [moved] = reordered.splice(fromIdx, 1);
          reordered.splice(toIdx, 0, moved);
          try {
            const batch = writeBatch(db);
            reordered.forEach((item, i) => batch.update(doc(db, "subjects", item.id), { order: i * 10 }));
            await batch.commit();
            draggedTestId = null;
            await loadSubjects();
          } catch (err) {
            alert("Couldn't reorder. Please try again.");
          }
        });
      }

      listEl.appendChild(row);
    }

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

      listEl.querySelectorAll(".reorder-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-reorder-id");
          const dir = btn.getAttribute("data-dir");
          const idx = tests.findIndex(x => x.id === id);
          const swapIdx = dir === "up" ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= tests.length) return;

          const a = tests[idx], b = tests[swapIdx];
          const orderA = a.order != null ? a.order : (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now());
          const orderB = b.order != null ? b.order : (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now());

          btn.disabled = true;
          try {
            await updateDoc(doc(db, "subjects", a.id), { order: orderB });
            await updateDoc(doc(db, "subjects", b.id), { order: orderA });
            await loadSubjects();
          } catch (e) {
            alert("Couldn't reorder. Please try again.");
            btn.disabled = false;
          }
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
    
