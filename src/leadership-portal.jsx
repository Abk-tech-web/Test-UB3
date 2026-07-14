import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, LogIn, LogOut, User, Inbox, KeyRound, Send, CheckCircle2,
  Circle, Loader2, Mail, MessageCircle, Eye, EyeOff,
} from "lucide-react";
import { db } from "../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

/* ---------------------------------------------------------------------- */
/*  BRAND TOKENS — kept consistent with the public UB3 site               */
/* ---------------------------------------------------------------------- */
const T = {
  bg: "#F6F7F9", panel: "#FFFFFF", ink: "#0B1329", inkSoft: "#4B5468",
  inkFaint: "#8A93A6", line: "#E3E5EC", accent: "#3454D1", accentSoft: "#EAEEFC",
  dark: "#0B1329", darkPanel: "#121A38", darkLine: "#232C4C", darkMuted: "#93A0C2",
  danger: "#D14343", ok: "#2E9E5B",
};
const display = { fontFamily: "'Space Grotesk', sans-serif" };
const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const body = { fontFamily: "'IBM Plex Sans', sans-serif" };

const TEMP_PASSWORD = "UB3-Welcome-2026"; // every seeded account starts here; forced change on first login

const SECURITY_QUESTIONS = [
  "What was the name of your first school?",
  "What is your mother's maiden name?",
  "What was the make of your first car?",
  "What city were you born in?",
  "What was your childhood nickname?",
];

const SEED_LEADERS = [
  { id: "aisha", name: "Aisha", title: "Team Lead & Growth", dept: "Growth" },
  { id: "abubakar", name: "Abubakar", title: "Head of Technology", dept: "Technology" },
  { id: "sir-anas", name: "Sir Anas", title: "Head of Strategy & Negotiation", dept: "Strategy" },
  { id: "abdulkadeer", name: "Abdulkadeer", title: "Head of Community & Social Media", dept: "Community" },
  { id: "babagana", name: "Babagana", title: "Strategic Advisor", dept: "Advisory" },
  { id: "ameer", name: "Ameer", title: "Creative Lead", dept: "Creative" },
  { id: "musty", name: "Musty", title: "Head of Content & Partnership", dept: "Content & Partnerships" },
  { id: "muhammad", name: "Muhammad", title: "Head of Graphics & Community Growth", dept: "Graphics & Growth" },
];

/* ---------------------------------------------------------------------- */
/*  CRYPTO HELPERS — client-side only, see chat for caveats               */
/* ---------------------------------------------------------------------- */
function randomHex(bytes = 16) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}
function emailFor(name) {
  return `${name.toLowerCase().replace(/\s+/g, "")}@unbounddao.io`;
}
function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "leader";
}
function initials(name) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ---------------------------------------------------------------------- */
/*  STORAGE HELPERS                                                        */
/* ---------------------------------------------------------------------- */
// Persistence is backed by Firebase Firestore (see src/lib/firebase.js).
// Every key in this file is written as "shared" data (visible to every
// visitor), so we simply use the key as the Firestore document ID inside a
// single "portalData" collection.
function hasStorage() {
  return !!db;
}
async function getJSON(key, shared, fallback) {
  if (!hasStorage()) return fallback;
  try {
    const snap = await getDoc(doc(db, "portalData", key));
    return snap.exists() ? snap.data().value : fallback;
  } catch {
    return fallback;
  }
}
async function setJSON(key, value, shared) {
  if (!hasStorage()) return null;
  try {
    await setDoc(doc(db, "portalData", key), { value });
    return { key, value };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- */
/*  MAIN APP                                                               */
/* ---------------------------------------------------------------------- */
export default function LeadershipPortal() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(null);
  const [accounts, setAccounts] = useState({}); // id -> account record
  const [view, setView] = useState("directory"); // directory | profile | login | register | forgot | dashboard
  const [activeId, setActiveId] = useState(null);
  const [session, setSession] = useState(null); // logged-in leader id

  /* ---------- boot: seed + load ---------- */
  useEffect(() => {
    (async () => {
      try {
        if (!hasStorage()) {
          // No persistent storage available in this environment (e.g. running
          // outside the Claude artifact sandbox). Fall back to an in-memory,
          // seeded directory so the UI still renders instead of hanging.
          const map = {};
          for (const l of SEED_LEADERS) {
            const salt = randomHex();
            const passwordHash = await hashPassword(TEMP_PASSWORD, salt);
            map[l.id] = {
              id: l.id, name: l.name, title: l.title, dept: l.dept,
              email: emailFor(l.name), salt, passwordHash, mustChangePassword: true,
              bio: "", phone: "", telegram: "", x: "", availability: "available",
            };
          }
          setAccounts(map);
          setBootError("Running without persistent storage — changes made here won't be saved.");
          return;
        }

        let index = await getJSON("leader-index", true, null);
        if (!index) {
          index = SEED_LEADERS.map((l) => l.id);
          for (const l of SEED_LEADERS) {
            const salt = randomHex();
            const passwordHash = await hashPassword(TEMP_PASSWORD, salt);
            await setJSON(`leader-account:${l.id}`, {
              id: l.id, name: l.name, title: l.title, dept: l.dept,
              email: emailFor(l.name), salt, passwordHash, mustChangePassword: true,
              bio: "", phone: "", telegram: "", x: "", availability: "available",
            }, true);
          }
          await setJSON("leader-index", index, true);
        }
        const map = {};
        for (const id of index) {
          const acc = await getJSON(`leader-account:${id}`, true, null);
          if (acc) map[id] = acc;
        }
        setAccounts(map);
      } catch (err) {
        setBootError(err?.message || "Something went wrong while loading the portal.");
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const refreshAccount = useCallback(async (id) => {
    const acc = await getJSON(`leader-account:${id}`, true, null);
    if (acc) setAccounts((prev) => ({ ...prev, [id]: acc }));
  }, []);

  const openProfile = (id) => { setActiveId(id); setView("profile"); };
  const goDirectory = () => { setView("directory"); setActiveId(null); };
  const logout = () => { setSession(null); setView("directory"); setActiveId(null); };

  /* ---------- registration ---------- */
  const registerLeader = useCallback(async ({ name, email, title, dept, password, securityQuestion, securityAnswer }) => {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = Object.values(accounts).find((a) => a.email.toLowerCase() === normalizedEmail);
    if (existing) throw new Error("An account with that email already exists. Try signing in instead.");

    let id = slugify(name);
    let index = await getJSON("leader-index", true, Object.keys(accounts));
    let n = 2;
    while (index.includes(id) || accounts[id]) { id = `${slugify(name)}-${n}`; n++; }

    const salt = randomHex();
    const passwordHash = await hashPassword(password, salt);
    const answerSalt = randomHex();
    const securityAnswerHash = await hashPassword(securityAnswer.trim().toLowerCase(), answerSalt);
    const record = {
      id, name: name.trim(), title: title.trim() || "Team Member", dept: dept.trim() || "General",
      email: normalizedEmail, salt, passwordHash, mustChangePassword: false,
      securityQuestion, answerSalt, securityAnswerHash,
      bio: "", phone: "", telegram: "", x: "", availability: "available",
    };

    await setJSON(`leader-account:${id}`, record, true);
    index = [...index, id];
    await setJSON("leader-index", index, true);
    setAccounts((prev) => ({ ...prev, [id]: record }));
    return id;
  }, [accounts]);

  /* ---------- forgot password: verify security answer, then reset ---------- */
  const resetPassword = useCallback(async ({ email, securityAnswer, newPassword }) => {
    const normalizedEmail = email.toLowerCase().trim();
    const acc = Object.values(accounts).find((a) => a.email.toLowerCase() === normalizedEmail);
    if (!acc) throw new Error("No account found for that email.");
    if (acc.securityQuestion) {
      if (!acc.answerSalt || !acc.securityAnswerHash) throw new Error("This account has no recovery info on file. Contact an admin to reset your password.");
      const answerHash = await hashPassword((securityAnswer || "").trim().toLowerCase(), acc.answerSalt);
      if (answerHash !== acc.securityAnswerHash) throw new Error("That answer doesn't match what's on file.");
    }
    const salt = randomHex();
    const passwordHash = await hashPassword(newPassword, salt);
    const updated = { ...acc, salt, passwordHash, mustChangePassword: false };
    await setJSON(`leader-account:${acc.id}`, updated, true);
    setAccounts((prev) => ({ ...prev, [acc.id]: updated }));
    return acc.id;
  }, [accounts]);

  /* ---------- lookup account's security question by email (no secrets exposed) ---------- */
  const findSecurityQuestion = useCallback((email) => {
    const normalizedEmail = email.toLowerCase().trim();
    const acc = Object.values(accounts).find((a) => a.email.toLowerCase() === normalizedEmail);
    if (!acc) return { found: false };
    return { found: true, securityQuestion: acc.securityQuestion || null };
  }, [accounts]);

  /* ---------- set/update security question (used from dashboard, requires current password) ---------- */
  const setSecurityQuestion = useCallback(async (accountId, { currentPassword, securityQuestion, securityAnswer }) => {
    const acc = accounts[accountId];
    if (!acc) throw new Error("Account not found.");
    const curHash = await hashPassword(currentPassword, acc.salt);
    if (curHash !== acc.passwordHash) throw new Error("Current password is incorrect.");
    const answerSalt = randomHex();
    const securityAnswerHash = await hashPassword(securityAnswer.trim().toLowerCase(), answerSalt);
    const updated = { ...acc, securityQuestion, answerSalt, securityAnswerHash };
    await setJSON(`leader-account:${accountId}`, updated, true);
    setAccounts((prev) => ({ ...prev, [accountId]: updated }));
  }, [accounts]);

  if (booting) {
    return (
      <div style={{ ...body, background: T.bg, color: T.inkSoft }} className="min-h-screen w-full flex items-center justify-center">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ ...body, background: T.bg, color: T.ink }} className="min-h-screen w-full">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .focus-ring:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
        .lift { transition: transform .3s ease, box-shadow .3s ease; }
        .lift:hover { transform: translateY(-3px); box-shadow: 0 16px 32px -16px rgba(11,19,41,0.22); }
        input, textarea, select { font-family: inherit; }
        @media (prefers-reduced-motion: reduce) { * { transition-duration: .01ms !important; animation-duration: .01ms !important; } }
      `}</style>

      <TopBar session={session} accounts={accounts} onHome={goDirectory} onLogin={() => setView("login")}
        onRegister={() => setView("register")} onDashboard={() => setView("dashboard")} onLogout={logout} />

      {bootError && (
        <div style={{ background: "#FFF4E5", borderBottom: `1px solid ${T.line}`, color: "#8A5A00", fontSize: 13 }}
          className="px-6 py-2 text-center">
          {bootError}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-10">
        {view === "directory" && <Directory accounts={accounts} onOpen={openProfile} />}
        {view === "profile" && activeId && (
          <PublicProfile account={accounts[activeId]} onBack={goDirectory} />
        )}
        {view === "login" && (
          <Login accounts={accounts} onSuccess={(id) => { setSession(id); setView("dashboard"); }} onBack={goDirectory}
            onGoRegister={() => setView("register")} onGoForgot={() => setView("forgot")} />
        )}
        {view === "register" && (
          <Register onRegister={registerLeader} onSuccess={(id) => { setSession(id); setView("dashboard"); }}
            onBack={goDirectory} onGoLogin={() => setView("login")} />
        )}
        {view === "forgot" && (
          <ForgotPassword onLookup={findSecurityQuestion} onReset={resetPassword} onDone={() => setView("login")} onBack={() => setView("login")} />
        )}
        {view === "dashboard" && session && (
          <Dashboard account={accounts[session]} onSaved={() => refreshAccount(session)} onLogout={logout}
            onSetSecurityQuestion={(fields) => setSecurityQuestion(session, fields)} />
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  TOP BAR                                                                 */
/* ---------------------------------------------------------------------- */
function TopBar({ session, accounts, onHome, onLogin, onRegister, onDashboard, onLogout }) {
  return (
    <header style={{ borderBottom: `1px solid ${T.line}`, background: T.panel }}>
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <button onClick={onHome} className="focus-ring flex items-center gap-2">
          <div style={{ width: 28, height: 28, borderRadius: 8, background: T.ink }} className="flex items-center justify-center">
            <span style={{ ...display, color: T.bg, fontSize: 12, fontWeight: 700 }}>UB3</span>
          </div>
          <span style={{ ...display, fontWeight: 600, fontSize: 15 }}>Leadership Portal</span>
        </button>
        {session ? (
          <div className="flex items-center gap-3">
            <button onClick={onDashboard} className="focus-ring text-sm" style={{ color: T.inkSoft, fontWeight: 500 }}>
              {accounts[session]?.name}'s dashboard
            </button>
            <button onClick={onLogout} className="focus-ring flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full"
              style={{ border: `1px solid ${T.line}`, color: T.inkSoft }}>
              <LogOut size={14} /> Log out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={onRegister} className="focus-ring text-sm px-3.5 py-2 rounded-full"
              style={{ border: `1px solid ${T.line}`, color: T.inkSoft, fontWeight: 500 }}>
              Register
            </button>
            <button onClick={onLogin} className="focus-ring flex items-center gap-1.5 text-sm px-4 py-2 rounded-full"
              style={{ background: T.ink, color: T.bg, fontWeight: 500 }}>
              <LogIn size={14} /> Leader sign in
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------- */
/*  PUBLIC DIRECTORY                                                        */
/* ---------------------------------------------------------------------- */
function Directory({ accounts, onOpen }) {
  const list = Object.values(accounts);
  return (
    <div>
      <div style={{ ...mono, color: T.accent, fontSize: 12, letterSpacing: 2 }} className="uppercase mb-3">UB3 Leadership</div>
      <h1 style={{ ...display, fontSize: "clamp(1.6rem, 3vw, 2.1rem)", fontWeight: 600 }}>Meet the team</h1>
      <p style={{ color: T.inkSoft, marginTop: 8, maxWidth: 500 }}>
        Browse profiles and message any leader directly — replies land in their private inbox.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
        {list.map((l) => (
          <button key={l.id} onClick={() => onOpen(l.id)}
            className="lift focus-ring text-left p-5 rounded-2xl" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg, ${T.accent}, ${T.ink})` }}
              className="flex items-center justify-center">
              <span style={{ ...display, color: "white", fontWeight: 600 }}>{initials(l.name)}</span>
            </div>
            <h3 style={{ ...display, fontWeight: 600, fontSize: 15 }} className="mt-3">{l.name}</h3>
            <p style={{ color: T.accent, fontSize: 12.5, fontWeight: 500 }} className="mt-0.5">{l.title}</p>
            <AvailabilityDot status={l.availability} className="mt-3" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AvailabilityDot({ status, className = "" }) {
  const map = {
    available: { color: T.ok, label: "Available" },
    busy: { color: "#D18C34", label: "Busy" },
    away: { color: T.inkFaint, label: "Away" },
  };
  const s = map[status] || map.available;
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Circle size={8} fill={s.color} color={s.color} />
      <span style={{ fontSize: 12, color: T.inkSoft }}>{s.label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  PUBLIC PROFILE + MESSAGE FORM                                          */
/* ---------------------------------------------------------------------- */
function PublicProfile({ account, onBack }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [thread, setThread] = useState(null);
  const [checkEmail, setCheckEmail] = useState("");
  const [checking, setChecking] = useState(false);

  if (!account) return null;

  const send = async (e) => {
    e.preventDefault();
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || msg.trim().length < 5) {
      setError("Enter your name, a valid email, and a short message.");
      return;
    }
    setError("");
    const key = `thread:${account.id}:${email.toLowerCase()}`;
    const existing = await getJSON(key, true, []);
    existing.push({ from: "visitor", name, body: msg.trim(), ts: Date.now() });
    await setJSON(key, existing, true);
    const idxKey = `thread-index:${account.id}`;
    const idx = await getJSON(idxKey, true, []);
    if (!idx.includes(email.toLowerCase())) {
      idx.push(email.toLowerCase());
      await setJSON(idxKey, idx, true);
    }
    setSent(true);
    setMsg("");
  };

  const checkReplies = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkEmail)) return;
    setChecking(true);
    const t = await getJSON(`thread:${account.id}:${checkEmail.toLowerCase()}`, true, []);
    setThread(t);
    setChecking(false);
  };

  return (
    <div>
      <button onClick={onBack} className="focus-ring flex items-center gap-1.5 text-sm mb-6" style={{ color: T.inkSoft }}>
        <ArrowLeft size={15} /> Back to directory
      </button>

      <div className="grid md:grid-cols-[220px_1fr] gap-8">
        <div>
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: `linear-gradient(135deg, ${T.accent}, ${T.ink})` }}
            className="flex items-center justify-center">
            <span style={{ ...display, color: "white", fontWeight: 600, fontSize: 26 }}>{initials(account.name)}</span>
          </div>
          <h1 style={{ ...display, fontWeight: 600, fontSize: 20 }} className="mt-4">{account.name}</h1>
          <p style={{ color: T.accent, fontSize: 13, fontWeight: 500 }} className="mt-1">{account.title}</p>
          <p style={{ color: T.inkFaint, fontSize: 12.5 }} className="mt-0.5">{account.dept}</p>
          <AvailabilityDot status={account.availability} className="mt-3" />
          <div className="flex gap-2 mt-4">
            {account.telegram && (
              <a href={account.telegram} target="_blank" rel="noopener noreferrer" className="focus-ring p-2 rounded-full" style={{ border: `1px solid ${T.line}` }}>
                <Send size={14} style={{ color: T.inkSoft }} />
              </a>
            )}
            {account.x && (
              <a href={account.x} target="_blank" rel="noopener noreferrer" className="focus-ring p-2 rounded-full" style={{ border: `1px solid ${T.line}` }}>
                <MessageCircle size={14} style={{ color: T.inkSoft }} />
              </a>
            )}
          </div>
        </div>

        <div>
          <div className="p-5 rounded-2xl" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <h3 style={{ ...display, fontWeight: 600, fontSize: 14 }} className="mb-2">About</h3>
            <p style={{ color: T.inkSoft, fontSize: 14, lineHeight: 1.6 }}>
              {account.bio || `${account.name} hasn't added a bio yet.`}
            </p>
          </div>

          <div className="p-5 rounded-2xl mt-5" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <h3 style={{ ...display, fontWeight: 600, fontSize: 14 }} className="mb-3">Send a message</h3>
            {sent ? (
              <div className="flex items-center gap-2" style={{ color: T.ok, fontSize: 14 }}>
                <CheckCircle2 size={16} /> Message sent — {account.name} will see it in their inbox.
              </div>
            ) : (
              <form onSubmit={send} className="space-y-3">
                <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)}
                  className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
                <input placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
                <textarea placeholder="Your message" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)}
                  className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm resize-none" style={{ border: `1px solid ${T.line}` }} />
                {error && <p style={{ color: T.danger, fontSize: 12.5 }}>{error}</p>}
                <button type="submit" className="focus-ring flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
                  style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
                  <Send size={14} /> Send
                </button>
              </form>
            )}
          </div>

          <div className="p-5 rounded-2xl mt-5" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
            <h3 style={{ ...display, fontWeight: 600, fontSize: 14 }} className="mb-2">Already messaged? Check for replies</h3>
            <div className="flex gap-2">
              <input placeholder="The email you messaged from" value={checkEmail} onChange={(e) => setCheckEmail(e.target.value)}
                className="focus-ring flex-1 px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
              <button onClick={checkReplies} className="focus-ring px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }}>
                {checking ? <Loader2 size={14} className="animate-spin" /> : "Check"}
              </button>
            </div>
            {thread && (
              <div className="mt-4 space-y-2 max-h-56 overflow-y-auto">
                {thread.length === 0 && <p style={{ color: T.inkFaint, fontSize: 13 }}>No messages found for that email yet.</p>}
                {thread.map((m, i) => (
                  <div key={i} className="p-2.5 rounded-lg text-sm" style={{
                    background: m.from === "leader" ? T.accentSoft : T.panel,
                    border: `1px solid ${T.line}`,
                  }}>
                    <div style={{ fontSize: 11, color: T.inkFaint }} className="mb-0.5">
                      {m.from === "leader" ? account.name : "You"} · {timeAgo(m.ts)}
                    </div>
                    {m.body}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  LOGIN                                                                   */
/* ---------------------------------------------------------------------- */
function Login({ accounts, onSuccess, onBack, onGoRegister, onGoForgot }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!accounts || Object.keys(accounts).length === 0) {
        setError("Leader accounts haven't loaded yet — please wait a moment and try again.");
        return;
      }
      const acc = Object.values(accounts).find((a) => a.email.toLowerCase() === email.toLowerCase().trim());
      if (!acc) { setError("No account found for that email."); return; }
      const hash = await hashPassword(password, acc.salt);
      if (hash !== acc.passwordHash) { setError("Incorrect password."); return; }
      onSuccess(acc.id);
    } catch (err) {
      console.error("Login failed:", err);
      setError(err?.message || "Something went wrong signing in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <button onClick={onBack} className="focus-ring flex items-center gap-1.5 text-sm mb-6" style={{ color: T.inkSoft }}>
        <ArrowLeft size={15} /> Back
      </button>
      <h1 style={{ ...display, fontWeight: 600, fontSize: 20 }}>Leader sign in</h1>
      <p style={{ color: T.inkSoft, fontSize: 13.5 }} className="mt-1.5">Use the email and password set up for your profile.</p>
      <form onSubmit={submit} className="space-y-3 mt-6">
        <input type="email" required placeholder="you@unbounddao.io" value={email} onChange={(e) => setEmail(e.target.value)}
          className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        <div className="relative">
          <input type={showPassword ? "text" : "password"} required placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring w-full px-3 py-2.5 pr-10 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          <button type="button" onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="focus-ring absolute right-0 top-0 h-full px-3 flex items-center"
            style={{ color: T.inkFaint }}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && <p style={{ color: T.danger, fontSize: 12.5 }}>{error}</p>}
        <button type="submit" disabled={busy} className="focus-ring w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm"
          style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Sign in
        </button>
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={onGoForgot} className="focus-ring text-sm" style={{ color: T.accent, fontWeight: 500 }}>
            Forgot password?
          </button>
          <button type="button" onClick={onGoRegister} className="focus-ring text-sm" style={{ color: T.inkSoft, fontWeight: 500 }}>
            New leader? Register
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  REGISTER                                                                */
/* ---------------------------------------------------------------------- */
function Register({ onRegister, onSuccess, onBack, onGoLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Enter your full name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email address."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (!securityAnswer.trim()) { setError("Answer your security question — it's used to recover your account."); return; }
    setBusy(true);
    try {
      const id = await onRegister({ name, email, title, dept, password, securityQuestion, securityAnswer });
      onSuccess(id);
    } catch (err) {
      setError(err?.message || "Something went wrong creating your account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <button onClick={onBack} className="focus-ring flex items-center gap-1.5 text-sm mb-6" style={{ color: T.inkSoft }}>
        <ArrowLeft size={15} /> Back
      </button>
      <h1 style={{ ...display, fontWeight: 600, fontSize: 20 }}>Create your leader account</h1>
      <p style={{ color: T.inkSoft, fontSize: 13.5 }} className="mt-1.5">Set up your profile so visitors can find and message you.</p>
      <form onSubmit={submit} className="space-y-3 mt-6">
        <input required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)}
          className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        <input type="email" required placeholder="you@unbounddao.io" value={email} onChange={(e) => setEmail(e.target.value)}
          className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Job title" value={title} onChange={(e) => setTitle(e.target.value)}
            className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          <input placeholder="Department" value={dept} onChange={(e) => setDept(e.target.value)}
            className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        </div>
        <div className="relative">
          <input type={showPassword ? "text" : "password"} required placeholder="Password (min. 8 characters)" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring w-full px-3 py-2.5 pr-10 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          <button type="button" onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="focus-ring absolute right-0 top-0 h-full px-3 flex items-center" style={{ color: T.inkFaint }}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <input type={showPassword ? "text" : "password"} required placeholder="Confirm password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        <Field label="Security question (used to recover your account)">
          <select value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)}
            className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }}>
            {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </Field>
        <input required placeholder="Your answer" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)}
          className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        {error && <p style={{ color: T.danger, fontSize: 12.5 }}>{error}</p>}
        <button type="submit" disabled={busy} className="focus-ring w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm"
          style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <User size={14} />} Create account
        </button>
        <div className="text-center pt-1">
          <button type="button" onClick={onGoLogin} className="focus-ring text-sm" style={{ color: T.inkSoft, fontWeight: 500 }}>
            Already have an account? Sign in
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  FORGOT PASSWORD (verify email → set new password)                      */
/* ---------------------------------------------------------------------- */
function ForgotPassword({ onLookup, onReset, onDone, onBack }) {
  const [step, setStep] = useState("email"); // email | reset
  const [email, setEmail] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(null);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submitEmail = (e) => {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter the email on your account."); return; }
    const result = onLookup(email);
    if (!result.found) { setError("No account found for that email."); return; }
    setSecurityQuestion(result.securityQuestion);
    setStep("reset");
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setError("");
    if (securityQuestion && !securityAnswer.trim()) { setError("Answer your security question."); return; }
    if (password.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      await onReset({ email, securityAnswer, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err?.message || "Something went wrong resetting your password.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-sm mx-auto">
        <div className="p-6 rounded-2xl" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2" style={{ color: T.ok }}>
            <CheckCircle2 size={18} /> Password reset.
          </div>
          <p style={{ color: T.inkSoft, fontSize: 13.5 }} className="mt-2">You can now sign in with your new password.</p>
          <button onClick={onDone} className="focus-ring mt-4 px-5 py-2.5 rounded-lg text-sm"
            style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  if (step === "email") {
    return (
      <div className="max-w-sm mx-auto">
        <button onClick={onBack} className="focus-ring flex items-center gap-1.5 text-sm mb-6" style={{ color: T.inkSoft }}>
          <ArrowLeft size={15} /> Back to sign in
        </button>
        <h1 style={{ ...display, fontWeight: 600, fontSize: 20 }}>Reset your password</h1>
        <p style={{ color: T.inkSoft, fontSize: 13.5 }} className="mt-1.5">Enter the email on your account to continue.</p>
        <form onSubmit={submitEmail} className="space-y-3 mt-6">
          <input type="email" required placeholder="you@unbounddao.io" value={email} onChange={(e) => setEmail(e.target.value)}
            className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          {error && <p style={{ color: T.danger, fontSize: 12.5 }}>{error}</p>}
          <button type="submit" className="focus-ring w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm"
            style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
            Continue
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto">
      <button onClick={() => setStep("email")} className="focus-ring flex items-center gap-1.5 text-sm mb-6" style={{ color: T.inkSoft }}>
        <ArrowLeft size={15} /> Back
      </button>
      <h1 style={{ ...display, fontWeight: 600, fontSize: 20 }}>Verify and set a new password</h1>
      {!securityQuestion && (
        <p style={{ color: "#8A6416", fontSize: 12.5, background: "#FFF6E5", border: "1px solid #F0D9A0" }} className="mt-3 p-2.5 rounded-lg">
          This account has no security question on file, so anyone with this email can reset it here. Set one up from your dashboard's Password tab after signing in.
        </p>
      )}
      <form onSubmit={submitReset} className="space-y-3 mt-6">
        {securityQuestion && (
          <Field label={securityQuestion}>
            <input required value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)}
              className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          </Field>
        )}
        <div className="relative">
          <input type={showPassword ? "text" : "password"} required placeholder="New password (min. 8 characters)" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring w-full px-3 py-2.5 pr-10 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          <button type="button" onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="focus-ring absolute right-0 top-0 h-full px-3 flex items-center" style={{ color: T.inkFaint }}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <input type={showPassword ? "text" : "password"} required placeholder="Confirm new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        {error && <p style={{ color: T.danger, fontSize: 12.5 }}>{error}</p>}
        <button type="submit" disabled={busy} className="focus-ring w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm"
          style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Reset password
        </button>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  DASHBOARD                                                               */
/* ---------------------------------------------------------------------- */
function Dashboard({ account, onSaved, onLogout, onSetSecurityQuestion }) {
  const [tab, setTab] = useState(account?.mustChangePassword ? "password" : "profile");
  if (!account) return null;
  const locked = account.mustChangePassword;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ ...display, fontWeight: 600, fontSize: 20 }}>Welcome, {account.name}</h1>
          <p style={{ color: T.inkSoft, fontSize: 13.5 }}>{account.title} · {account.dept}</p>
        </div>
      </div>

      {locked && (
        <div className="p-3 rounded-xl mb-5 text-sm" style={{ background: "#FFF6E5", border: "1px solid #F0D9A0", color: "#8A6416" }}>
          For security, set a new password before using the rest of your dashboard.
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <TabBtn active={tab === "profile"} disabled={locked} onClick={() => setTab("profile")} icon={User} label="Profile" />
        <TabBtn active={tab === "inbox"} disabled={locked} onClick={() => setTab("inbox")} icon={Inbox} label="Inbox" />
        <TabBtn active={tab === "password"} disabled={false} onClick={() => setTab("password")} icon={KeyRound} label="Password" />
      </div>

      {tab === "profile" && !locked && <ProfileTab account={account} onSaved={onSaved} />}
      {tab === "inbox" && !locked && <InboxTab account={account} />}
      {tab === "password" && <PasswordTab account={account} onSaved={onSaved} forced={locked} onSetSecurityQuestion={onSetSecurityQuestion} />}
    </div>
  );
}

function TabBtn({ active, disabled, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} disabled={disabled} className="focus-ring flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm"
      style={{
        background: active ? T.ink : "transparent", color: active ? T.bg : disabled ? T.inkFaint : T.inkSoft,
        border: `1px solid ${active ? T.ink : T.line}`, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer",
      }}>
      <Icon size={14} /> {label}
    </button>
  );
}

function ProfileTab({ account, onSaved }) {
  const [form, setForm] = useState({
    title: account.title, dept: account.dept, bio: account.bio || "",
    phone: account.phone || "", telegram: account.telegram || "", x: account.x || "",
    availability: account.availability || "available",
  });
  const [saved, setSaved] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    await setJSON(`leader-account:${account.id}`, { ...account, ...form }, true);
    setSaved(true);
    onSaved();
    setTimeout(() => setSaved(false), 2000);
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={save} className="max-w-xl space-y-4 p-6 rounded-2xl" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Job title"><input value={form.title} onChange={set("title")} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Department"><input value={form.dept} onChange={set("dept")} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
      </div>
      <Field label="Bio">
        <textarea rows={4} value={form.bio} onChange={set("bio")} placeholder="Tell visitors about your role"
          className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm resize-none" style={{ border: `1px solid ${T.line}` }} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Phone (optional)"><input value={form.phone} onChange={set("phone")} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Availability">
          <select value={form.availability} onChange={set("availability")} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }}>
            <option value="available">Available</option>
            <option value="busy">Busy</option>
            <option value="away">Away</option>
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Telegram link"><input value={form.telegram} onChange={set("telegram")} placeholder="https://t.me/yourhandle" className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="X link"><input value={form.x} onChange={set("x")} placeholder="https://x.com/yourhandle" className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
      </div>
      <button type="submit" className="focus-ring px-5 py-2.5 rounded-lg text-sm" style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
        Save changes
      </button>
      {saved && <span style={{ color: T.ok, fontSize: 13 }} className="ml-3">Saved</span>}
    </form>
  );
}

function InboxTab({ account }) {
  const [emails, setEmails] = useState([]);
  const [threads, setThreads] = useState({});
  const [openEmail, setOpenEmail] = useState(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const idx = await getJSON(`thread-index:${account.id}`, true, []);
    setEmails(idx);
    const map = {};
    for (const em of idx) map[em] = await getJSON(`thread:${account.id}:${em}`, true, []);
    setThreads(map);
    setLoading(false);
  }, [account.id]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!reply.trim() || !openEmail) return;
    const key = `thread:${account.id}:${openEmail}`;
    const t = threads[openEmail] || [];
    t.push({ from: "leader", body: reply.trim(), ts: Date.now() });
    await setJSON(key, t, true);
    setThreads({ ...threads, [openEmail]: t });
    setReply("");
  };

  if (loading) return <Loader2 size={18} className="animate-spin" style={{ color: T.inkFaint }} />;
  if (emails.length === 0) return <p style={{ color: T.inkFaint, fontSize: 14 }}>No messages yet. Visitors who message you from your public profile will show up here.</p>;

  return (
    <div className="grid md:grid-cols-[240px_1fr] gap-5">
      <div className="space-y-2">
        {emails.map((em) => {
          const t = threads[em] || [];
          const last = t[t.length - 1];
          const awaitingReply = last && last.from === "visitor";
          return (
            <button key={em} onClick={() => setOpenEmail(em)}
              className="focus-ring w-full text-left p-3 rounded-xl text-sm"
              style={{ background: openEmail === em ? T.accentSoft : T.panel, border: `1px solid ${T.line}` }}>
              <div className="flex items-center justify-between">
                <span style={{ fontWeight: 600 }}>{t.find((m) => m.name)?.name || em}</span>
                {awaitingReply && <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent }} />}
              </div>
              <p style={{ color: T.inkFaint, fontSize: 12 }} className="truncate mt-0.5">{last?.body}</p>
            </button>
          );
        })}
      </div>
      <div>
        {openEmail ? (
          <div>
            <div className="space-y-2 max-h-80 overflow-y-auto p-1">
              {(threads[openEmail] || []).map((m, i) => (
                <div key={i} className="p-2.5 rounded-lg text-sm" style={{
                  background: m.from === "leader" ? T.ink : T.panel,
                  color: m.from === "leader" ? T.bg : T.ink,
                  border: `1px solid ${T.line}`, maxWidth: "85%",
                  marginLeft: m.from === "leader" ? "auto" : 0,
                }}>
                  {m.body}
                  <div style={{ fontSize: 10.5, opacity: 0.6 }} className="mt-1">{timeAgo(m.ts)}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply"
                className="focus-ring flex-1 px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
              <button onClick={send} className="focus-ring px-4 py-2.5 rounded-lg text-sm" style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
                <Send size={14} />
              </button>
            </div>
          </div>
        ) : (
          <p style={{ color: T.inkFaint, fontSize: 14 }}>Select a conversation to read and reply.</p>
        )}
      </div>
    </div>
  );
}

function PasswordTab({ account, onSaved, forced, onSetSecurityQuestion }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const [sqCurrent, setSqCurrent] = useState("");
  const [sqQuestion, setSqQuestion] = useState(account.securityQuestion || SECURITY_QUESTIONS[0]);
  const [sqAnswer, setSqAnswer] = useState("");
  const [sqError, setSqError] = useState("");
  const [sqDone, setSqDone] = useState(false);
  const [sqBusy, setSqBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const curHash = await hashPassword(current, account.salt);
    if (curHash !== account.passwordHash) { setError("Current password is incorrect."); return; }
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("New passwords don't match."); return; }
    const salt = randomHex();
    const passwordHash = await hashPassword(next, salt);
    await setJSON(`leader-account:${account.id}`, { ...account, salt, passwordHash, mustChangePassword: false }, true);
    setDone(true);
    onSaved();
  };

  const submitSecurity = async (e) => {
    e.preventDefault();
    setSqError("");
    if (!sqAnswer.trim()) { setSqError("Enter an answer."); return; }
    setSqBusy(true);
    try {
      await onSetSecurityQuestion({ currentPassword: sqCurrent, securityQuestion: sqQuestion, securityAnswer: sqAnswer });
      setSqDone(true);
      setSqCurrent(""); setSqAnswer("");
      onSaved();
    } catch (err) {
      setSqError(err?.message || "Something went wrong saving your security question.");
    } finally {
      setSqBusy(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-sm p-6 rounded-2xl" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-2" style={{ color: T.ok }}>
          <CheckCircle2 size={18} /> Password updated.
        </div>
        {forced && <p style={{ color: T.inkSoft, fontSize: 13.5 }} className="mt-2">Reopen your dashboard to continue.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="max-w-sm space-y-3 p-6 rounded-2xl" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
        <h3 style={{ ...display, fontWeight: 600, fontSize: 14 }}>Change password</h3>
        <Field label="Current password">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        </Field>
        <Field label="New password">
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        </Field>
        <Field label="Confirm new password">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
        </Field>
        {error && <p style={{ color: T.danger, fontSize: 12.5 }}>{error}</p>}
        <button type="submit" className="focus-ring px-5 py-2.5 rounded-lg text-sm" style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
          Update password
        </button>
      </form>

      {!forced && (
        <form onSubmit={submitSecurity} className="max-w-sm space-y-3 p-6 rounded-2xl" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
          <h3 style={{ ...display, fontWeight: 600, fontSize: 14 }}>Account recovery</h3>
          <p style={{ color: T.inkSoft, fontSize: 12.5 }}>
            {account.securityQuestion
              ? "Update the security question used to verify you when resetting your password."
              : "You don't have a security question set — anyone who knows your email can currently reset your password. Set one up here."}
          </p>
          <Field label="Current password">
            <input type="password" value={sqCurrent} onChange={(e) => setSqCurrent(e.target.value)} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          </Field>
          <Field label="Security question">
            <select value={sqQuestion} onChange={(e) => setSqQuestion(e.target.value)}
              className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }}>
              {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </Field>
          <Field label="Answer">
            <input value={sqAnswer} onChange={(e) => setSqAnswer(e.target.value)} className="focus-ring w-full px-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          </Field>
          {sqError && <p style={{ color: T.danger, fontSize: 12.5 }}>{sqError}</p>}
          <button type="submit" disabled={sqBusy} className="focus-ring px-5 py-2.5 rounded-lg text-sm" style={{ background: T.ink, color: T.bg, fontWeight: 600 }}>
            {sqBusy ? <Loader2 size={14} className="animate-spin" /> : "Save security question"}
          </button>
          {sqDone && <span style={{ color: T.ok, fontSize: 13 }} className="ml-3">Saved</span>}
        </form>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft }} className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
