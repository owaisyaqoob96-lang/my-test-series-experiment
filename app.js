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
  serverTimestamp, deleteDoc, doc, updateDoc, query, where, writeBatch,
  getDoc, runTransaction, setDoc, deleteField
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import {
  MASHQ_PALETTES,
  DEFAULT_PALETTE_ID,
  getPaletteById,
  getActivePalette,
  applyBrandPalette,
  renderAllBrandLogos,
  updateBrandFavicon,
  initSettingsPaletteGrid,
  updateSettingsPaletteActiveState
} from "./branding.js";

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
const views = [
  "view-public-home",
  "view-exam-faa",
  "view-auth",
  "view-verify",
  "view-app",
  "view-test",
  "view-results"
];

export function showView(name) {
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.toggle("hidden", v !== name);
  });
  renderAllBrandLogos();
}

export function updatePublicNavAuthState(user) {
  const signinBtn = document.getElementById("public-nav-signin-btn");
  const ctaBtn = document.getElementById("public-nav-cta-btn");
  if (user && user.emailVerified) {
    if (signinBtn) {
      signinBtn.textContent = "My Dashboard";
      signinBtn.setAttribute("href", "/dashboard");
      signinBtn.setAttribute("data-route", "/dashboard");
    }
    if (ctaBtn) {
      ctaBtn.textContent = "Open Dashboard";
      ctaBtn.setAttribute("href", "/dashboard");
      ctaBtn.setAttribute("data-route", "/dashboard");
    }
  } else {
    if (signinBtn) {
      signinBtn.textContent = "Sign In";
      signinBtn.setAttribute("href", "/login");
      signinBtn.setAttribute("data-route", "/login");
    }
    if (ctaBtn) {
      ctaBtn.textContent = "Get Started";
      ctaBtn.setAttribute("href", "/exams/finance-accounts-assistant");
      ctaBtn.setAttribute("data-route", "/exams/finance-accounts-assistant");
    }
  }
}

export function navigateTo(path, replace = false) {
  if (replace) {
    window.history.replaceState({}, "", path);
  } else {
    window.history.pushState({}, "", path);
  }
  routeUser(auth.currentUser);
  window.scrollTo(0, 0);
}

// ============================================================
// Appearance Design System & Settings Manager
// ============================================================
const APPEARANCE_DEFAULTS = {
  theme: "light",
  paletteId: DEFAULT_PALETTE_ID,
  contrast: "standard",
  uiFont: "system",
  uiSize: "medium",
  testFont: "oxygen",
  testSize: 100 // percent (80% to 150%)
};

const VALID_THEMES = ["light", "dark", "lights-out"];
const VALID_CONTRASTS = ["standard", "more"];
const VALID_UI_FONTS = ["system", "inter", "oxygen", "arial", "times"];
const VALID_UI_SIZES = ["small", "medium", "large"];
const VALID_TEST_FONTS = ["times", "oxygen", "inter", "system", "arial"];

let appearanceState = { ...APPEARANCE_DEFAULTS };

function parseStoredTestSize(val) {
  if (!val) return APPEARANCE_DEFAULTS.testSize;
  const num = parseInt(val, 10);
  if (isNaN(num)) return APPEARANCE_DEFAULTS.testSize;
  if (num >= 12 && num <= 24) {
    return Math.round((num / 16) * 100);
  }
  return Math.min(150, Math.max(80, num));
}

function loadAppearanceSettings() {
  try {
    const storedTheme = localStorage.getItem("ts_theme") || localStorage.getItem("ts-theme");
    const storedPalId = localStorage.getItem("ts_palette_id") || DEFAULT_PALETTE_ID;
    const storedContrast = localStorage.getItem("ts_contrast");
    const storedUiFont = localStorage.getItem("ts_ui_font");
    const storedUiSize = localStorage.getItem("ts_ui_size");
    const storedTestFont = localStorage.getItem("ts_test_font");
    const storedTestSize = localStorage.getItem("ts_test_size");

    appearanceState.theme = VALID_THEMES.includes(storedTheme) ? storedTheme : APPEARANCE_DEFAULTS.theme;
    appearanceState.paletteId = parseInt(storedPalId, 10) || DEFAULT_PALETTE_ID;
    appearanceState.contrast = VALID_CONTRASTS.includes(storedContrast) ? storedContrast : APPEARANCE_DEFAULTS.contrast;
    appearanceState.uiFont = VALID_UI_FONTS.includes(storedUiFont) ? storedUiFont : APPEARANCE_DEFAULTS.uiFont;
    appearanceState.uiSize = VALID_UI_SIZES.includes(storedUiSize) ? storedUiSize : APPEARANCE_DEFAULTS.uiSize;
    appearanceState.testFont = VALID_TEST_FONTS.includes(storedTestFont) ? storedTestFont : APPEARANCE_DEFAULTS.testFont;
    appearanceState.testSize = parseStoredTestSize(storedTestSize);
  } catch (e) {
    console.warn("Could not read appearance settings from localStorage", e);
  }
  applyBrandPalette(appearanceState.paletteId);
  applyAllAppearanceSettings();
  renderSettingsControls();
  renderAllBrandLogos();
}

function applyAllAppearanceSettings() {
  const root = document.documentElement;
  root.setAttribute("data-theme", appearanceState.theme);
  root.setAttribute("data-palette-id", String(appearanceState.paletteId));
  root.setAttribute("data-contrast", appearanceState.contrast);
  root.setAttribute("data-ui-font", appearanceState.uiFont);
  root.setAttribute("data-ui-size", appearanceState.uiSize);
  root.setAttribute("data-test-font", appearanceState.testFont);

  const pxSize = Math.round(16 * (appearanceState.testSize / 100));
  root.style.setProperty("--test-font-size", `${pxSize}px`);

  updateTestSizeDisplays();
}

function updateTestSizeDisplays() {
  const text = `${appearanceState.testSize}%`;
  const liveIndicator = document.getElementById("test-font-size-indicator");
  const modalIndicator = document.getElementById("settings-test-font-indicator");
  if (liveIndicator) liveIndicator.textContent = text;
  if (modalIndicator) modalIndicator.textContent = text;
}

function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) return;
  appearanceState.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("ts_theme", theme);
    localStorage.setItem("ts-theme", theme);
  } catch (e) {}
  const activePal = getActivePalette();
  applyBrandPalette(activePal.id);
  renderSettingsControls();
}

function setContrast(contrast) {
  if (!VALID_CONTRASTS.includes(contrast)) return;
  appearanceState.contrast = contrast;
  document.documentElement.setAttribute("data-contrast", contrast);
  try { localStorage.setItem("ts_contrast", contrast); } catch (e) {}
  renderSettingsControls();
}

function setUiFont(font) {
  if (!VALID_UI_FONTS.includes(font)) return;
  appearanceState.uiFont = font;
  document.documentElement.setAttribute("data-ui-font", font);
  try { localStorage.setItem("ts_ui_font", font); } catch (e) {}
  renderSettingsControls();
}

function setUiSize(size) {
  if (!VALID_UI_SIZES.includes(size)) return;
  appearanceState.uiSize = size;
  document.documentElement.setAttribute("data-ui-size", size);
  try { localStorage.setItem("ts_ui_size", size); } catch (e) {}
  renderSettingsControls();
}

function setTestFont(font) {
  if (!VALID_TEST_FONTS.includes(font)) return;
  appearanceState.testFont = font;
  document.documentElement.setAttribute("data-test-font", font);
  try { localStorage.setItem("ts_test_font", font); } catch (e) {}
  renderSettingsControls();
}

function adjustTestSize(delta) {
  const newSize = Math.min(150, Math.max(80, appearanceState.testSize + delta));
  appearanceState.testSize = newSize;
  const pxSize = Math.round(16 * (newSize / 100));
  document.documentElement.style.setProperty("--test-font-size", `${pxSize}px`);
  try { localStorage.setItem("ts_test_size", String(newSize)); } catch (e) {}
  updateTestSizeDisplays();
}

function resetTestSize() {
  appearanceState.testSize = 100;
  document.documentElement.style.setProperty("--test-font-size", "16px");
  try { localStorage.setItem("ts_test_size", "100"); } catch (e) {}
  updateTestSizeDisplays();
}

function renderSettingsControls() {
  document.querySelectorAll(".theme-tile").forEach(tile => {
    const val = tile.getAttribute("data-theme-val");
    tile.classList.toggle("active", val === appearanceState.theme);
  });

  updateSettingsPaletteActiveState(appearanceState.paletteId);

  document.querySelectorAll("#contrast-segmented .segmented-btn").forEach(btn => {
    const val = btn.getAttribute("data-contrast-val");
    btn.classList.toggle("active", val === appearanceState.contrast);
  });

  const uiFontSelect = document.getElementById("ui-font-select");
  if (uiFontSelect && uiFontSelect.value !== appearanceState.uiFont) {
    uiFontSelect.value = appearanceState.uiFont;
  }

  document.querySelectorAll("#ui-size-segmented .segmented-btn").forEach(btn => {
    const val = btn.getAttribute("data-ui-size-val");
    btn.classList.toggle("active", val === appearanceState.uiSize);
  });

  const settingsTestFont = document.getElementById("settings-test-font-select");
  if (settingsTestFont && settingsTestFont.value !== appearanceState.testFont) {
    settingsTestFont.value = appearanceState.testFont;
  }

  const headerTestFont = document.getElementById("test-font-family-select");
  if (headerTestFont && headerTestFont.value !== appearanceState.testFont) {
    headerTestFont.value = appearanceState.testFont;
  }

  updateTestSizeDisplays();
}

function openSettingsModal() {
  renderSettingsControls();
  initSettingsPaletteGrid();
  const modal = document.getElementById("settings-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.classList.add("hidden");
}

// App Sidebar State & Management
function toggleSidebar() {
  const sidebar = document.getElementById("app-sidebar");
  const backdrop = document.getElementById("app-sidebar-backdrop");
  if (!sidebar) return;

  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const isOpen = sidebar.classList.toggle("open");
    if (backdrop) backdrop.classList.toggle("hidden", !isOpen);
  } else {
    const isCollapsed = sidebar.classList.toggle("collapsed");
    try {
      localStorage.setItem("ts_sidebar_collapsed", isCollapsed ? "true" : "false");
    } catch (e) {}
  }
}

function closeSidebarMobile() {
  const sidebar = document.getElementById("app-sidebar");
  const backdrop = document.getElementById("app-sidebar-backdrop");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.add("hidden");
}

function initSidebarState() {
  const sidebar = document.getElementById("app-sidebar");
  if (!sidebar) return;
  const isMobile = window.innerWidth <= 768;
  if (!isMobile) {
    try {
      const savedCollapsed = localStorage.getItem("ts_sidebar_collapsed");
      if (savedCollapsed === "true") {
        sidebar.classList.add("collapsed");
      }
    } catch (e) {}
  }
}

// Wire Settings & Sidebar Event Listeners
function setupAppearanceAndSidebarListeners() {
  initSettingsPaletteGrid();

  const topbarSettingsBtn = document.getElementById("topbar-settings-btn");
  if (topbarSettingsBtn) {
    topbarSettingsBtn.addEventListener("click", openSettingsModal);
  }

  const navSettingsBtn = document.getElementById("nav-item-settings");
  if (navSettingsBtn) {
    navSettingsBtn.addEventListener("click", () => {
      closeSidebarMobile();
      openSettingsModal();
    });
  }

  const settingsModalClose = document.getElementById("settings-modal-close");
  if (settingsModalClose) {
    settingsModalClose.addEventListener("click", closeSettingsModal);
  }
  const settingsModal = document.getElementById("settings-modal");
  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }

  document.querySelectorAll(".theme-tile").forEach(tile => {
    tile.addEventListener("click", () => {
      const val = tile.getAttribute("data-theme-val");
      if (val) setTheme(val);
    });
  });

  document.querySelectorAll("#contrast-segmented .segmented-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.getAttribute("data-contrast-val");
      if (val) setContrast(val);
    });
  });

  const uiFontSelect = document.getElementById("ui-font-select");
  if (uiFontSelect) {
    uiFontSelect.addEventListener("change", (e) => setUiFont(e.target.value));
  }

  document.querySelectorAll("#ui-size-segmented .segmented-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.getAttribute("data-ui-size-val");
      if (val) setUiSize(val);
    });
  });

  const settingsTestFont = document.getElementById("settings-test-font-select");
  if (settingsTestFont) {
    settingsTestFont.addEventListener("change", (e) => setTestFont(e.target.value));
  }
  const settingsTestDec = document.getElementById("settings-test-font-dec");
  if (settingsTestDec) {
    settingsTestDec.addEventListener("click", () => adjustTestSize(-10));
  }
  const settingsTestInc = document.getElementById("settings-test-font-inc");
  if (settingsTestInc) {
    settingsTestInc.addEventListener("click", () => adjustTestSize(10));
  }
  const settingsTestReset = document.getElementById("settings-test-font-reset");
  if (settingsTestReset) {
    settingsTestReset.addEventListener("click", resetTestSize);
  }

  const headerTestFont = document.getElementById("test-font-family-select");
  if (headerTestFont) {
    headerTestFont.addEventListener("change", (e) => setTestFont(e.target.value));
  }
  const headerTestDec = document.getElementById("btn-test-font-decrease");
  if (headerTestDec) {
    headerTestDec.addEventListener("click", () => adjustTestSize(-10));
  }
  const headerTestInc = document.getElementById("btn-test-font-increase");
  if (headerTestInc) {
    headerTestInc.addEventListener("click", () => adjustTestSize(10));
  }
  const headerTestReset = document.getElementById("btn-test-font-reset");
  if (headerTestReset) {
    headerTestReset.addEventListener("click", resetTestSize);
  }

  const sidebarToggle = document.getElementById("app-sidebar-toggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", toggleSidebar);
  }
  const sidebarClose = document.getElementById("app-sidebar-close-btn");
  if (sidebarClose) {
    sidebarClose.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        closeSidebarMobile();
      } else {
        toggleSidebar();
      }
    });
  }
  const sidebarBackdrop = document.getElementById("app-sidebar-backdrop");
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebarMobile);
  }

  const navDashboard = document.getElementById("nav-item-dashboard");
  if (navDashboard) {
    navDashboard.addEventListener("click", () => {
      closeSidebarMobile();
      navigateTo("/dashboard");
    });
  }
  const navProfile = document.getElementById("nav-item-profile");
  if (navProfile) {
    navProfile.addEventListener("click", () => {
      closeSidebarMobile();
      if (typeof openProfileModal === "function") openProfileModal(false);
    });
  }
  const sidebarUser = document.getElementById("app-sidebar-user");
  if (sidebarUser) {
    sidebarUser.addEventListener("click", () => {
      closeSidebarMobile();
      if (typeof openProfileModal === "function") openProfileModal(false);
    });
  }
  const sidebarSignout = document.getElementById("sidebar-signout-btn");
  if (sidebarSignout) {
    sidebarSignout.addEventListener("click", () => signOut(auth));
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const settingsModal = document.getElementById("settings-modal");
      if (settingsModal && !settingsModal.classList.contains("hidden")) {
        closeSettingsModal();
        return;
      }
      const profileModal = document.getElementById("profile-modal");
      if (profileModal && !profileModal.classList.contains("hidden")) {
        profileModal.classList.add("hidden");
        return;
      }
      closeSidebarMobile();
    }
  });

  const legacyToggle = document.getElementById("theme-toggle");
  if (legacyToggle) {
    legacyToggle.addEventListener("click", () => {
      const next = appearanceState.theme === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }
}

// Run appearance and sidebar initialization
loadAppearanceSettings();
initSidebarState();
setupAppearanceAndSidebarListeners();

// Initialize Public Homepage, Mobile Menu & Demo Pricing Listeners
(function initPublicPageListeners() {
  const hamburgerBtn = document.getElementById("public-hamburger-toggle");
  const mobileDrawer = document.getElementById("public-mobile-drawer");
  if (hamburgerBtn && mobileDrawer) {
    hamburgerBtn.addEventListener("click", () => {
      mobileDrawer.classList.toggle("hidden");
    });
  }

  // Demo pricing action button
  const demoButtons = document.querySelectorAll("#public-pricing-enroll-btn, .demo-pricing-action, #pricing-enroll-btn");
  demoButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (auth.currentUser && auth.currentUser.emailVerified) {
        alert("This is an illustrative $99 course demo card. In this evaluation prototype, all mock tests and AI features are free! Returning to your dashboard.");
        navigateTo("/dashboard");
      } else {
        alert("This is an illustrative $99 course demo card. In this evaluation prototype, all test series and AI features are free! Please sign in or create an account to begin.");
        navigateTo("/login");
      }
    });
  });

  // Global SPA Link Interceptor
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    const dataRoute = link.getAttribute("data-route");
    const target = dataRoute || href;
    if (!target) return;

    // Smooth scroll for hash links
    if (target.startsWith("#")) {
      const targetEl = document.querySelector(target);
      if (targetEl) {
        e.preventDefault();
        const homeView = document.getElementById("view-public-home");
        const faaView = document.getElementById("view-exam-faa");
        if (homeView && faaView && homeView.classList.contains("hidden") && faaView.classList.contains("hidden")) {
          navigateTo("/", false);
        }
        targetEl.scrollIntoView({ behavior: "smooth" });
        if (mobileDrawer) mobileDrawer.classList.add("hidden");
      }
      return;
    }

    // Clean SPA routes
    if (
      target === "/" ||
      target === "/login" ||
      target === "/dashboard" ||
      target === "/exams/finance-accounts-assistant" ||
      target.startsWith("/exams/")
    ) {
      e.preventDefault();
      navigateTo(target);
      if (mobileDrawer) mobileDrawer.classList.add("hidden");
    }
  });

  window.addEventListener("popstate", () => {
    routeUser(auth.currentUser);
  });
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

let currentUserProfile = null;

function renderUserIdentity() {
  const whoamiEl = document.getElementById("whoami");
  const sidebarName = document.getElementById("sidebar-user-name");
  const sidebarMeta = document.getElementById("sidebar-user-meta");
  const sidebarAvatar = document.getElementById("sidebar-user-avatar");

  if (currentUserProfile && currentUserProfile.fullName && currentUserProfile.username) {
    if (whoamiEl) whoamiEl.textContent = `${currentUserProfile.fullName} (@${currentUserProfile.username})`;
    if (sidebarName) sidebarName.textContent = currentUserProfile.fullName;
    if (sidebarMeta) sidebarMeta.textContent = `@${currentUserProfile.username}`;
    if (sidebarAvatar) {
      if (currentUserProfile.photoURL) {
        sidebarAvatar.innerHTML = `<img src="${currentUserProfile.photoURL}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      } else {
        sidebarAvatar.textContent = (currentUserProfile.fullName[0] || "👤").toUpperCase();
      }
    }
  } else if (auth.currentUser) {
    const emailPrefix = (auth.currentUser.email || "Student").split("@")[0];
    if (whoamiEl) whoamiEl.textContent = auth.currentUser.email;
    if (sidebarName) sidebarName.textContent = emailPrefix;
    if (sidebarMeta) sidebarMeta.textContent = auth.currentUser.email;
    if (sidebarAvatar) sidebarAvatar.textContent = (emailPrefix[0] || "👤").toUpperCase();
  } else {
    if (whoamiEl) whoamiEl.textContent = "";
    if (sidebarName) sidebarName.textContent = "Student Profile";
    if (sidebarMeta) sidebarMeta.textContent = "Set up profile";
    if (sidebarAvatar) sidebarAvatar.textContent = "👤";
  }
}

async function loadUserProfile(user) {
  if (!user) {
    currentUserProfile = null;
    renderUserIdentity();
    renderMyExams();
    return;
  }
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      currentUserProfile = snap.data();
      renderUserIdentity();
      renderMyExams();
    } else {
      currentUserProfile = null;
      renderUserIdentity();
      renderMyExams();
      // Prompt user to complete their profile setup if they do not have one yet
      openProfileModal(true);
    }
  } catch (err) {
    console.error("Error loading user profile:", err);
    renderUserIdentity();
    renderMyExams();
  }
}

async function routeUser(user) {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  updatePublicNavAuthState(user);

  if (user && user.emailVerified) {
    renderUserIdentity();
    
    // Show admin panel if admin
    const isAdmin = user.uid === ADMIN_UID;
    const adminTile = document.getElementById("admin-dashboard-tile");
    if (adminTile) {
      if (isAdmin) adminTile.classList.remove("hidden");
      else adminTile.classList.add("hidden");
    }

    await loadUserProfile(user);

    if (path === "/login") {
      navigateTo("/dashboard", true);
    } else if (path === "/dashboard") {
      showView("view-app");
      loadSubjects();
    } else if (path === "/test") {
      if (isTestActive) {
        showView("view-test");
      } else {
        navigateTo("/dashboard", true);
      }
    } else if (path === "/results") {
      showView("view-results");
    } else if (path === "/exams/finance-accounts-assistant" || path.startsWith("/exams/")) {
      showView("view-exam-faa");
    } else {
      showView("view-public-home");
    }
  } else if (user && !user.emailVerified) {
    currentUserProfile = null;
    renderUserIdentity();
    document.getElementById("verify-email-text").textContent = user.email;
    document.getElementById("verify-error").textContent = "";
    showView("view-verify");
  } else {
    currentUserProfile = null;
    userPausedTests = {};
    renderUserIdentity();
    renderAuthMode();
    if (pendingNotice) showAuthNotice(pendingNotice.ok, pendingNotice.text);

    if (path === "/dashboard") {
      navigateTo("/login", true);
    } else if (path === "/login") {
      showView("view-auth");
    } else if (path === "/exams/finance-accounts-assistant" || path.startsWith("/exams/")) {
      showView("view-exam-faa");
    } else if (path === "/test" || path === "/results") {
      navigateTo("/login", true);
    } else {
      showView("view-public-home");
    }
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

// Immediate routing based on URL path on script load
routeUser(auth.currentUser);

onAuthStateChanged(auth, async () => {
  await actionReady;
  await routeUser(auth.currentUser);
});

// ============================================================
// Central Exam Configuration (Batch 2)
// ============================================================
export const EXAMS_CONFIG = [
  { id: "jkssb_faa", name: "JKSSB Finance Accounts Assistant", shortName: "JKSSB FAA" },
  { id: "jkssb_si", name: "JKSSB Sub-Inspector", shortName: "JKSSB SI" },
  { id: "jk_bank_po", name: "J&K Bank PO", shortName: "J&K Bank PO" },
  { id: "ibps_po", name: "IBPS PO", shortName: "IBPS PO" },
  { id: "upsc_cse", name: "UPSC Civil Services Examination", shortName: "UPSC CSE" },
  { id: "jkpsc_cce", name: "JKPSC Combined Competitive Examination", shortName: "JKPSC CCE" }
];

export const VALID_EXAM_IDS = EXAMS_CONFIG.map(e => e.id);
export const EXAMS_MAP = Object.fromEntries(EXAMS_CONFIG.map(e => [e.id, e]));

let selectedExamFilter = null; // null means All Tests

function renderExamSelectOptions() {
  const newSelect = document.getElementById("new-exam-id");
  const editSelect = document.getElementById("edit-exam-id");
  const optionsHtml = '<option value="">None / General</option>' + 
    EXAMS_CONFIG.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
  if (newSelect) {
    const prev = newSelect.value;
    newSelect.innerHTML = optionsHtml;
    if (prev) newSelect.value = prev;
  }
  if (editSelect) {
    const prev = editSelect.value;
    editSelect.innerHTML = optionsHtml;
    if (prev) editSelect.value = prev;
  }
}

function renderMyExams() {
  const chipsContainer = document.getElementById("my-exams-chips");
  if (!chipsContainer) return;

  const targetExams = (currentUserProfile && Array.isArray(currentUserProfile.targetExams))
    ? currentUserProfile.targetExams
    : [];

  if (targetExams.length === 0) {
    selectedExamFilter = null;
    chipsContainer.innerHTML = `
      <div class="empty-exams-notice">
        No target exams selected yet. Update your profile to choose your exams.
      </div>
    `;
    return;
  }

  // Reset selected filter if user deselected that exam
  if (selectedExamFilter && !targetExams.includes(selectedExamFilter)) {
    selectedExamFilter = null;
  }

  let html = `
    <button type="button" class="exam-chip ${selectedExamFilter === null ? 'active' : ''}" data-exam-id="all">
      All Tests
    </button>
  `;

  targetExams.forEach(examId => {
    const exam = EXAMS_MAP[examId];
    if (exam) {
      const isActive = selectedExamFilter === examId ? 'active' : '';
      html += `
        <button type="button" class="exam-chip ${isActive}" data-exam-id="${exam.id}">
          🎯 ${escapeHtml(exam.shortName || exam.name)}
        </button>
      `;
    }
  });

  chipsContainer.innerHTML = html;

  chipsContainer.querySelectorAll(".exam-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const eid = btn.getAttribute("data-exam-id");
      if (eid === "all") {
        selectedExamFilter = null;
      } else {
        selectedExamFilter = (selectedExamFilter === eid) ? null : eid;
      }
      navSubject = null;
      navType = null;
      renderMyExams();
      renderTestList();
    });
  });
}

const editMyExamsBtn = document.getElementById("edit-my-exams-btn");
if (editMyExamsBtn) {
  editMyExamsBtn.addEventListener("click", () => {
    openProfileModal(false);
  });
}

// ============================================================
// Student Profile Management (Batch 1 & 2)
// ============================================================
const profileModal = document.getElementById("profile-modal");
const profileError = document.getElementById("profile-error");
const profileSaveBtn = document.getElementById("profile-save-btn");
const profileCancelBtn = document.getElementById("profile-cancel-btn");
const profilePhotoInput = document.getElementById("profile-photourl");
const profileAvatarDisplay = document.getElementById("profile-avatar-display");

function updateAvatarPreview(url) {
  if (!profileAvatarDisplay) return;
  profileAvatarDisplay.innerHTML = "";
  const cleanUrl = (url || "").trim();
  if (cleanUrl && (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://") || cleanUrl.startsWith("data:image/"))) {
    const img = document.createElement("img");
    img.src = cleanUrl;
    img.alt = "Avatar";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.onerror = () => {
      if (profileAvatarDisplay) profileAvatarDisplay.textContent = "👤";
    };
    profileAvatarDisplay.appendChild(img);
  } else {
    profileAvatarDisplay.textContent = "👤";
  }
}

if (profilePhotoInput) {
  profilePhotoInput.addEventListener("input", (e) => {
    updateAvatarPreview(e.target.value);
  });
}

function openProfileModal(isFirstTimeSetup = false) {
  if (!profileModal) return;
  profileError.textContent = "";

  const titleEl = document.getElementById("profile-modal-title");
  const subEl = document.getElementById("profile-modal-sub");
  if (isFirstTimeSetup) {
    if (titleEl) titleEl.textContent = "Complete Your Profile";
    if (subEl) subEl.textContent = "Welcome! Please enter your full name and choose a unique username to continue.";
  } else {
    if (titleEl) titleEl.textContent = "Student Profile";
    if (subEl) subEl.textContent = "Manage your student identity and account details.";
  }

  const user = auth.currentUser;
  document.getElementById("profile-email").value = (user && user.email) || "";
  document.getElementById("profile-fullname").value = (currentUserProfile && currentUserProfile.fullName) || "";
  document.getElementById("profile-username").value = (currentUserProfile && currentUserProfile.username) || "";
  document.getElementById("profile-photourl").value = (currentUserProfile && currentUserProfile.photoURL) || "";
  document.getElementById("profile-dob").value = (currentUserProfile && currentUserProfile.dob) || "";
  document.getElementById("profile-gender").value = (currentUserProfile && currentUserProfile.gender) || "";
  document.getElementById("profile-bio").value = (currentUserProfile && currentUserProfile.bio) || "";

  // Render Target Exams Checkboxes
  const targetExamsContainer = document.getElementById("profile-target-exams-container");
  if (targetExamsContainer) {
    const userExams = (currentUserProfile && Array.isArray(currentUserProfile.targetExams)) 
      ? currentUserProfile.targetExams 
      : [];
    targetExamsContainer.innerHTML = EXAMS_CONFIG.map(exam => {
      const isChecked = userExams.includes(exam.id) ? "checked" : "";
      return `
        <label class="target-exam-item">
          <input type="checkbox" class="profile-target-exam-cb" value="${exam.id}" ${isChecked} />
          <span><strong>${escapeHtml(exam.shortName)}</strong><br/><small style="color:var(--text-muted);font-size:11.5px;">${escapeHtml(exam.name)}</small></span>
        </label>
      `;
    }).join("");
  }

  updateAvatarPreview(currentUserProfile ? currentUserProfile.photoURL : "");

  profileModal.classList.remove("hidden");
}

if (profileCancelBtn) {
  profileCancelBtn.addEventListener("click", () => {
    if (profileModal) profileModal.classList.add("hidden");
  });
}

const profileBtn = document.getElementById("profile-btn");
if (profileBtn) {
  profileBtn.addEventListener("click", () => {
    openProfileModal(false);
  });
}

if (profileSaveBtn) {
  profileSaveBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    profileError.textContent = "";

    const rawFullName = document.getElementById("profile-fullname").value.trim();
    const rawUsername = document.getElementById("profile-username").value.trim();
    const photoURL = document.getElementById("profile-photourl").value.trim();
    const dob = document.getElementById("profile-dob").value;
    const gender = document.getElementById("profile-gender").value;
    const bio = document.getElementById("profile-bio").value.trim();

    // Validation
    if (!rawFullName || rawFullName.length < 2) {
      profileError.textContent = "Please enter your full name (at least 2 characters).";
      return;
    }
    if (rawFullName.length > 60) {
      profileError.textContent = "Full name cannot exceed 60 characters.";
      return;
    }

    if (!rawUsername) {
      profileError.textContent = "Please choose a username.";
      return;
    }
    if (rawUsername.length < 3 || rawUsername.length > 25) {
      profileError.textContent = "Username must be between 3 and 25 characters.";
      return;
    }
    const usernameRegex = /^[a-zA-Z0-9_.]+$/;
    if (!usernameRegex.test(rawUsername)) {
      profileError.textContent = "Username can only contain letters, numbers, underscores (_), and periods (.).";
      return;
    }
    if (/^[._]/.test(rawUsername) || /[._]$/.test(rawUsername)) {
      profileError.textContent = "Username cannot start or end with an underscore or period.";
      return;
    }
    if (/\s/.test(rawUsername)) {
      profileError.textContent = "Username cannot contain spaces.";
      return;
    }

    if (bio.length > 200) {
      profileError.textContent = "Bio cannot exceed 200 characters.";
      return;
    }
    if (photoURL) {
      if (photoURL.length > 500) {
        profileError.textContent = "Photo URL cannot exceed 500 characters.";
        return;
      }
      if (!photoURL.startsWith("http://") && !photoURL.startsWith("https://") && !photoURL.startsWith("data:image/")) {
        profileError.textContent = "Photo URL must begin with http://, https://, or data:image/.";
        return;
      }
    }
    const validGenders = ["", "male", "female", "other", "prefer_not_to_say"];
    if (!validGenders.includes(gender)) {
      profileError.textContent = "Please select a valid gender option.";
      return;
    }
    if (dob) {
      const dobDate = new Date(dob);
      const now = new Date();
      if (isNaN(dobDate.getTime()) || dobDate > now) {
        profileError.textContent = "Please select a valid date of birth in the past.";
        return;
      }
    }

    const targetExamCbs = document.querySelectorAll(".profile-target-exam-cb");
    const targetExams = [];
    targetExamCbs.forEach(cb => {
      if (cb.checked && VALID_EXAM_IDS.includes(cb.value)) {
        targetExams.push(cb.value);
      }
    });

    const usernameLower = rawUsername.toLowerCase();

    profileSaveBtn.disabled = true;
    profileSaveBtn.textContent = "Saving...";

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await transaction.get(userRef);
        const existingData = userSnap.exists() ? userSnap.data() : null;
        const oldUsernameLower = existingData ? (existingData.usernameLower || (existingData.username ? existingData.username.toLowerCase() : null)) : null;

        const isUsernameChanging = !oldUsernameLower || oldUsernameLower !== usernameLower;
        const newUsernameRef = doc(db, "usernames", usernameLower);
        const newUsernameSnap = await transaction.get(newUsernameRef);

        if (newUsernameSnap.exists()) {
          const claimedUid = newUsernameSnap.data().uid;
          if (claimedUid !== user.uid) {
            throw new Error(`The username "@${rawUsername}" is already taken. Please choose another.`);
          }
        }

        let oldUsernameRef = null;
        let oldUsernameSnap = null;
        if (isUsernameChanging && oldUsernameLower) {
          oldUsernameRef = doc(db, "usernames", oldUsernameLower);
          oldUsernameSnap = await transaction.get(oldUsernameRef);
        }

        // Writes phase (all reads are done)
        if (oldUsernameRef && oldUsernameSnap && oldUsernameSnap.exists() && oldUsernameSnap.data().uid === user.uid) {
          transaction.delete(oldUsernameRef);
        }

        if (isUsernameChanging || !newUsernameSnap.exists()) {
          transaction.set(newUsernameRef, {
            uid: user.uid,
            updatedAt: serverTimestamp()
          });
        }

        const profilePayload = {
          fullName: rawFullName,
          username: rawUsername,
          usernameLower: usernameLower,
          email: user.email,
          photoURL: photoURL || "",
          dob: dob || "",
          gender: gender || "",
          bio: bio || "",
          targetExams: targetExams,
          updatedAt: serverTimestamp()
        };

        if (!existingData) {
          profilePayload.createdAt = serverTimestamp();
          transaction.set(userRef, profilePayload);
        } else {
          transaction.update(userRef, profilePayload);
        }
      });

      // Reload profile & update topbar
      await loadUserProfile(user);
      if (profileModal) profileModal.classList.add("hidden");
    } catch (err) {
      console.error("Profile save error detailed:", err);
      profileError.textContent = `Save failed: ${err.code || ""} - ${err.message || "Unknown error"}`;
    } finally {
      profileSaveBtn.disabled = false;
      profileSaveBtn.textContent = "Save Profile";
    }
  });
}


// ============================================================
// Dashboard: Folders, Tests & Admin Panel
// ============================================================
let subjectsCache = [];
let navSubject = null; 
let navType = null;    
let userPausedTests = {}; // subjectId -> inProgressDraft

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
      examId: data.examId || "",
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

  // Load in-progress paused tests for the authenticated student from multi-layer storage
  if (auth.currentUser) {
    userPausedTests = {};

    // 1. Check localStorage first (instant local persistence on this machine)
    try {
      const prefix = `ts_paused_${auth.currentUser.uid}_`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          const sid = k.substring(prefix.length);
          try {
            userPausedTests[sid] = JSON.parse(localStorage.getItem(k));
          } catch {}
        }
      }
    } catch (e) {}

    // 2. Check users/{uid} document in Firestore Cloud (cross-device persistent cloud storage)
    try {
      const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (uData && uData.inProgressTests) {
          Object.assign(userPausedTests, uData.inProgressTests);
        }
      }
    } catch (e) {
      console.warn("Could not read inProgressTests from users/{uid}:", e);
    }

    // 3. Check inProgressTests collection if accessible
    try {
      const pausedSnap = await getDocs(collection(db, "inProgressTests", auth.currentUser.uid, "tests"));
      pausedSnap.forEach(d => {
        userPausedTests[d.id] = d.data();
      });
    } catch (e) {}
  } else {
    userPausedTests = {};
  }
  
  renderExamSelectOptions();
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

  const filteredCache = selectedExamFilter
    ? subjectsCache.filter(s => s.examId === selectedExamFilter)
    : subjectsCache;

  const filterBadgeHtml = selectedExamFilter && EXAMS_MAP[selectedExamFilter]
    ? ` &nbsp;<span style="font-size:12px;color:var(--primary);font-weight:normal;">[${escapeHtml(EXAMS_MAP[selectedExamFilter].shortName || EXAMS_MAP[selectedExamFilter].name)}]</span>`
    : "";

  if (!navSubject) {
    breadcrumb.innerHTML = `📁 All Exams${filterBadgeHtml}`;
    const uniqueSubjects = [...new Set(filteredCache.map(s => s.subject))];
    
    if (uniqueSubjects.length === 0) {
      const emptyMsg = selectedExamFilter
        ? "No tests available yet for this target exam."
        : "No tests created yet.";
      listEl.innerHTML = `<div class="test-row-empty">${emptyMsg}</div>`;
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
    breadcrumb.innerHTML = `<span class="breadcrumb-link" onclick="goHomeFolder()">📁 All Exams</span>${filterBadgeHtml} > ${escapeHtml(navSubject)}`;
    const uniqueTypes = [...new Set(filteredCache.filter(s => s.subject === navSubject).map(s => s.type))];
    
    if (uniqueTypes.length === 0) {
      listEl.innerHTML = `<div class="test-row-empty">No categories found in this subject for this exam.</div>`;
      return;
    }

    uniqueTypes.forEach(typ => {
      const el = document.createElement("div");
      el.className = "folder-card";
      el.onclick = () => openType(typ);
      el.innerHTML = `${folderIconSvg}<h3 style="margin:0;">${escapeHtml(typ)}</h3>`;
      listEl.appendChild(el);
    });
  } 
  else {
    breadcrumb.innerHTML = `<span class="breadcrumb-link" onclick="goHomeFolder()">📁 All Exams</span>${filterBadgeHtml} > <span class="breadcrumb-link" onclick="goSubjectFolder()">${escapeHtml(navSubject)}</span> > ${escapeHtml(navType)}`;
    
    const tests = filteredCache
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

      const pausedDraft = userPausedTests[t.id];
      const isPaused = !!pausedDraft;

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
      let attemptBadge = lastAttempt
        ? `<div class="test-row-meta" style="color:var(--success);margin-top:4px;">Attempted · last score ${pct}%</div>`
        : "";

      if (isPaused) {
        const remSec = pausedDraft.remainingSeconds || 0;
        const mm = String(Math.floor(remSec / 60)).padStart(2, "0");
        const ss = String(remSec % 60).padStart(2, "0");
        const ansCount = Object.keys(pausedDraft.answers || {}).length;
        const totalQ = (pausedDraft.questionIds || []).length || t.questionCount || 0;
        attemptBadge = `<div class="paused-badge">⏸️ In Progress · ${mm}:${ss} left (${ansCount}/${totalQ} answered)</div>`;
      }

      let startLabel = hasQuestions ? (lastAttempt ? "Retake test" : "Start test") : "No questions yet";
      let startBtnStyle = "";
      if (isPaused) {
        startLabel = "▶️ Resume test";
        startBtnStyle = "background-color: var(--accent); color: white; border-color: var(--accent);";
      }

      const discardBtn = isPaused
        ? `<button class="btn btn-quiet btn-sm discard-draft-btn" style="color:var(--danger);font-size:12px;" data-subject-id="${t.id}" title="Discard paused attempt and start fresh">Discard</button>`
        : "";

      const dragHandle = isAdmin ? `<span class="drag-handle" title="Drag to reorder">⠿</span>` : "";

      const examBadge = t.examId && EXAMS_MAP[t.examId]
        ? `<span class="badge" style="background:var(--surface-raised);border:1px solid var(--line-strong);color:var(--accent-strong);font-size:11px;padding:2px 7px;border-radius:12px;margin-left:6px;font-weight:500;">🎯 ${escapeHtml(EXAMS_MAP[t.examId].shortName || EXAMS_MAP[t.examId].name)}</span>`
        : "";

      row.innerHTML = `
        <div class="test-row-info" style="display:flex;align-items:flex-start;gap:10px;">
          ${dragHandle}
          <div>
            <h3>${escapeHtml(t.testName)}${examBadge}</h3>
            <div class="test-row-meta">${t.questionCount || 0} questions · ${t.durationMinutes || 30} min</div>
            ${attemptBadge}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap:4px;">
          <button class="btn btn-primary btn-sm start-btn" style="${startBtnStyle}" ${hasQuestions ? "" : "disabled"} data-subject-id="${t.id}" data-is-paused="${isPaused}">
            ${startLabel}
          </button>
          ${discardBtn}
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

    listEl.querySelectorAll(".discard-draft-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        discardPausedTest(btn.getAttribute("data-subject-id"), false);
      });
    });

    listEl.querySelectorAll(".start-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const sid = btn.getAttribute("data-subject-id");
        const isP = btn.getAttribute("data-is-paused") === "true";
        if (isP) {
          openResumeConfirmModal(sid);
        } else {
          startTest(sid);
        }
      });
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
    ).join("");
  }
}

// ---------------- ADMIN: Create Test Container ----------------
document.getElementById("create-subject-btn").addEventListener("click", async () => {
  const subjectInput = document.getElementById("new-subject").value.trim() || "General";
  const typeInput = document.getElementById("new-type").value || "Miscellaneous";
  const testNameInput = document.getElementById("new-test-name").value.trim() || "Untitled Test";
  const durationInput = parseInt(document.getElementById("new-duration").value, 10) || 30;
  const examIdInput = document.getElementById("new-exam-id") ? document.getElementById("new-exam-id").value : "";

  const btn = document.getElementById("create-subject-btn");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    await addDoc(collection(db, "subjects"), { 
      subject: subjectInput,
      type: typeInput,
      testName: testNameInput,
      durationMinutes: durationInput, 
      examId: examIdInput || "",
      order: Date.now(),
      createdAt: serverTimestamp() 
    });
    
    document.getElementById("new-subject").value = "";
    document.getElementById("new-test-name").value = "";
    document.getElementById("new-duration").value = "";
    if (document.getElementById("new-exam-id")) document.getElementById("new-exam-id").value = "";
    
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

async function openEditModal(testId) {
  const test = subjectsCache.find(s => s.id === testId);
  if(!test) return;
  
  document.getElementById("edit-test-id").value = test.id;
  document.getElementById("edit-subject").value = test.subject || "";
  document.getElementById("edit-type").value = test.type || "Miscellaneous";
  document.getElementById("edit-test-name").value = test.testName || "";
  document.getElementById("edit-duration").value = test.durationMinutes || 30;
  if (document.getElementById("edit-exam-id")) {
    document.getElementById("edit-exam-id").value = test.examId || "";
  }
  
  editModal.classList.remove("hidden");
  await renderEditQuestionsList(testId);
}

async function renderEditQuestionsList(testId) {
  const listEl = document.getElementById("edit-questions-list");
  const countEl = document.getElementById("edit-q-count");
  listEl.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">Loading\u2026</div>';

  const snap = await getDocs(collection(db, "subjects", testId, "questions"));
  const qs = [];
  snap.forEach(d => qs.push({ id: d.id, ...d.data() }));

  if (countEl) countEl.textContent = "(" + qs.length + ")";

  if (qs.length === 0) {
    listEl.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">No questions yet. Use \u201cAdd New Question\u201d below.</div>';
    return;
  }

  // Build HTML with empty inputs; values are set programmatically below for XSS safety
  listEl.innerHTML = qs.map((q, i) => {
    const correctIdx = q.correctIndex != null ? q.correctIndex : 0;
    let selectHtml = "";
    for (let oi = 0; oi < 4; oi++) {
      selectHtml += '<option value="' + oi + '"' + (oi === correctIdx ? ' selected' : '') + '>' + String.fromCharCode(65 + oi) + '</option>';
    }
    return '<details class="eq-card" data-qid="' + q.id + '">' +
      '<summary>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">Q' + (i + 1) + '. ' + escapeHtml(q.text) + '</span>' +
        '<span style="flex-shrink:0;font-size:12px;color:var(--text-faint);">click to edit</span>' +
      '</summary>' +
      '<div class="eq-body">' +
        '<div class="field"><label>Question Text</label>' +
          '<textarea class="eq-text"></textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div class="field"><label>Option A</label><input type="text" class="eq-opt" data-idx="0" /></div>' +
          '<div class="field"><label>Option B</label><input type="text" class="eq-opt" data-idx="1" /></div>' +
          '<div class="field"><label>Option C</label><input type="text" class="eq-opt" data-idx="2" /></div>' +
          '<div class="field"><label>Option D</label><input type="text" class="eq-opt" data-idx="3" /></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div class="field"><label>Correct Answer</label>' +
            '<select class="eq-correct" style="width:100%;">' + selectHtml + '</select></div>' +
          '<div class="field"><label>Topic (optional)</label><input type="text" class="eq-topic" /></div>' +
        '</div>' +
        '<div class="field"><label>Explanation (optional)</label>' +
          '<textarea class="eq-explanation"></textarea></div>' +
        '<div class="eq-actions">' +
          '<button class="btn btn-primary btn-sm eq-save-btn">Save Question</button>' +
          '<button class="btn btn-sm eq-delete-btn" style="background-color:var(--danger);color:white;border:none;">Delete Question</button>' +
          '<span class="eq-status" style="font-size:13px;"></span>' +
        '</div>' +
      '</div>' +
    '</details>';
  }).join("");

  // Populate field values programmatically (safe against XSS in attribute values)
  const cards = listEl.querySelectorAll(".eq-card");
  qs.forEach((q, i) => {
    const card = cards[i];
    card.querySelector(".eq-text").value = q.text || "";
    const optInputs = card.querySelectorAll(".eq-opt");
    (q.options || []).forEach((opt, oi) => { if (optInputs[oi]) optInputs[oi].value = opt; });
    card.querySelector(".eq-topic").value = q.topic || "";
    card.querySelector(".eq-explanation").value = q.explanation || "";
  });

  // Attach per-question Save and Delete handlers
  cards.forEach(card => {
    const saveBtn = card.querySelector(".eq-save-btn");
    saveBtn.addEventListener("click", async () => {
      const qId = card.getAttribute("data-qid");
      const statusEl = card.querySelector(".eq-status");
      const text = card.querySelector(".eq-text").value.trim();
      const optInputs = card.querySelectorAll(".eq-opt");
      const allOpts = [...optInputs].map(inp => inp.value.trim());
      const nonEmptyOpts = allOpts.filter(o => o);
      const correctIndex = parseInt(card.querySelector(".eq-correct").value, 10);
      const topic = card.querySelector(".eq-topic").value.trim();
      const explanation = card.querySelector(".eq-explanation").value.trim();

      if (!text) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "Question text is required."; return; }
      if (nonEmptyOpts.length < 2) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "At least 2 options are required."; return; }
      let seenEmpty = false;
      for (let oi = 0; oi < 4; oi++) {
        if (!allOpts[oi]) seenEmpty = true;
        else if (seenEmpty) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "Fill options from A onwards without gaps."; return; }
      }
      if (correctIndex >= nonEmptyOpts.length) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "Correct answer exceeds the number of options."; return; }

      saveBtn.disabled = true;
      statusEl.style.color = "var(--text-muted)";
      statusEl.textContent = "Saving\u2026";
      try {
        const updateData = { text, options: nonEmptyOpts, correctIndex, topic: topic || "", explanation: explanation || "" };
        await updateDoc(doc(db, "subjects", testId, "questions", qId), updateData);
        statusEl.style.color = "var(--success)";
        statusEl.textContent = "Saved!";
        const summarySpan = card.querySelector("summary span:first-child");
        if (summarySpan) {
          const idx = [...cards].indexOf(card);
          summarySpan.innerHTML = "Q" + (idx + 1) + ". " + escapeHtml(text);
        }
        setTimeout(() => { statusEl.textContent = ""; }, 2000);
      } catch (e) {
        statusEl.style.color = "var(--danger)";
        statusEl.textContent = "Error: " + e.message;
      } finally { saveBtn.disabled = false; }
    });

    const delBtn = card.querySelector(".eq-delete-btn");
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this question? This cannot be undone.")) return;
      const qId = card.getAttribute("data-qid");
      delBtn.disabled = true;
      delBtn.textContent = "Deleting\u2026";
      try {
        await deleteDoc(doc(db, "subjects", testId, "questions", qId));
        await renderEditQuestionsList(testId);
      } catch (e) {
        alert("Couldn't delete. Please try again.");
        delBtn.disabled = false;
        delBtn.textContent = "Delete Question";
      }
    });
  });
}

document.getElementById("cancel-edit-btn").addEventListener("click", () => {
  editModal.classList.add("hidden");
  loadSubjects();
});

document.getElementById("save-edit-btn").addEventListener("click", async () => {
  const id = document.getElementById("edit-test-id").value;
  const newSubject = document.getElementById("edit-subject").value.trim() || "General";
  const newType = document.getElementById("edit-type").value || "Miscellaneous";
  const newTestName = document.getElementById("edit-test-name").value.trim() || "Untitled Test";
  const newDuration = parseInt(document.getElementById("edit-duration").value, 10) || 30;
  const newExamId = document.getElementById("edit-exam-id") ? document.getElementById("edit-exam-id").value : "";
  
  const btn = document.getElementById("save-edit-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  
  try {
    await updateDoc(doc(db, "subjects", id), {
      subject: newSubject,
      type: newType,
      testName: newTestName,
      name: newTestName, 
      durationMinutes: newDuration,
      examId: newExamId || ""
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

// ---------------- ADMIN: Add Question Handler ----------------
document.getElementById("add-q-btn").addEventListener("click", async () => {
  const testId = document.getElementById("edit-test-id").value;
  const statusEl = document.getElementById("add-q-status");
  const addBtn = document.getElementById("add-q-btn");
  const text = document.getElementById("add-q-text").value.trim();
  const allOpts = [
    document.getElementById("add-q-optA").value.trim(),
    document.getElementById("add-q-optB").value.trim(),
    document.getElementById("add-q-optC").value.trim(),
    document.getElementById("add-q-optD").value.trim()
  ];
  const nonEmptyOpts = allOpts.filter(o => o);
  const correctIndex = parseInt(document.getElementById("add-q-correct").value, 10);
  const topic = document.getElementById("add-q-topic").value.trim();
  const explanation = document.getElementById("add-q-explanation").value.trim();

  // Validation
  if (!testId) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "No test selected."; return; }
  if (!text) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "Question text is required."; return; }
  if (nonEmptyOpts.length < 2) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "At least 2 options are required."; return; }
  let seenEmpty = false;
  for (let oi = 0; oi < 4; oi++) {
    if (!allOpts[oi]) seenEmpty = true;
    else if (seenEmpty) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "Fill options from A onwards without gaps."; return; }
  }
  if (correctIndex >= nonEmptyOpts.length) { statusEl.style.color = "var(--danger)"; statusEl.textContent = "Correct answer exceeds the number of options."; return; }

  addBtn.disabled = true;
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "Adding\u2026";

  try {
    const qData = { text, options: nonEmptyOpts, correctIndex, createdAt: serverTimestamp() };
    if (topic) qData.topic = topic;
    if (explanation) qData.explanation = explanation;

    await addDoc(collection(db, "subjects", testId, "questions"), qData);

    // Clear the form
    document.getElementById("add-q-text").value = "";
    document.getElementById("add-q-optA").value = "";
    document.getElementById("add-q-optB").value = "";
    document.getElementById("add-q-optC").value = "";
    document.getElementById("add-q-optD").value = "";
    document.getElementById("add-q-correct").value = "0";
    document.getElementById("add-q-topic").value = "";
    document.getElementById("add-q-explanation").value = "";

    statusEl.style.color = "var(--success)";
    statusEl.textContent = "Question added!";
    setTimeout(() => { statusEl.textContent = ""; }, 2500);

    // Refresh the question list and count
    await renderEditQuestionsList(testId);
  } catch (e) {
    statusEl.style.color = "var(--danger)";
    statusEl.textContent = "Error: " + e.message;
  } finally {
    addBtn.disabled = false;
  }
});

// ============================================================
// DOCUMENT UPLOAD & EXTRACTION LOGIC (PDF, WORD, TXT)
// ============================================================
document.getElementById("file-upload").addEventListener("change", async function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusText = document.getElementById("upload-status");
  const rawBox = document.getElementById("raw-questions");
  statusText.textContent = "Extracting text... please wait.";
  statusText.style.color = "var(--primary)";

  try {
    let extractedText = "";

    // 1. Handle Text Files
    if (file.type === "text/plain") {
      extractedText = await file.text();
    } 
    // 2. Handle PDF Files
    else if (file.type === "application/pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        extractedText += pageText + "\n\n";
      }
    } 
    // 3. Handle Word Documents (.docx)
    else if (file.name.endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      extractedText = result.value;
    } 
    else {
      throw new Error("Unsupported file format. Please upload PDF, Word (.docx), or TXT.");
    }

    // Success! Dump text into the box for parsing
    rawBox.value = extractedText;
    statusText.textContent = "Extraction complete! Click 'Preview Questions'.";
    statusText.style.color = "var(--success)";

  } catch (error) {
    console.error(error);
    statusText.textContent = "Error extracting file: " + error.message;
    statusText.style.color = "var(--danger)";
  }
  
  // Reset file input so you can upload the same file again if needed
  event.target.value = '';
});

// ============================================================
// INTELLIGENT RAW TEXT PARSER (State Machine Architecture)
// ============================================================
function parseQuestions(rawText) {
  
  // FIXED BUG: Safely escaping the backtick character for the bundler
  let cleanRaw = rawText
    .replace(/\*\*/g, '')           
    .replace(/###\s*/g, '')         
    .replace(/^\s*\*\s+/gm, '')     
    .replace(/[`]/g, '');             

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
  if (!raw.trim()) { reportEl.innerHTML = `<span class="err" style="color:var(--danger)">Paste or upload some questions first.</span>`; return; }

  const { results, errors } = parseQuestions(raw);
  pendingImport = results; 

  let html = `<div style="padding: 15px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; margin-top: 15px;">
                <h3 style="margin-bottom: 10px; font-size: 1.1rem;">Preview Summary</h3>
                <p style="margin: 0 0 5px 0;"><strong>Valid questions found:</strong> <span style="color:var(--success); font-weight:bold;">${results.length}</span></p>
                <p style="margin: 0 0 10px 0;"><strong>Needs review / Skipped:</strong> <span style="color:var(--danger); font-weight:bold;">${errors.length}</span></p>`;

  if (errors.length > 0) {
    let errorList = errors.map(e => `<li>${escapeHtml(e)}</li>`).join("");
    html += `<div style="background: rgba(220, 38, 38, 0.1); color: var(--danger); padding: 10px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 10px;">
               <strong>Errors to fix:</strong>
               <ul style="margin: 5px 0 0 20px;">${errorList}</ul>
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
    document.getElementById("upload-status").textContent = ""; // Clear file upload text
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
  navigateTo("/dashboard");
});

// ============================================================
// QUESTION DISPLAY FORMATTER (Statements & Match-the-following)
// ============================================================
const ROMAN_NUMS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const ROMAN_LOWER = ROMAN_NUMS.map(r => r.toLowerCase());

const CONCLUSION_PATTERNS = [
  /(?:Which\s+(?:of\s+the|of\s+these|among\s+the)?\s+(?:statements?\s+given\s+above|above\s+statements?|statements?|pairs?\s+given\s+above|above\s+pairs?|following(?:\s+statements?|\s+pairs?)?)\s+(?:is\/are|are|is)\s+(?:correct|not\s+correct|incorrect|true|false|correctly\s+matched|not\s+correctly\s+matched)[^?]*\??)/i,
  /(?:Select\s+the\s+correct\s+(?:answer|code|option|statement|statements)\s+(?:using|from)\s+(?:the\s+)?(?:codes?|options?)\s+given\s+below[^:]*:?)/i,
  /(?:Choose\s+the\s+correct\s+(?:answer|statement|statements|code|option|combination)[^:]*:?)/i,
  /(?:Which\s+of\s+the\s+following\s+is(?:\s+the)?\s+correct\s+(?:matching|combination|code)\??)/i,
  /(?:Which\s+of\s+the\s+following\s+(?:is\/are|are|is)\s+(?:correct|not\s+correct|incorrect|true|false)\??)/i
];

function extractConclusion(text) {
  for (const pat of CONCLUSION_PATTERNS) {
    const fullPat = new RegExp("(" + pat.source + ")\\s*$", "i");
    const m = text.match(fullPat);
    if (m) {
      const mainText = text.slice(0, m.index).trim();
      const conc = m[1].trim();
      return { mainText, conclusion: conc };
    }
  }
  const fallback = text.match(/((?:Which\s+(?:of|among)|Select\s+the|Choose\s+the)[^?:]*(?:\?|:))\s*$/i);
  if (fallback) {
    const mainText = text.slice(0, fallback.index).trim();
    const conc = fallback[1].trim();
    return { mainText, conclusion: conc };
  }
  return { mainText: text, conclusion: "" };
}

function parseMatchTheFollowing(rawText) {
  const text = (rawText || "").trim();
  if (!/\b(?:match|list|column)\b/i.test(text)) return null;

  const { mainText, conclusion: extractedConc } = extractConclusion(text);
  let conclusion = extractedConc;

  const introMatch = mainText.match(/^(.*?match\s+(?:list[- ]?(?:I|1|A)\s+with\s+list[- ]?(?:II|2|B)|the\s+following|column[- ]?(?:I|1|A)\s+with\s+column[- ]?(?:II|2|B))[:.]?)\s*/i);
  let introText = "";
  let remainder = mainText;
  if (introMatch) {
    introText = introMatch[1].trim();
    remainder = mainText.slice(introMatch[0].length);
  }

  let h1Match = remainder.match(/\b((?:List|Column)\s*[-–]?\s*(?:I|1|A))\b[:.]?/i);
  if (!h1Match) {
    h1Match = mainText.match(/\b((?:List|Column)\s*[-–]?\s*(?:I|1|A))\b[:.]?/i);
    if (!h1Match) return null;
    introText = mainText.slice(0, h1Match.index).trim();
    remainder = mainText.slice(h1Match.index);
    h1Match = remainder.match(/\b((?:List|Column)\s*[-–]?\s*(?:I|1|A))\b[:.]?/i);
  }

  const heading1 = h1Match[1].trim();
  const afterH1 = remainder.slice(h1Match.index + h1Match[0].length);

  const h2Match = afterH1.match(/\b((?:List|Column)\s*[-–]?\s*(?:II|2|B))\b[:.]?/i);
  if (!h2Match) return null;

  const heading2 = h2Match[1].trim();
  let block1 = afterH1.slice(0, h2Match.index).trim();
  let block2 = afterH1.slice(h2Match.index + h2Match[0].length).trim();

  if (!conclusion) {
    const b2Res = extractConclusion(block2);
    if (b2Res.conclusion) {
      block2 = b2Res.mainText;
      conclusion = b2Res.conclusion;
    }
  }

  function extractItems(block) {
    const itemRegex = /(?:^|\s)(?:\(([A-Za-z0-9]+)\)|([A-Za-z0-9]+)[.)])\s+/g;
    const matches = [];
    let match;
    while ((match = itemRegex.exec(block)) !== null) {
      matches.push({ index: match.index, end: itemRegex.lastIndex, raw: match[0] });
    }
    if (matches.length >= 2) {
      const items = [];
      for (let i = 0; i < matches.length; i++) {
        const label = matches[i].raw.trim();
        const start = matches[i].end;
        const end = i + 1 < matches.length ? matches[i + 1].index : block.length;
        const val = block.slice(start, end).trim();
        items.push({ label, text: val });
      }
      return items;
    }
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      return lines.map(l => ({ label: "", text: l }));
    }
    return [];
  }

  const items1 = extractItems(block1);
  const items2 = extractItems(block2);

  if (items1.length < 2 || items2.length < 2) return null;

  return {
    type: "match",
    intro: introText || "Match List I with List II:",
    sections: [
      { heading: heading1, items: items1 },
      { heading: heading2, items: items2 }
    ],
    conclusion
  };
}

function parseStatements(rawText) {
  const text = (rawText || "").trim();
  const { mainText, conclusion } = extractConclusion(text);

  const hasStatementContext =
    /\b(?:statements?|consider|following|regarding|with\s+reference\s+to|select\s+the|read\s+the)\b/i.test(mainText) ||
    Boolean(conclusion);

  function testRomanSequence(isUpper, withParens) {
    const tokens = isUpper ? ROMAN_NUMS : ROMAN_LOWER;
    let patStr;
    if (withParens) {
      patStr = "(?:^|\\s)\\((" + tokens.join("|") + ")\\)\\s*";
    } else {
      patStr = "(?:^|\\s)(" + tokens.join("|") + ")[.)]\\s*";
    }
    const regex = new RegExp(patStr, isUpper ? "g" : "gi");
    const matches = [];
    let m;
    while ((m = regex.exec(mainText)) !== null) {
      matches.push({ index: m.index, end: regex.lastIndex, val: m[1], raw: m[0] });
    }
    if (matches.length < 2) return null;

    const seqMatches = [];
    let expectedIdx = 0;
    for (const matchItem of matches) {
      const val = isUpper ? matchItem.val.toUpperCase() : matchItem.val.toLowerCase();
      if (expectedIdx < tokens.length && val === tokens[expectedIdx]) {
        seqMatches.push(matchItem);
        expectedIdx++;
      } else if (expectedIdx > 0 && val === tokens[0]) {
        seqMatches.length = 0;
        seqMatches.push(matchItem);
        expectedIdx = 1;
      }
    }

    if (seqMatches.length >= 2) {
      const intro = mainText.slice(0, seqMatches[0].index).trim();
      const statements = [];
      for (let i = 0; i < seqMatches.length; i++) {
        const label = seqMatches[i].raw.trim();
        const start = seqMatches[i].end;
        const end = i + 1 < seqMatches.length ? seqMatches[i + 1].index : mainText.length;
        const stText = mainText.slice(start, end).trim();
        statements.push({ label, text: stText });
      }
      return {
        type: "statement",
        intro,
        statements,
        conclusion
      };
    }
    return null;
  }

  let res = testRomanSequence(true, false);
  if (res) return res;
  res = testRomanSequence(true, true);
  if (res) return res;
  res = testRomanSequence(false, true);
  if (res) return res;
  res = testRomanSequence(false, false);
  if (res) return res;

  if (hasStatementContext) {
    function testArabicSequence(withParens) {
      const patStr = withParens ? "(?:^|\\s)\\((\\d{1,2})\\)\\s*" : "(?:^|\\s)(\\d{1,2})[.)]\\s*";
      const regex = new RegExp(patStr, "g");
      const matches = [];
      let m;
      while ((m = regex.exec(mainText)) !== null) {
        matches.push({ index: m.index, end: regex.lastIndex, num: parseInt(m[1], 10), raw: m[0] });
      }
      if (matches.length < 2) return null;

      let validMatches = matches;
      if (!withParens && matches[0].index === 0) {
        const afterFirst = mainText.slice(matches[0].end);
        if (/^(?:Consider|With|Regarding|Which|Read|In|Match)\b/i.test(afterFirst)) {
          validMatches = matches.slice(1);
        }
      }
      if (validMatches.length < 2) return null;

      const seqMatches = [];
      let expectedNum = 1;
      for (const item of validMatches) {
        if (item.num === expectedNum) {
          seqMatches.push(item);
          expectedNum++;
        } else if (expectedNum > 1 && item.num === 1) {
          seqMatches.length = 0;
          seqMatches.push(item);
          expectedNum = 2;
        }
      }

      if (seqMatches.length >= 2) {
        const intro = mainText.slice(0, seqMatches[0].index).trim();
        const statements = [];
        for (let i = 0; i < seqMatches.length; i++) {
          const label = seqMatches[i].raw.trim();
          const start = seqMatches[i].end;
          const end = i + 1 < seqMatches.length ? seqMatches[i + 1].index : mainText.length;
          const stText = mainText.slice(start, end).trim();
          statements.push({ label, text: stText });
        }
        return {
          type: "statement",
          intro,
          statements,
          conclusion
        };
      }
      return null;
    }

    res = testArabicSequence(false);
    if (res) return res;
    res = testArabicSequence(true);
    if (res) return res;
  }

  return null;
}

function parseQuestionStructure(text) {
  if (!text || typeof text !== "string") {
    return { type: "plain", text: "" };
  }
  const matchRes = parseMatchTheFollowing(text);
  if (matchRes) return matchRes;

  const stmtRes = parseStatements(text);
  if (stmtRes) return stmtRes;

  return { type: "plain", text };
}

function renderFormattedQuestion(container, rawText) {
  if (!container) return;
  container.innerHTML = "";

  const parsed = parseQuestionStructure(rawText);

  if (parsed.type === "statement") {
    const wrap = document.createElement("div");
    wrap.className = "q-formatted-statement";

    if (parsed.intro) {
      const introEl = document.createElement("div");
      introEl.className = "q-statement-intro";
      introEl.textContent = parsed.intro;
      wrap.appendChild(introEl);
    }

    const listEl = document.createElement("div");
    listEl.className = "q-statement-list";
    parsed.statements.forEach(st => {
      const itemEl = document.createElement("div");
      itemEl.className = "q-statement-item";

      const numEl = document.createElement("span");
      numEl.className = "q-statement-num";
      numEl.textContent = st.label;

      const textEl = document.createElement("span");
      textEl.className = "q-statement-text";
      textEl.textContent = st.text;

      itemEl.appendChild(numEl);
      itemEl.appendChild(textEl);
      listEl.appendChild(itemEl);
    });
    wrap.appendChild(listEl);

    if (parsed.conclusion) {
      const concEl = document.createElement("div");
      concEl.className = "q-statement-conclusion";
      concEl.textContent = parsed.conclusion;
      wrap.appendChild(concEl);
    }

    container.appendChild(wrap);
  } else if (parsed.type === "match") {
    const wrap = document.createElement("div");
    wrap.className = "q-formatted-match";

    if (parsed.intro) {
      const introEl = document.createElement("div");
      introEl.className = "q-match-intro";
      introEl.textContent = parsed.intro;
      wrap.appendChild(introEl);
    }

    const listsEl = document.createElement("div");
    listsEl.className = "q-match-lists";

    parsed.sections.forEach(sec => {
      const colEl = document.createElement("div");
      colEl.className = "q-match-column";

      const headingEl = document.createElement("div");
      headingEl.className = "q-match-heading";
      headingEl.textContent = sec.heading;
      colEl.appendChild(headingEl);

      const itemsEl = document.createElement("div");
      itemsEl.className = "q-match-items";
      sec.items.forEach(it => {
        const itemEl = document.createElement("div");
        itemEl.className = "q-match-item";

        if (it.label) {
          const lblEl = document.createElement("span");
          lblEl.className = "q-match-label";
          lblEl.textContent = it.label;
          itemEl.appendChild(lblEl);
        }

        const textEl = document.createElement("span");
        textEl.className = "q-match-text";
        textEl.textContent = it.text;
        itemEl.appendChild(textEl);

        itemsEl.appendChild(itemEl);
      });
      colEl.appendChild(itemsEl);
      listsEl.appendChild(colEl);
    });
    wrap.appendChild(listsEl);

    if (parsed.conclusion) {
      const concEl = document.createElement("div");
      concEl.className = "q-match-conclusion";
      concEl.textContent = parsed.conclusion;
      wrap.appendChild(concEl);
    }

    container.appendChild(wrap);
  } else {
    const wrap = document.createElement("div");
    wrap.className = "q-formatted-plain";
    wrap.textContent = parsed.text;
    container.appendChild(wrap);
  }
}

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
let isTestPaused = false;
let pausedRemainingSeconds = 0;
let pendingResumeSubjectId = null;

function formatRemainingTime(totalSec) {
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

async function startTest(subjectId, forceFresh = false) {
  // If there's an unfinished paused attempt and fresh was not forced, open resume prompt
  if (!forceFresh && userPausedTests && userPausedTests[subjectId]) {
    openResumeConfirmModal(subjectId);
    return;
  }

  // If forceFresh is true, remove any existing draft from persistent storage
  if (forceFresh && userPausedTests && userPausedTests[subjectId]) {
    try {
      await removePausedDraft(subjectId);
    } catch (e) {
      console.warn("Could not delete draft before starting fresh:", e);
    }
  }

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
  isTestPaused = false;

  document.getElementById("test-subject-name").textContent = `${currentSubject.subject} - ${currentSubject.testName}`;
  const durationMin = currentSubject.durationMinutes || 30;
  endTime = Date.now() + durationMin * 60 * 1000;
  isTestActive = true;

  showView("view-test");
  applyPaletteState();
  renderQuestion();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}

function tickTimer() {
  if (isTestPaused) return;
  const remainingMs = endTime - Date.now();
  const timerEl = document.getElementById("timer");
  const headerTimerEl = document.getElementById("timer-header");
  const headerTimerWrap = document.getElementById("header-timer");

  if (remainingMs <= 0) {
    if (timerEl) timerEl.textContent = "00:00";
    if (headerTimerEl) headerTimerEl.textContent = "00:00";
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    submitTest();
    return;
  }
  const totalSec = Math.floor(remainingMs / 1000);
  const timeStr = formatRemainingTime(totalSec);
  const isLow = totalSec < 5 * 60;

  if (timerEl) {
    timerEl.textContent = timeStr;
    timerEl.classList.toggle("low", isLow);
  }
  if (headerTimerEl) {
    headerTimerEl.textContent = timeStr;
  }
  if (headerTimerWrap) {
    headerTimerWrap.classList.toggle("low", isLow);
  }
}

async function savePausedDraft(subjectId, draftData) {
  let saved = false;

  // 1. Keep in memory immediately
  userPausedTests[subjectId] = { ...draftData };

  // 2. localStorage (instant local persistence on this browser / machine)
  try {
    localStorage.setItem(`ts_paused_${auth.currentUser.uid}_${subjectId}`, JSON.stringify(draftData));
    saved = true;
  } catch (lsErr) {
    console.warn("localStorage write error:", lsErr);
  }

  // 3. Firestore users/{uid} document (cloud persistent across devices with existing rules)
  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    await setDoc(userRef, {
      inProgressTests: {
        [subjectId]: draftData
      }
    }, { merge: true });
    saved = true;
  } catch (userErr) {
    console.warn("Firestore users/{uid} write error:", userErr);
  }

  // 4. Also try dedicated inProgressTests collection (if rules deployed in Firebase Console)
  try {
    await setDoc(doc(db, "inProgressTests", auth.currentUser.uid, "tests", subjectId), draftData);
    saved = true;
  } catch (collErr) {
    // Graceful fallback: users/{uid} and localStorage already secured the draft
  }

  return saved;
}

async function removePausedDraft(subjectId) {
  delete userPausedTests[subjectId];

  // 1. Remove from localStorage
  try {
    localStorage.removeItem(`ts_paused_${auth.currentUser.uid}_${subjectId}`);
  } catch (e) {}

  // 2. Remove from users/{uid} in Firestore
  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      [`inProgressTests.${subjectId}`]: deleteField()
    });
  } catch (e) {}

  // 3. Remove from inProgressTests collection in Firestore
  try {
    await deleteDoc(doc(db, "inProgressTests", auth.currentUser.uid, "tests", subjectId));
  } catch (e) {}
}

async function pauseTest() {
  if (!isTestActive || isTestPaused || !currentSubject) return;

  // 1. Stop timer interval immediately
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const remainingMs = Math.max(0, endTime - Date.now());
  pausedRemainingSeconds = Math.max(1, Math.floor(remainingMs / 1000));
  isTestActive = false;
  isTestPaused = true;

  // Freeze the timer display immediately in both palette and header
  const frozenTime = formatRemainingTime(pausedRemainingSeconds);
  const timerEl = document.getElementById("timer");
  if (timerEl) timerEl.textContent = frozenTime;
  const headerTimerEl = document.getElementById("timer-header");
  if (headerTimerEl) headerTimerEl.textContent = frozenTime;

  // 2. Open pause modal with live test stats
  const answeredCount = Object.keys(answers).length;
  const markedCount = marked.size;
  const totalCount = currentQuestions.length;

  document.getElementById("pause-stat-name").textContent = currentSubject.testName || currentSubject.name || currentSubject.subject;
  document.getElementById("pause-stat-time").textContent = formatRemainingTime(pausedRemainingSeconds);
  document.getElementById("pause-stat-answered").textContent = `${answeredCount} of ${totalCount} questions`;
  document.getElementById("pause-stat-marked").textContent = `${markedCount} questions`;

  const savingInd = document.getElementById("pause-saving-indicator");
  const errEl = document.getElementById("pause-error-msg");
  savingInd.classList.remove("hidden");
  errEl.classList.add("hidden");
  errEl.textContent = "";

  document.getElementById("pause-modal").classList.remove("hidden");

  // 3. Prepare payload for persistent storage
  const draftData = {
    uid: auth.currentUser.uid,
    subjectId: currentSubject.id,
    testName: currentSubject.testName || currentSubject.name || currentSubject.subject || "Untitled Test",
    subject: currentSubject.subject || "General",
    durationMinutes: currentSubject.durationMinutes || 30,
    questionIds: currentQuestions.map(q => q.id),
    currentIndex: currentIndex,
    remainingSeconds: pausedRemainingSeconds,
    answers: { ...answers },
    marked: Array.from(marked),
    visited: Array.from(visited),
    pausedAt: Date.now(),
    updatedAt: Date.now()
  };

  const saved = await savePausedDraft(currentSubject.id, draftData);
  savingInd.classList.add("hidden");

  if (!saved) {
    errEl.textContent = "Could not save progress to the cloud. Your in-memory answers are safe. You can resume now or retry pausing.";
    errEl.classList.remove("hidden");
  }
}

function resumeTestFromModal() {
  document.getElementById("pause-modal").classList.add("hidden");
  document.getElementById("pause-error-msg").classList.add("hidden");

  // Resume countdown from exact preserved seconds
  endTime = Date.now() + (pausedRemainingSeconds * 1000);
  isTestActive = true;
  isTestPaused = false;

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();

  renderQuestion();
}

async function exitPausedTestToDashboard() {
  document.getElementById("pause-modal").classList.add("hidden");
  document.getElementById("pause-error-msg").classList.add("hidden");

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isTestActive = false;
  isTestPaused = false;
  navSubject = null;
  navType = null;

  showView("view-app");
  await loadSubjects();
}

function openResumeConfirmModal(subjectId) {
  pendingResumeSubjectId = subjectId;
  const draft = userPausedTests[subjectId];
  const subj = subjectsCache.find(s => s.id === subjectId);
  const testTitle = (subj && (subj.testName || subj.name)) || (draft && draft.testName) || "Test";

  document.getElementById("resume-modal-testname").textContent = testTitle;

  const modalDetails = document.getElementById("resume-modal-details");
  if (draft) {
    const remSec = draft.remainingSeconds || 0;
    const answeredCount = Object.keys(draft.answers || {}).length;
    const totalQ = (draft.questionIds || []).length || (subj ? subj.questionCount : 0);
    const markedCount = (draft.marked || []).length;

    modalDetails.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div><strong>Time Remaining:</strong> <span style="font-family:var(--font-mono); color:var(--primary); font-size:14px;">${formatRemainingTime(remSec)}</span></div>
        <div><strong>Questions Answered:</strong> ${answeredCount} / ${totalQ}</div>
        <div><strong>Marked for Review:</strong> ${markedCount}</div>
        <div><strong>Last Position:</strong> Q ${(draft.currentIndex || 0) + 1}</div>
      </div>
    `;
  } else {
    modalDetails.innerHTML = `<div>Saved progress was found. Click below to resume your attempt.</div>`;
  }

  document.getElementById("resume-confirm-modal").classList.remove("hidden");
}

async function resumeTest(subjectId) {
  document.getElementById("resume-confirm-modal").classList.add("hidden");

  let draft = userPausedTests[subjectId];
  if (!draft) {
    // 1. Try localStorage
    try {
      const local = localStorage.getItem(`ts_paused_${auth.currentUser.uid}_${subjectId}`);
      if (local) draft = JSON.parse(local);
    } catch (e) {}
  }
  if (!draft) {
    // 2. Try users/{uid}
    try {
      const uSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (uSnap.exists() && uSnap.data().inProgressTests) {
        draft = uSnap.data().inProgressTests[subjectId];
      }
    } catch (e) {}
  }
  if (!draft) {
    // 3. Try inProgressTests subcollection
    try {
      const snap = await getDoc(doc(db, "inProgressTests", auth.currentUser.uid, "tests", subjectId));
      if (snap.exists()) {
        draft = snap.data();
      }
    } catch (e) {}
  }

  if (!draft) {
    alert("Could not locate saved progress for this test. Starting a fresh attempt.");
    startTest(subjectId, true);
    return;
  }

  currentSubject = subjectsCache.find(s => s.id === subjectId);
  if (!currentSubject) {
    try {
      const sDoc = await getDoc(doc(db, "subjects", subjectId));
      if (sDoc.exists()) {
        currentSubject = { id: sDoc.id, ...sDoc.data() };
      }
    } catch {}
  }
  if (!currentSubject) {
    alert("Test configuration could not be loaded.");
    return;
  }

  // Load latest questions from Firestore
  const snap = await getDocs(collection(db, "subjects", subjectId, "questions"));
  const qMap = new Map();
  snap.forEach(d => qMap.set(d.id, { id: d.id, ...d.data() }));

  if (qMap.size === 0) {
    alert("This test no longer has any questions available.");
    return;
  }

  // Reconstruct questions according to draft order
  currentQuestions = [];
  let missingCount = 0;
  if (Array.isArray(draft.questionIds) && draft.questionIds.length > 0) {
    draft.questionIds.forEach(qid => {
      if (qMap.has(qid)) {
        currentQuestions.push(qMap.get(qid));
      } else {
        missingCount++;
      }
    });
    // Append any new questions added by admin since pause
    qMap.forEach((q, qid) => {
      if (!draft.questionIds.includes(qid)) {
        currentQuestions.push(q);
      }
    });
  } else {
    snap.forEach(d => currentQuestions.push({ id: d.id, ...d.data() }));
  }

  if (missingCount > 0) {
    alert(`Notice: ${missingCount} question(s) were modified or removed since your test was paused. Your answers to the remaining questions have been restored.`);
  }

  // Restore answers, marked, visited
  const validQIds = new Set(currentQuestions.map(q => q.id));
  answers = {};
  if (draft.answers) {
    Object.keys(draft.answers).forEach(qid => {
      if (validQIds.has(qid)) {
        answers[qid] = draft.answers[qid];
      }
    });
  }
  marked = new Set((draft.marked || []).filter(qid => validQIds.has(qid)));
  visited = new Set((draft.visited || []).filter(qid => validQIds.has(qid)));

  currentIndex = Math.max(0, Math.min(draft.currentIndex || 0, currentQuestions.length - 1));

  document.getElementById("test-subject-name").textContent = `${currentSubject.subject} - ${currentSubject.testName}`;

  pausedRemainingSeconds = Math.max(1, draft.remainingSeconds || (currentSubject.durationMinutes || 30) * 60);
  endTime = Date.now() + (pausedRemainingSeconds * 1000);
  isTestActive = true;
  isTestPaused = false;

  showView("view-test");
  applyPaletteState();
  renderQuestion();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}

async function discardPausedTest(subjectId, startFresh = false) {
  if (!confirm("Are you sure you want to discard this paused attempt? All saved answers and progress will be permanently lost.")) {
    return;
  }

  await removePausedDraft(subjectId);

  document.getElementById("resume-confirm-modal").classList.add("hidden");
  document.getElementById("pause-modal").classList.add("hidden");

  if (startFresh) {
    await startTest(subjectId, true);
  } else {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isTestActive = false;
    isTestPaused = false;
    showView("view-app");
    await loadSubjects();
  }
}

function renderQuestion() {
  const q = currentQuestions[currentIndex];
  visited.add(q.id);

  document.getElementById("q-count").textContent = `Q ${currentIndex + 1} / ${currentQuestions.length}`;
  const badgeEl = document.getElementById("q-number-badge");
  if (badgeEl) badgeEl.textContent = `Question ${currentIndex + 1}`;

  const flagBtn = document.getElementById("btn-flag-toggle");
  const isFlagged = marked.has(q.id);
  if (flagBtn) {
    flagBtn.classList.toggle("flagged", isFlagged);
    flagBtn.setAttribute("aria-pressed", isFlagged ? "true" : "false");
    const flagIcon = document.getElementById("flag-icon");
    const flagText = document.getElementById("flag-text");
    if (flagIcon) flagIcon.textContent = isFlagged ? "⚑" : "⚐";
    if (flagText) flagText.textContent = isFlagged ? "Flagged for Review" : "Flag for Review";
  }

  document.getElementById("btn-prev").disabled = currentIndex === 0;
  renderFormattedQuestion(document.getElementById("q-text"), q.text);

  const topicEl = document.getElementById("q-topic");
  if (q.topic) { topicEl.textContent = q.topic; topicEl.classList.remove("hidden"); }
  else { topicEl.classList.add("hidden"); }

  const optionsEl = document.getElementById("q-options");
  optionsEl.innerHTML = "";
  const optionLetters = ["A", "B", "C", "D", "E", "F"];
  q.options.forEach((opt, i) => {
    const isSelected = answers[q.id] === i;
    const letter = optionLetters[i] || String.fromCharCode(65 + i);
    const row = document.createElement("div");
    row.className = "option-row" + (isSelected ? " selected" : "");
    row.setAttribute("role", "radio");
    row.setAttribute("aria-checked", isSelected ? "true" : "false");
    row.setAttribute("tabindex", "0");
    row.innerHTML = `<div class="option-marker">${letter}</div><div class="option-text">${escapeHtml(opt)}</div>`;

    const chooseOption = () => {
      answers[q.id] = i;
      renderQuestion();
    };

    row.addEventListener("click", chooseOption);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        chooseOption();
      }
    });
    optionsEl.appendChild(row);
  });

  renderPalette();
}

function renderPalette() {
  const answeredCount = currentQuestions.filter(q => answers[q.id] !== undefined).length;
  const markedCount = marked.size;
  const unattemptedCount = Math.max(0, currentQuestions.length - answeredCount);

  const statAnswered = document.getElementById("palette-stat-answered");
  if (statAnswered) statAnswered.innerHTML = `<strong>${answeredCount}</strong> Answered`;
  const statUnattempted = document.getElementById("palette-stat-unattempted");
  if (statUnattempted) statUnattempted.innerHTML = `<strong>${unattemptedCount}</strong> Unanswered`;
  const statMarked = document.getElementById("palette-stat-marked");
  if (statMarked) statMarked.innerHTML = `<strong>${markedCount}</strong> Flagged`;

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
    btn.setAttribute("aria-label", `Question ${i + 1}`);
    btn.addEventListener("click", () => { currentIndex = i; renderQuestion(); });
    grid.appendChild(btn);
  });
}

function goNext() {
  if (currentIndex < currentQuestions.length - 1) currentIndex++;
  renderQuestion();
}
function goPrev() {
  if (currentIndex > 0) currentIndex--;
  renderQuestion();
}

document.getElementById("btn-prev").addEventListener("click", goPrev);
document.getElementById("btn-save-next").addEventListener("click", goNext);
document.getElementById("btn-mark-review").addEventListener("click", () => {
  marked.add(currentQuestions[currentIndex].id);
  goNext();
});

const btnFlagToggle = document.getElementById("btn-flag-toggle");
if (btnFlagToggle) {
  btnFlagToggle.addEventListener("click", () => {
    if (!currentQuestions[currentIndex]) return;
    const qid = currentQuestions[currentIndex].id;
    if (marked.has(qid)) {
      marked.delete(qid);
    } else {
      marked.add(qid);
    }
    renderQuestion();
  });
}

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

// Pause & Resume control listeners
const btnPauseTest = document.getElementById("btn-pause-test");
if (btnPauseTest) btnPauseTest.addEventListener("click", pauseTest);

const btnPauseHeader = document.getElementById("btn-pause-test-header");
if (btnPauseHeader) btnPauseHeader.addEventListener("click", pauseTest);

const btnPauseAlt = document.getElementById("btn-pause-test-alt");
if (btnPauseAlt) btnPauseAlt.addEventListener("click", pauseTest);

const btnResumePaused = document.getElementById("btn-resume-paused");
if (btnResumePaused) btnResumePaused.addEventListener("click", resumeTestFromModal);

const btnExitDashboard = document.getElementById("btn-exit-to-dashboard");
if (btnExitDashboard) btnExitDashboard.addEventListener("click", exitPausedTestToDashboard);

const btnDiscardActive = document.getElementById("btn-discard-active-paused");
if (btnDiscardActive) btnDiscardActive.addEventListener("click", () => {
  if (currentSubject) discardPausedTest(currentSubject.id, false);
});

const btnConfirmResume = document.getElementById("btn-confirm-resume");
if (btnConfirmResume) btnConfirmResume.addEventListener("click", () => {
  if (pendingResumeSubjectId) resumeTest(pendingResumeSubjectId);
});

const btnConfirmDiscard = document.getElementById("btn-confirm-discard");
if (btnConfirmDiscard) btnConfirmDiscard.addEventListener("click", () => {
  if (pendingResumeSubjectId) discardPausedTest(pendingResumeSubjectId, true);
});

const btnCancelResumeModal = document.getElementById("btn-cancel-resume-modal");
if (btnCancelResumeModal) btnCancelResumeModal.addEventListener("click", () => {
  document.getElementById("resume-confirm-modal").classList.add("hidden");
});

// ============================================================
// Collapsible Question Palette Sidebar
// ============================================================
let isPaletteCollapsed = sessionStorage.getItem("ts_palette_collapsed") === "true";

function applyPaletteState() {
  const shell = document.getElementById("test-shell") || document.querySelector(".test-shell");
  const reopenTab = document.getElementById("palette-reopen-tab");
  const toggleBtn = document.getElementById("btn-toggle-palette-header");
  const toggleText = document.getElementById("palette-toggle-text");
  const toggleIcon = document.getElementById("palette-toggle-icon");
  const submitInline = document.getElementById("btn-submit-inline");

  if (!shell) return;
  shell.classList.toggle("palette-collapsed", isPaletteCollapsed);

  if (reopenTab) reopenTab.classList.toggle("hidden", !isPaletteCollapsed);
  if (submitInline) submitInline.classList.toggle("hidden", !isPaletteCollapsed);

  if (toggleText) toggleText.textContent = isPaletteCollapsed ? "Show Palette" : "Hide Palette";
  if (toggleIcon) toggleIcon.textContent = isPaletteCollapsed ? "⇤" : "⇥";
  if (toggleBtn) {
    toggleBtn.title = isPaletteCollapsed ? "Show Question Palette" : "Hide Question Palette";
  }
}

function togglePalette() {
  isPaletteCollapsed = !isPaletteCollapsed;
  try {
    sessionStorage.setItem("ts_palette_collapsed", isPaletteCollapsed ? "true" : "false");
  } catch (e) {}
  applyPaletteState();
}

const btnCollapsePalette = document.getElementById("btn-collapse-palette");
if (btnCollapsePalette) btnCollapsePalette.addEventListener("click", togglePalette);

const btnTogglePaletteHeader = document.getElementById("btn-toggle-palette-header");
if (btnTogglePaletteHeader) btnTogglePaletteHeader.addEventListener("click", togglePalette);

const paletteReopenTab = document.getElementById("palette-reopen-tab");
if (paletteReopenTab) paletteReopenTab.addEventListener("click", togglePalette);

const btnSubmitInline = document.getElementById("btn-submit-inline");
if (btnSubmitInline) {
  btnSubmitInline.addEventListener("click", () => {
    if (confirm("Submit the test now? You can't change answers after this.")) {
      clearInterval(timerInterval);
      submitTest();
    }
  });
}

async function submitTest() {
  isTestActive = false; 
  isTestPaused = false;
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
      answersSnapshot: reviewData.map(q => ({
        id: q.id,
        topic: q.topic || "",
        isAnswered: q.isAnswered,
        isCorrect: q.isCorrect,
        selected: q.selected ?? null
      })),
      submittedAt: serverTimestamp()
    });

    // Successfully submitted attempt! Delete paused draft if one exists:
    try {
      await removePausedDraft(currentSubject.id);
    } catch (cleanErr) {
      console.warn("Could not remove paused draft after submission:", cleanErr);
    }
  } catch (e) {
    console.error("Could not save attempt:", e);
  }

  const resultsPayload = {
    subjectId: currentSubject.id,
    subjectName: currentSubject.testName || currentSubject.name,
    subjectCategory: currentSubject.subject || "General",
    correct,
    wrong,
    unattempted,
    total,
    topicStats,
    reviewData
  };
  try {
    sessionStorage.setItem("testwise_last_results", JSON.stringify(resultsPayload));
  } catch (e) {
    console.warn("Could not cache results in sessionStorage:", e);
  }

  renderResults(resultsPayload);
}

// ============================================================
// Results
// ============================================================
function renderResults(r) {
  document.getElementById("results-subject-name").textContent = currentSubject.testName || currentSubject.name || currentSubject.subject || "Results";
  const pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
  document.getElementById("results-meta").textContent = `${r.correct} of ${r.total} correct • Completed in ${currentSubject.subject || "General"}`;

  document.getElementById("results-summary").innerHTML = `
    <div class="result-stat"><div class="num">${pct}%</div><div class="label">Score</div></div>
    <div class="result-stat"><div class="num" style="color:var(--success)">${r.correct}</div><div class="label">Correct</div></div>
    <div class="result-stat"><div class="num" style="color:var(--danger)">${r.wrong}</div><div class="label">Incorrect</div></div>
    <div class="result-stat"><div class="num" style="color:var(--text-muted)">${r.unattempted}</div><div class="label">Unanswered</div></div>
  `;

  // Update review filter tab counts
  const countAll = document.getElementById("count-all");
  if (countAll) countAll.textContent = r.reviewData.length;
  const countIncorrect = document.getElementById("count-incorrect");
  if (countIncorrect) countIncorrect.textContent = r.wrong;
  const countCorrect = document.getElementById("count-correct");
  if (countCorrect) countCorrect.textContent = r.correct;
  const countUnattempted = document.getElementById("count-unattempted");
  if (countUnattempted) countUnattempted.textContent = r.unattempted;

  const topicKeys = Object.keys(r.topicStats);
  const topicBarsEl = document.getElementById("topic-bars");
  if (topicKeys.length === 0) {
    topicBarsEl.innerHTML = "";
  } else {
    topicBarsEl.innerHTML = `<h3 style="margin-bottom:14px; font-size: 16px;">Performance by Topic</h3>` + topicKeys.map(topic => {
      const t = r.topicStats[topic];
      const w = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
      return `
        <div class="topic-row">
          <div style="font-weight: 500;">${escapeHtml(topic)}</div>
          <div class="topic-track"><div class="topic-fill" style="width:${w}%"></div></div>
          <div style="text-align:right;color:var(--text-muted);font-family:var(--font-mono);font-size:12px;">${t.correct}/${t.total}</div>
        </div>`;
    }).join("");
  }

  const reviewEl = document.getElementById("review-list");
  reviewEl.innerHTML = "";
  r.reviewData.forEach((q, idx) => {
    let status = "unattempted";
    let cls = "skipped";
    if (q.isAnswered) {
      if (q.isCorrect) {
        status = "correct";
        cls = "right";
      } else {
        status = "incorrect";
        cls = "wrong";
      }
    }

    const yourAnswer = q.isAnswered ? q.options[q.selected] : "Not attempted";

    const itemEl = document.createElement("div");
    itemEl.className = `review-item ${cls}`;
    itemEl.setAttribute("data-status", status);

    const itemHeader = document.createElement("div");
    itemHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;";

    const badge = document.createElement("span");
    badge.className = "q-badge";
    badge.textContent = `Question ${idx + 1}`;
    itemHeader.appendChild(badge);

    if (q.topic) {
      const topicTag = document.createElement("span");
      topicTag.className = "q-topic";
      topicTag.textContent = q.topic;
      itemHeader.appendChild(topicTag);
    }
    itemEl.appendChild(itemHeader);

    const qTextDiv = document.createElement("div");
    renderFormattedQuestion(qTextDiv, q.text);
    itemEl.appendChild(qTextDiv);

    const ansDiv = document.createElement("div");
    ansDiv.className = `review-answer ${q.isAnswered ? (q.isCorrect ? "correct-text" : "wrong-text") : ""}`;
    ansDiv.textContent = `Your answer: ${yourAnswer}`;
    itemEl.appendChild(ansDiv);

    if (!q.isCorrect) {
      const correctDiv = document.createElement("div");
      correctDiv.className = "review-answer correct-text";
      correctDiv.textContent = `Correct answer: ${q.options[q.correctIndex]}`;
      itemEl.appendChild(correctDiv);
    }

    if (q.explanation) {
      const expDiv = document.createElement("div");
      expDiv.className = "review-explanation";
      expDiv.innerHTML = `<strong>💡 Explanation:</strong> ${escapeHtml(q.explanation)}`;
      itemEl.appendChild(expDiv);
    }

    // AI Question Tutor Action Button
    const actionsBar = document.createElement("div");
    actionsBar.className = "review-actions-bar";
    const aiBtn = document.createElement("button");
    aiBtn.type = "button";
    aiBtn.className = "btn-question-ai-analyze";
    aiBtn.innerHTML = "<span>✨</span> <span>Analyze with AI</span>";
    aiBtn.title = "Study and discuss this question with TestWise AI Tutor";
    aiBtn.onclick = () => openAiQuestionTutor(q, idx + 1, r);
    actionsBar.appendChild(aiBtn);
    itemEl.appendChild(actionsBar);

    reviewEl.appendChild(itemEl);
  });

  // Filter tab switching
  const filterBtns = document.querySelectorAll(".review-filter-btn");
  function applyReviewFilter(filter) {
    filterBtns.forEach(btn => btn.classList.toggle("active", btn.getAttribute("data-filter") === filter));
    const items = reviewEl.querySelectorAll(".review-item");
    items.forEach(item => {
      const status = item.getAttribute("data-status");
      if (filter === "all" || status === filter) {
        item.classList.remove("hidden");
      } else {
        item.classList.add("hidden");
      }
    });
  }

  filterBtns.forEach(btn => {
    btn.onclick = () => {
      applyReviewFilter(btn.getAttribute("data-filter"));
    };
  });
  applyReviewFilter("all");

  // Wire up Master Test Analyzer button
  const btnAnalyzeTest = document.getElementById("btn-analyze-test-ai");
  if (btnAnalyzeTest) {
    btnAnalyzeTest.onclick = () => openAiMasterTestAnalyzer(r);
  }

  showView("view-results");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isTestActive && !isTestPaused) {
    alert("Anti-Cheating Alert: You left the test tab! Your test has been automatically submitted.");
    if (timerInterval) clearInterval(timerInterval);
    submitTest();
  }
});

const homeLink = document.getElementById("home-link");
if (homeLink) {
  homeLink.addEventListener("click", () => {
    if (!auth.currentUser) return; 
    if (isTestActive && !isTestPaused) {
      if (confirm("You are currently taking a test. Would you like to pause and save your test to return to the Dashboard? Click OK to Pause & Exit, or Cancel to continue your test.")) {
        pauseTest().then(() => {
          exitPausedTestToDashboard();
        });
      }
    } else {
      if (isTestPaused) {
        exitPausedTestToDashboard();
      } else {
        showView("view-app");
        window.history.pushState({}, "", "/dashboard");
        loadSubjects();
      }
    }
  });
}

// ============================================================
// TestWise AI: Question Tutor & Master Test Analyzer
// ============================================================
let currentAiMode = "question_tutor"; // "question_tutor" | "test_analyzer"
let currentAiContext = null;
let currentAiSessionKey = null;
let currentAiResults = null;
let isAiGenerating = false;
const aiConversationsCache = {};

function getCachedConversation(key) {
  if (aiConversationsCache[key]) return aiConversationsCache[key];
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        aiConversationsCache[key] = parsed;
        return parsed;
      }
    }
  } catch (e) {}
  return [];
}

function saveCachedConversation(key, messages) {
  aiConversationsCache[key] = messages;
  try {
    sessionStorage.setItem(key, JSON.stringify(messages));
  } catch (e) {}
}

async function callAiTutorApi(payload) {
  if (!auth.currentUser) {
    throw new Error("You must be logged in to use TestWise AI.");
  }
  const token = await auth.currentUser.getIdToken(true);
  const resp = await fetch("/api/ai-tutor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || `Server responded with status ${resp.status}`);
    err.status = resp.status;
    err.needsKey = data.needsKey;
    err.help = data.help;
    err.rateLimited = data.rateLimited;
    throw err;
  }
  return data;
}

function renderSafeMarkdown(md) {
  if (!md) return "";
  let html = escapeHtml(md);

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Headers (h3, h4)
  html = html.replace(/^### (.*$)/gim, "<h4>$1</h4>");
  html = html.replace(/^## (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^# (.*$)/gim, "<h3>$1</h3>");

  // Markdown Tables
  const lines = html.split("\n");
  const processedLines = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      if (/^\|[-:\s|]+\|$/.test(line)) {
        continue;
      }
      inTable = true;
      const cells = line.slice(1, -1).split("|").map(c => c.trim());
      tableRows.push(cells);
    } else {
      if (inTable) {
        if (tableRows.length > 0) {
          let tableHtml = "<table><thead><tr>";
          tableRows[0].forEach(cell => { tableHtml += `<th>${cell}</th>`; });
          tableHtml += "</tr></thead><tbody>";
          for (let r = 1; r < tableRows.length; r++) {
            tableHtml += "<tr>";
            tableRows[r].forEach(cell => { tableHtml += `<td>${cell}</td>`; });
            tableHtml += "</tr>";
          }
          tableHtml += "</tbody></table>";
          processedLines.push(tableHtml);
        }
        inTable = false;
        tableRows = [];
      }
      processedLines.push(lines[i]);
    }
  }

  if (inTable && tableRows.length > 0) {
    let tableHtml = "<table><thead><tr>";
    tableRows[0].forEach(cell => { tableHtml += `<th>${cell}</th>`; });
    tableHtml += "</tr></thead><tbody>";
    for (let r = 1; r < tableRows.length; r++) {
      tableHtml += "<tr>";
      tableRows[r].forEach(cell => { tableHtml += `<td>${cell}</td>`; });
      tableHtml += "</tr>";
    }
    tableHtml += "</tbody></table>";
    processedLines.push(tableHtml);
  }

  html = processedLines.join("\n");

  // Lists (- or *)
  html = html.replace(/(?:^|\n)[-*] (.*)/g, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");

  // Numbered lists (1. )
  html = html.replace(/(?:^|\n)\d+\. (.*)/g, "<li>$1</li>");

  // Paragraphs
  html = html.split(/\n\s*\n/).map(p => {
    p = p.trim();
    if (!p) return "";
    if (p.startsWith("<h") || p.startsWith("<ul") || p.startsWith("<ol") || p.startsWith("<table") || p.startsWith("<pre")) {
      return p;
    }
    return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
  }).join("");

  return html;
}

function openAiDrawer() {
  const drawer = document.getElementById("ai-drawer");
  const backdrop = document.getElementById("ai-drawer-backdrop");
  if (drawer) drawer.classList.remove("hidden");
  if (backdrop) backdrop.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeAiDrawer() {
  const drawer = document.getElementById("ai-drawer");
  const backdrop = document.getElementById("ai-drawer-backdrop");
  if (drawer) drawer.classList.add("hidden");
  if (backdrop) backdrop.classList.add("hidden");
  document.body.style.overflow = "";
}

function renderAiMessages(messages) {
  const body = document.getElementById("ai-chat-body");
  if (!body) return;
  body.innerHTML = "";

  messages.forEach((msg) => {
    const wrap = document.createElement("div");
    wrap.className = `ai-message ${msg.role === "assistant" ? "assistant" : "user"}`;
    if (msg.role === "assistant") {
      wrap.innerHTML = renderSafeMarkdown(msg.content);
    } else {
      wrap.textContent = msg.content;
    }
    body.appendChild(wrap);
  });

  body.scrollTop = body.scrollHeight;
}

function renderAiLoader() {
  const body = document.getElementById("ai-chat-body");
  if (!body) return;
  const loader = document.createElement("div");
  loader.id = "ai-active-loader";
  loader.className = "ai-message assistant";
  loader.innerHTML = `
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;font-weight:600;">TestWise AI is analyzing...</div>
    <div class="ai-pulse-loader">
      <div class="ai-pulse-dot"></div>
      <div class="ai-pulse-dot"></div>
      <div class="ai-pulse-dot"></div>
    </div>
  `;
  body.appendChild(loader);
  body.scrollTop = body.scrollHeight;
}

function removeAiLoader() {
  const loader = document.getElementById("ai-active-loader");
  if (loader) loader.remove();
}

function renderAiError(err, onRetry) {
  removeAiLoader();
  const body = document.getElementById("ai-chat-body");
  if (!body) return;

  const errBox = document.createElement("div");
  errBox.className = "ai-message assistant";
  errBox.style.borderColor = "var(--danger)";
  errBox.style.background = "color-mix(in srgb, var(--danger) 8%, var(--surface))";

  if (err.needsKey) {
    errBox.innerHTML = `
      <h4 style="color:var(--danger);margin-top:0;">⚠️ Google Gemini API Key Required</h4>
      <p style="font-size:13px;line-height:1.5;">${escapeHtml(err.error)}</p>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:10px;margin:10px 0;font-size:12px;font-family:var(--font-mono, monospace);">
        <strong>To enable AI responses locally:</strong><br/>
        Create a <code>.env.local</code> file in your project folder with:<br/>
        <code style="color:var(--primary);font-weight:bold;">GEMINI_API_KEY=your_gemini_api_key_here</code>
      </div>
      <p style="font-size:12px;color:var(--text-muted);">Get a free API key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">Google AI Studio</a> (Free of charge, no billing required).</p>
    `;
  } else {
    errBox.innerHTML = `
      <h4 style="color:var(--danger);margin-top:0;">⚠️ Unable to Complete Request</h4>
      <p style="font-size:13px;line-height:1.5;">${escapeHtml(err.message || "An unexpected error occurred while communicating with the AI service.")}</p>
    `;
    if (onRetry) {
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "btn btn-sm btn-quiet";
      retryBtn.style.marginTop = "8px";
      retryBtn.textContent = "🔄 Retry Request";
      retryBtn.onclick = () => {
        errBox.remove();
        onRetry();
      };
      errBox.appendChild(retryBtn);
    }
  }

  body.appendChild(errBox);
  body.scrollTop = body.scrollHeight;
}

async function sendAiMessage(promptText) {
  if (isAiGenerating) return;
  const inputEl = document.getElementById("ai-drawer-input");
  const text = (promptText || (inputEl ? inputEl.value : "")).trim();
  if (!text) return;

  if (inputEl && !promptText) {
    inputEl.value = "";
    inputEl.style.height = "auto";
  }

  const messages = getCachedConversation(currentAiSessionKey);
  const newMessages = [...messages, { role: "user", content: text }];
  renderAiMessages(newMessages);

  isAiGenerating = true;
  renderAiLoader();

  try {
    const res = await callAiTutorApi({
      mode: currentAiMode,
      context: currentAiContext,
      messages: newMessages
    });

    removeAiLoader();
    const finalMessages = [...newMessages, { role: "assistant", content: res.text || "No response received." }];
    saveCachedConversation(currentAiSessionKey, finalMessages);
    renderAiMessages(finalMessages);
  } catch (err) {
    renderAiError(err, () => sendAiMessage(text));
  } finally {
    isAiGenerating = false;
  }
}

function openAiQuestionTutor(q, questionNumber, results) {
  currentAiMode = "question_tutor";
  currentAiResults = results;
  const subjectId = results?.subjectId || currentSubject?.id || "test";
  currentAiSessionKey = `testwise_q_${subjectId}_${q.id}`;

  const opts = q.options || [];

  currentAiContext = {
    subject: results?.subjectCategory || currentSubject?.subject || "General",
    subjectName: results?.subjectName || currentSubject?.testName || currentSubject?.name || "Practice Test",
    topic: q.topic || "General",
    questionNumber,
    text: q.text || "",
    options: opts,
    correctIndex: q.correctIndex,
    selected: q.selected,
    isAnswered: q.isAnswered,
    isCorrect: q.isCorrect,
    explanation: q.explanation || ""
  };

  // Header UI
  const badgeEl = document.getElementById("ai-drawer-mode-badge");
  const titleEl = document.getElementById("ai-drawer-title");
  const subEl = document.getElementById("ai-drawer-sub");
  const noticeEl = document.getElementById("ai-notice-text");

  if (badgeEl) badgeEl.textContent = "✨ Question Tutor";
  if (titleEl) titleEl.textContent = `Question ${questionNumber}: ${q.topic || "Question Study"}`;
  if (subEl) subEl.textContent = `${currentSubject?.testName || "Practice Test"} • ${q.isAnswered ? (q.isCorrect ? "Correct" : "Incorrect") : "Unanswered"}`;
  if (noticeEl) noticeEl.textContent = `TestWise AI evaluates Question ${questionNumber} and explains the underlying concept.`;

  // Quick Chips
  const chipsContainer = document.getElementById("ai-quick-chips");
  if (chipsContainer) {
    const chips = [
      "Why are other options wrong?",
      "Explain in simpler language",
      "Give me a memory aid / mnemonic",
      "What is the common exam trap here?",
      "Give me a similar practice question"
    ];
    chipsContainer.innerHTML = chips.map(c => `<button type="button" class="ai-chip">${escapeHtml(c)}</button>`).join("");
    chipsContainer.querySelectorAll(".ai-chip").forEach(btn => {
      btn.onclick = () => sendAiMessage(btn.textContent.trim());
    });
  }

  openAiDrawer();

  const existing = getCachedConversation(currentAiSessionKey);
  if (existing.length > 0) {
    renderAiMessages(existing);
  } else {
    // Initial automated breakdown
    const initialPrompt = "Please analyze this question in detail: teach the concept being tested from the basics, explain what the question is asking, give the step-by-step reasoning, evaluate every option individually, explain common exam traps, and provide a memorable takeaway.";
    sendAiMessage(initialPrompt);
  }
}

function openAiMasterTestAnalyzer(results) {
  currentAiMode = "test_analyzer";
  currentAiResults = results;
  const subjectId = results?.subjectId || currentSubject?.id || "test";
  currentAiSessionKey = `testwise_master_${subjectId}`;

  const qs = (results.reviewData || []).map((q, idx) => ({
    number: idx + 1,
    topic: q.topic || "General",
    status: q.isAnswered ? (q.isCorrect ? "Correct" : "Incorrect") : "Unanswered",
    userAnswer: q.isAnswered ? (q.options[q.selected] || "Selected") : "Unanswered",
    correctAnswer: q.options[q.correctIndex] || ""
  }));

  currentAiContext = {
    subject: results.subjectCategory || currentSubject?.subject || "General",
    subjectName: results.subjectName || currentSubject?.testName || currentSubject?.name || "Practice Test",
    total: results.total,
    correct: results.correct,
    wrong: results.wrong,
    unattempted: results.unattempted,
    topicStats: results.topicStats || {},
    questionsSummary: qs
  };

  // Header UI
  const badgeEl = document.getElementById("ai-drawer-mode-badge");
  const titleEl = document.getElementById("ai-drawer-title");
  const subEl = document.getElementById("ai-drawer-sub");
  const noticeEl = document.getElementById("ai-notice-text");

  if (badgeEl) badgeEl.textContent = "✨ Master Test Analyzer";
  if (titleEl) titleEl.textContent = "Complete Test Diagnostic";
  if (subEl) subEl.textContent = `${currentSubject?.testName || "Practice Test"} (${results.correct}/${results.total} Score)`;
  if (noticeEl) noticeEl.textContent = "TestWise AI evaluates your complete test attempt across all topics and generates an actionable revision plan.";

  // Quick Chips
  const chipsContainer = document.getElementById("ai-quick-chips");
  if (chipsContainer) {
    const chips = [
      "Explain my weakest topic in detail",
      "Give me a 3-day revision plan",
      "Which concepts should I revise first?",
      "Create practice questions targeting my mistakes"
    ];
    chipsContainer.innerHTML = chips.map(c => `<button type="button" class="ai-chip">${escapeHtml(c)}</button>`).join("");
    chipsContainer.querySelectorAll(".ai-chip").forEach(btn => {
      btn.onclick = () => sendAiMessage(btn.textContent.trim());
    });
  }

  openAiDrawer();

  const existing = getCachedConversation(currentAiSessionKey);
  if (existing.length > 0) {
    renderAiMessages(existing);
  } else {
    // Initial automated master analysis
    const initialPrompt = "Please evaluate my overall test performance: provide a diagnostic breakdown of my strengths, high-priority improvement areas, cognitive error patterns, a topic-wise review table, and a prioritized study plan.";
    sendAiMessage(initialPrompt);
  }
}

function exportStudyNotes() {
  const messages = getCachedConversation(currentAiSessionKey);
  if (!messages || messages.length === 0) {
    alert("No conversation or notes available to export yet.");
    return;
  }

  let mdContent = "";
  let filename = "Study-Notes.md";

  if (currentAiMode === "question_tutor" && currentAiContext) {
    const ctx = currentAiContext;
    const safeTopic = (ctx.topic || "General").replace(/[^a-zA-Z0-9_-]/g, "_");
    filename = `Question-Tutor_${safeTopic}_Q${ctx.questionNumber || "1"}.md`;

    mdContent = `# TestWise AI Question Tutor Notes
**Test:** ${ctx.subjectName || "Practice Test"} (${ctx.subject || "General"})
**Topic:** ${ctx.topic || "General"}
**Question Number:** ${ctx.questionNumber || "N/A"}
**Status:** ${ctx.isAnswered ? (ctx.isCorrect ? "Correct" : "Incorrect") : "Unanswered"}

---

### Question
${ctx.text || ""}

### Options
${(ctx.options || []).map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n")}

**Correct Answer:** Option ${String.fromCharCode(65 + (ctx.correctIndex || 0))} - ${(ctx.options || [])[ctx.correctIndex || 0] || ""}
**Student's Answer:** ${ctx.isAnswered ? `Option ${String.fromCharCode(65 + ctx.selected)} - ${(ctx.options || [])[ctx.selected] || ""}` : "Not attempted"}
${ctx.explanation ? `\n**Provided Explanation:**\n${ctx.explanation}\n` : ""}

---

## AI Tutoring Conversation & Notes

`;
  } else if (currentAiContext) {
    const ctx = currentAiContext;
    const safeTitle = (ctx.subjectName || "Test").replace(/[^a-zA-Z0-9_-]/g, "_");
    filename = `Test-Analysis_${safeTitle}.md`;

    mdContent = `# TestWise AI Master Test Analysis Report
**Test Title:** ${ctx.subjectName || "Practice Test"}
**Subject Category:** ${ctx.subject || "General"}
**Total Questions:** ${ctx.total}
**Score:** ${ctx.correct} / ${ctx.total} (${ctx.total > 0 ? Math.round((ctx.correct / ctx.total) * 100) : 0}%)
**Correct:** ${ctx.correct} | **Incorrect:** ${ctx.wrong} | **Unanswered:** ${ctx.unattempted}

---

## Topic Breakdown
${Object.entries(ctx.topicStats || {}).map(([top, stat]) => `- **${top}:** ${stat.correct}/${stat.total} correct (${stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0}%)`).join("\n")}

---

## AI Diagnostic Analysis & Study Plan

`;
  }

  // Append conversation messages
  messages.forEach(msg => {
    if (msg.role === "user") {
      mdContent += `### 👤 Student Question:\n${msg.content}\n\n`;
    } else {
      mdContent += `### ✨ TestWise AI Response:\n${msg.content}\n\n`;
    }
  });

  const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

function copyAiResponse() {
  const messages = getCachedConversation(currentAiSessionKey);
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) {
    alert("No response available to copy.");
    return;
  }

  navigator.clipboard.writeText(lastAssistant.content).then(() => {
    const btn = document.getElementById("btn-ai-copy-response");
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✓ Copied!";
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  }).catch(err => {
    alert("Failed to copy to clipboard: " + err.message);
  });
}

function resetAiChat() {
  if (confirm("Start a new chat session for this item? Your current chat will be refreshed.")) {
    saveCachedConversation(currentAiSessionKey, []);
    renderAiMessages([]);
    if (currentAiMode === "question_tutor" && currentAiContext) {
      const initialPrompt = "Please analyze this question in detail: teach the concept being tested from the basics, explain what the question is asking, give the step-by-step reasoning, evaluate every option individually, explain common exam traps, and provide a memorable takeaway.";
      sendAiMessage(initialPrompt);
    } else if (currentAiContext) {
      const initialPrompt = "Please evaluate my overall test performance: provide a diagnostic breakdown of my strengths, high-priority improvement areas, cognitive error patterns, a topic-wise review table, and a prioritized study plan.";
      sendAiMessage(initialPrompt);
    }
  }
}

// Wire up global TestWise AI drawer listeners
function initTestWiseAiControls() {
  const closeBtn = document.getElementById("ai-drawer-close");
  const backdrop = document.getElementById("ai-drawer-backdrop");
  if (closeBtn) closeBtn.onclick = closeAiDrawer;
  if (backdrop) backdrop.onclick = closeAiDrawer;

  const sendBtn = document.getElementById("ai-drawer-send");
  const inputEl = document.getElementById("ai-drawer-input");

  if (sendBtn) {
    sendBtn.onclick = () => sendAiMessage();
  }

  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
      }
    };
    inputEl.oninput = () => {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
    };
  }

  const exportBtn = document.getElementById("btn-ai-export-notes");
  if (exportBtn) exportBtn.onclick = exportStudyNotes;

  const copyBtn = document.getElementById("btn-ai-copy-response");
  if (copyBtn) copyBtn.onclick = copyAiResponse;

  const newChatBtn = document.getElementById("btn-ai-new-chat");
  if (newChatBtn) newChatBtn.onclick = resetAiChat;
}

initTestWiseAiControls();


