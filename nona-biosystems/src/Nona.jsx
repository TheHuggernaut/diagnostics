import { useState, useEffect, useRef } from "react";

/* ============================================================
   NONA BIOSYSTEMS · bioweave — STANDALONE
   Freeform notes in. Structured threads out.
   Journal → mood/habit data → weave. Meals → macros → fuel.

   Standalone notes:
   - Persistence: localStorage (this browser only).
   - AI parsing: needs either an Anthropic API key (stored
     locally, personal use only — never ship a page with your
     key to other people) or a relay URL that accepts
     {system, user} POSTs and forwards to the Messages API.
   ============================================================ */

const JOURNAL_KEY = "nona-journal-v1";
const MEALS_KEY = "nona-meals-v1";
const SETTINGS_KEY = "nona-settings-v1";
const API_KEY = "nona-api-v1";

const DEFAULT_SETTINGS = { calories: 2450, protein: 200, fat: 70 };

const HABITS = [
  { key: "meds", label: "meds", glyph: "✚", good: true },
  { key: "slept_ok", label: "sleep", glyph: "☾", good: true },
  { key: "exercise", label: "lift", glyph: "▲", good: true },
  { key: "social", label: "out", glyph: "◍", good: true },
  { key: "caffeine", label: "caffeine", glyph: "◉", numeric: true },
  { key: "overate", label: "overate", glyph: "✕", good: false },
  { key: "ate_out", label: "ate out", glyph: "◇", good: false },
  { key: "alcohol", label: "alcohol", glyph: "≈", good: false },
];

const C = {
  bg: "#16130f",
  panel: "#1e1a14",
  panel2: "#241f18",
  ink: "#e6dccb",
  dim: "#8a7f6e",
  faint: "#5a5245",
  line: "#2c261e",
  gold: "#c9a44c",
  moss: "#7d925a",
  rust: "#b05c3f",
  slate: "#7d99ab",
};

/* ---------- api ---------- */

async function askClaude(system, user, cfg) {
  let res;
  if (cfg.relayUrl) {
    res = await fetch(cfg.relayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user }),
    });
  } else {
    if (!cfg.apiKey) throw new Error("no-key");
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  }
  if (!res.ok) throw new Error(`api-${res.status}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const JOURNAL_SYSTEM = (today) => `You parse freeform personal journal notes into structured tracking data.
Today's date is ${today}. Notes may cover multiple days ("Yesterday...", "Today 11:24...") — emit one entry per day, resolving relative dates against today.
Return ONLY valid JSON. No markdown fences, no preamble.
Schema:
{"entries":[{"date":"YYYY-MM-DD","mood":<integer 1-10>,"habits":{"meds":true|false|null,"slept_ok":true|false|null,"exercise":true|false|null,"social":true|false|null,"caffeine":<integer count or null>,"overate":true|false|null,"ate_out":true|false|null,"alcohol":true|false|null},"tags":["short","lowercase"],"summary":"one dry sentence"}]}
Rules: use null for anything not mentioned. "forgot my meds" => meds:false. "coffee" mentions count toward caffeine. Eating "way too much" => overate:true. Going out to sit in public, restaurants, seeing people => social:true. Mood: infer from explicit emotion words first ("sad" pulls low, "felt pretty good" pulls high), tone second. 5 is neutral. Keep summaries factual, not therapeutic.`;

const MEAL_SYSTEM = `You estimate nutrition from freeform meal descriptions. Be realistic with portion assumptions; note assumptions in item names when you make them (e.g. "chicken breast (8oz)").
Return ONLY valid JSON. No fences, no preamble.
Schema: {"items":[{"name":"...","calories":<int>,"protein_g":<int>,"carbs_g":<int>,"fat_g":<int>}]}`;

/* ---------- storage helpers ---------- */

function loadKey(key, fallback) {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : fallback;
  } catch {
    return fallback;
  }
}
function saveKey(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ---------- small pieces ---------- */

function MoodChip({ mood }) {
  const t = mood >= 7 ? C.moss : mood <= 4 ? C.rust : C.gold;
  return (
    <span className="mood-chip" style={{ color: t, borderColor: t }}>
      {mood}
    </span>
  );
}

function HabitGlyphs({ habits }) {
  return (
    <span className="glyph-row">
      {HABITS.map((h) => {
        const v = habits?.[h.key];
        if (v === null || v === undefined || v === false || v === 0) return null;
        const tone = h.numeric ? C.gold : h.good ? C.moss : C.rust;
        return (
          <span key={h.key} title={h.label} style={{ color: tone }}>
            {h.glyph}
            {h.numeric && v > 1 ? <sub>{v}</sub> : null}
          </span>
        );
      })}
    </span>
  );
}

/* ---------- weave chart (signature) ---------- */

function WeaveChart({ entries }) {
  // last 14 entries, oldest → newest
  const rows = [...entries]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-14);
  if (rows.length < 2)
    return <p className="empty">Two or more days woven and the thread appears here.</p>;

  const W = 640, H = 170, padX = 34, padY = 18;
  const habitRowH = 15;
  const gridH = HABITS.length * habitRowH;
  const step = (W - padX * 2) / (rows.length - 1);
  const x = (i) => padX + i * step;
  const y = (m) => padY + (H - padY * 2) * (1 - (m - 1) / 9);

  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r.mood)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H + gridH + 30}`} className="weave-svg" preserveAspectRatio="xMidYMid meet">
      {/* mood guide lines */}
      {[2, 5, 8].map((m) => (
        <g key={m}>
          <line x1={padX} x2={W - padX} y1={y(m)} y2={y(m)} stroke={C.line} strokeWidth="1" />
          <text x={padX - 8} y={y(m) + 3} textAnchor="end" className="svg-dim">{m}</text>
        </g>
      ))}
      {/* the thread */}
      <path d={path} fill="none" stroke={C.gold} strokeWidth="1.6" />
      {rows.map((r, i) => (
        <circle key={r.date} cx={x(i)} cy={y(r.mood)} r="3" fill={C.bg} stroke={C.gold} strokeWidth="1.5" />
      ))}
      {/* warp: habit grid beneath */}
      {HABITS.map((h, hi) => {
        const ry = H + 10 + hi * habitRowH;
        return (
          <g key={h.key}>
            <text x={padX - 8} y={ry + 4} textAnchor="end" className="svg-dim">{h.label}</text>
            <line x1={padX} x2={W - padX} y1={ry} y2={ry} stroke={C.line} strokeWidth="0.5" />
            {rows.map((r, i) => {
              const v = r.habits?.[h.key];
              if (v === null || v === undefined) return null;
              const on = h.numeric ? v > 0 : v === true;
              if (!on)
                return <circle key={i} cx={x(i)} cy={ry} r="1.5" fill={C.faint} />;
              const tone = h.numeric ? C.gold : h.good ? C.moss : C.rust;
              return <circle key={i} cx={x(i)} cy={ry} r="3.4" fill={tone} opacity="0.9" />;
            })}
          </g>
        );
      })}
      {/* day labels */}
      {rows.map((r, i) => (
        <text key={r.date} x={x(i)} y={H + gridH + 26} textAnchor="middle" className="svg-dim">
          {r.date.slice(5).replace("-", "/")}
        </text>
      ))}
    </svg>
  );
}

/* ---------- correlations ---------- */

function Correlations({ entries }) {
  const stats = HABITS.filter((h) => !h.numeric).map((h) => {
    const w = [], wo = [];
    entries.forEach((e) => {
      const v = e.habits?.[h.key];
      if (v === true) w.push(e.mood);
      else if (v === false) wo.push(e.mood);
    });
    const avg = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : null);
    return { ...h, withAvg: avg(w), withoutAvg: avg(wo), n: w.length + wo.length };
  }).filter((s) => s.withAvg !== null && s.withoutAvg !== null);

  if (!stats.length)
    return <p className="empty">Correlations surface once a habit has days on both sides of it.</p>;

  return (
    <div className="corr">
      {stats.map((s) => {
        const delta = s.withAvg - s.withoutAvg;
        const tone = delta >= 0 ? C.moss : C.rust;
        return (
          <div key={s.key} className="corr-row">
            <span className="corr-label">{s.glyph} {s.label}</span>
            <span className="corr-vals">
              with <b>{s.withAvg.toFixed(1)}</b> · without <b>{s.withoutAvg.toFixed(1)}</b>
            </span>
            <span className="corr-delta" style={{ color: tone }}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(1)}
            </span>
          </div>
        );
      })}
      <p className="fine">Mood averages on days with vs. without each thread. Small samples lie; let it accumulate.</p>
    </div>
  );
}

/* ---------- macro bar ---------- */

function MacroBar({ label, value, target, tone }) {
  const pct = Math.min(100, (value / target) * 100);
  const over = value > target;
  return (
    <div className="mbar">
      <div className="mbar-head">
        <span>{label}</span>
        <span className="mono">{Math.round(value)} / {target}{over ? " ·over" : ""}</span>
      </div>
      <div className="mbar-track">
        <div className="mbar-fill" style={{ width: `${pct}%`, background: over ? C.rust : tone }} />
      </div>
    </div>
  );
}

/* ---------- main ---------- */

export default function Nona() {
  const [tab, setTab] = useState("loom");
  const [entries, setEntries] = useState([]);
  const [meals, setMeals] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [noteText, setNoteText] = useState("");
  const [mealText, setMealText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [api, setApi] = useState(() => loadKey(API_KEY, { apiKey: "", relayUrl: "" }));
  const hydrated = useRef(false);

  useEffect(() => {
    setEntries(loadKey(JOURNAL_KEY, []));
    setMeals(loadKey(MEALS_KEY, []));
    setSettings(loadKey(SETTINGS_KEY, DEFAULT_SETTINGS));
    hydrated.current = true;
  }, []);

  useEffect(() => { if (hydrated.current) saveKey(JOURNAL_KEY, entries); }, [entries]);
  useEffect(() => { if (hydrated.current) saveKey(MEALS_KEY, meals); }, [meals]);
  useEffect(() => { if (hydrated.current) saveKey(SETTINGS_KEY, settings); }, [settings]);
  useEffect(() => { saveKey(API_KEY, api); }, [api]);

  const configured = api.apiKey || api.relayUrl;

  /* --- journal weave --- */
  async function weaveNote() {
    if (!noteText.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const out = await askClaude(JOURNAL_SYSTEM(todayISO()), noteText.trim(), api);
      const incoming = (out.entries || []).filter((e) => e.date && e.mood);
      setEntries((prev) => {
        // new entry for an existing date replaces it
        const kept = prev.filter((p) => !incoming.some((n) => n.date === p.date));
        return [...kept, ...incoming].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      setNoteText("");
    } catch (e) {
      setErr("The weave slipped. Try again — if the note is long, trim it slightly.");
    }
    setBusy(false);
  }

  /* --- meal log --- */
  async function logMeal() {
    if (!mealText.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const out = await askClaude(MEAL_SYSTEM, mealText.trim(), api);
      const items = (out.items || []).map((it) => ({
        ...it, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: todayISO(),
      }));
      setMeals((prev) => [...items, ...prev]);
      setMealText("");
    } catch {
      setErr("Couldn't read that meal. Rephrase and try again.");
    }
    setBusy(false);
  }

  const today = todayISO();
  const todayMeals = meals.filter((m) => m.date === today);
  const tot = (k) => todayMeals.reduce((s, m) => s + (m[k] || 0), 0);

  /* 7-day fuel history */
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const dayCals = days.map((d) => meals.filter((m) => m.date === d).reduce((s, m) => s + (m.calories || 0), 0));
  const dayProt = days.map((d) => meals.filter((m) => m.date === d).reduce((s, m) => s + (m.protein_g || 0), 0));
  const maxCal = Math.max(settings.calories, ...dayCals, 1);

  return (
    <div className="nona">
      <style>{css}</style>

      <header>
        <div>
          <h1>Nona</h1>
          <p className="sub">bioweave · notes in, threads out</p>
        </div>
        <nav>
          {[["loom", "Loom"], ["weave", "Weave"], ["fuel", "Fuel"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
      </header>

      {err && <div className="err">{err}</div>}

      {!configured && (
        <div className="setup">
          <p className="mono dim">Nona needs a way to think. Provide one:</p>
          <label>Anthropic API key (stays in this browser)
            <input type="password" value={api.apiKey}
              onChange={(e) => setApi((a) => ({ ...a, apiKey: e.target.value.trim() }))}
              placeholder="sk-ant-..." />
          </label>
          <label>or relay URL (POST {"{system, user}"})
            <input type="text" value={api.relayUrl}
              onChange={(e) => setApi((a) => ({ ...a, relayUrl: e.target.value.trim() }))}
              placeholder="https://your-worker.workers.dev/claude" />
          </label>
        </div>
      )}

      {/* ============ LOOM ============ */}
      {tab === "loom" && (
        <section>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={"Paste or write your notes as they come. Multiple days in one note is fine — Nona splits them.\n\ne.g.  Yesterday I forgot my meds, had coffee, drove in to work..."}
            rows={7}
          />
          <button className="act" onClick={weaveNote} disabled={busy || !noteText.trim()}>
            {busy ? "spinning…" : "Weave it in"}
          </button>

          <h2>Recent days</h2>
          {entries.length === 0 && <p className="empty">Nothing woven yet. The first note starts the thread.</p>}
          {entries.slice(0, 10).map((e) => (
            <div key={e.date} className="entry">
              <div className="entry-top">
                <span className="mono dim">{e.date}</span>
                <MoodChip mood={e.mood} />
                <HabitGlyphs habits={e.habits} />
                <button className="x" onClick={() => setEntries((p) => p.filter((q) => q.date !== e.date))}>×</button>
              </div>
              <p className="summary">{e.summary}</p>
              {e.tags?.length > 0 && <p className="tags">{e.tags.map((t) => `#${t}`).join("  ")}</p>}
            </div>
          ))}
        </section>
      )}

      {/* ============ WEAVE ============ */}
      {tab === "weave" && (
        <section>
          <h2>Mood thread · last {Math.min(entries.length, 14)} days</h2>
          <WeaveChart entries={entries} />
          <h2>What moves the thread</h2>
          <Correlations entries={entries} />
        </section>
      )}

      {/* ============ FUEL ============ */}
      {tab === "fuel" && (
        <section>
          <textarea
            value={mealText}
            onChange={(e) => setMealText(e.target.value)}
            placeholder={"Say what you ate, plainly.\n\ne.g.  4 eggs scrambled, greek yogurt with berries, slice of toast"}
            rows={4}
          />
          <button className="act" onClick={logMeal} disabled={busy || !mealText.trim()}>
            {busy ? "weighing…" : "Log it"}
          </button>

          <h2>Today</h2>
          <MacroBar label="calories" value={tot("calories")} target={settings.calories} tone={C.gold} />
          <MacroBar label="protein g" value={tot("protein_g")} target={settings.protein} tone={C.slate} />
          <MacroBar label="fat g" value={tot("fat_g")} target={settings.fat} tone={C.moss} />

          <div className="targets">
            <span className="dim">targets</span>
            {["calories", "protein", "fat"].map((k) => (
              <label key={k}>
                {k}
                <input
                  type="number"
                  value={settings[k]}
                  onChange={(e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) || 0 }))}
                />
              </label>
            ))}
          </div>

          {todayMeals.length > 0 && (
            <>
              <h2>Logged today</h2>
              {todayMeals.map((m) => (
                <div key={m.id} className="meal">
                  <span>{m.name}</span>
                  <span className="mono dim">{m.calories} cal · {m.protein_g}p</span>
                  <button className="x" onClick={() => setMeals((p) => p.filter((q) => q.id !== m.id))}>×</button>
                </div>
              ))}
            </>
          )}

          <h2>Seven days</h2>
          <svg viewBox="0 0 640 130" className="weave-svg">
            {days.map((d, i) => {
              const bw = 640 / 7;
              const h = (dayCals[i] / maxCal) * 90;
              const hitP = dayProt[i] >= settings.protein;
              return (
                <g key={d}>
                  <rect x={i * bw + 14} y={100 - h} width={bw - 28} height={Math.max(h, 1)}
                    fill={dayCals[i] > settings.calories ? C.rust : C.gold} opacity="0.85" rx="2" />
                  {hitP && <circle cx={i * bw + bw / 2} cy={108} r="3" fill={C.slate} />}
                  <text x={i * bw + bw / 2} y={124} textAnchor="middle" className="svg-dim">{d.slice(8)}</text>
                </g>
              );
            })}
            <line x1="0" x2="640" y1={100 - (settings.calories / maxCal) * 90} y2={100 - (settings.calories / maxCal) * 90}
              stroke={C.dim} strokeDasharray="4 4" strokeWidth="0.75" />
          </svg>
          <p className="fine">Bars are calories against the dashed target. A slate dot beneath a day means protein hit {settings.protein}g.</p>
        </section>
      )}
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');

.nona {
  min-height: 100vh;
  background: ${C.bg};
  color: ${C.ink};
  font-family: 'Spectral', serif;
  padding: 24px 18px 80px;
  max-width: 720px;
  margin: 0 auto;
  font-size: 16px;
  line-height: 1.55;
}
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid ${C.line}; padding-bottom: 14px; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
h1 { font-weight: 300; font-size: 30px; margin: 0; letter-spacing: 0.06em; }
.sub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: ${C.dim}; margin: 2px 0 0; letter-spacing: 0.04em; }
nav { display: flex; gap: 6px; }
.tab { background: none; border: 1px solid ${C.line}; color: ${C.dim}; font-family: 'IBM Plex Mono', monospace; font-size: 12px; padding: 6px 14px; cursor: pointer; border-radius: 2px; }
.tab.on { color: ${C.ink}; border-color: ${C.gold}; }
.tab:focus-visible, .act:focus-visible, .x:focus-visible { outline: 1px solid ${C.gold}; outline-offset: 2px; }
h2 { font-size: 13px; font-family: 'IBM Plex Mono', monospace; font-weight: 500; color: ${C.dim}; letter-spacing: 0.1em; text-transform: uppercase; margin: 26px 0 10px; }
textarea { width: 100%; box-sizing: border-box; background: ${C.panel}; border: 1px solid ${C.line}; color: ${C.ink}; font-family: 'Spectral', serif; font-size: 15px; padding: 12px; border-radius: 3px; resize: vertical; }
textarea::placeholder { color: ${C.faint}; font-style: italic; }
.act { margin-top: 10px; background: ${C.panel2}; border: 1px solid ${C.gold}; color: ${C.gold}; font-family: 'IBM Plex Mono', monospace; font-size: 13px; padding: 9px 20px; cursor: pointer; border-radius: 2px; }
.act:disabled { opacity: 0.4; cursor: default; }
.entry { border: 1px solid ${C.line}; background: ${C.panel}; border-radius: 3px; padding: 10px 12px; margin-bottom: 8px; }
.entry-top { display: flex; align-items: center; gap: 10px; }
.mood-chip { font-family: 'IBM Plex Mono', monospace; font-size: 12px; border: 1px solid; border-radius: 999px; padding: 1px 8px; }
.glyph-row { display: flex; gap: 7px; font-size: 13px; flex: 1; }
.glyph-row sub { font-size: 9px; }
.summary { margin: 6px 0 0; font-size: 15px; }
.tags { margin: 4px 0 0; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: ${C.faint}; }
.mono { font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
.dim { color: ${C.dim}; }
.x { background: none; border: none; color: ${C.faint}; cursor: pointer; font-size: 16px; margin-left: auto; padding: 0 4px; }
.x:hover { color: ${C.rust}; }
.empty { color: ${C.faint}; font-style: italic; font-size: 14px; }
.err { border: 1px solid ${C.rust}; color: ${C.rust}; font-family: 'IBM Plex Mono', monospace; font-size: 12px; padding: 8px 12px; border-radius: 3px; margin-bottom: 12px; }
.setup { border: 1px solid ${C.gold}; background: ${C.panel}; border-radius: 3px; padding: 12px 14px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
.setup label { display: flex; flex-direction: column; gap: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: ${C.dim}; }
.setup input { background: ${C.bg}; border: 1px solid ${C.line}; color: ${C.ink}; font-family: 'IBM Plex Mono', monospace; font-size: 13px; padding: 7px 9px; border-radius: 2px; }
.weave-svg { width: 100%; height: auto; background: ${C.panel}; border: 1px solid ${C.line}; border-radius: 3px; padding: 6px; box-sizing: border-box; }
.svg-dim { fill: ${C.dim}; font-family: 'IBM Plex Mono', monospace; font-size: 9px; }
.corr-row { display: flex; align-items: baseline; gap: 12px; padding: 7px 0; border-bottom: 1px solid ${C.line}; font-size: 14px; }
.corr-label { font-family: 'IBM Plex Mono', monospace; font-size: 12px; width: 110px; color: ${C.dim}; }
.corr-vals { flex: 1; color: ${C.ink}; }
.corr-vals b { font-weight: 600; }
.corr-delta { font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
.fine { color: ${C.faint}; font-size: 12.5px; font-style: italic; margin-top: 10px; }
.mbar { margin-bottom: 12px; }
.mbar-head { display: flex; justify-content: space-between; font-size: 13px; color: ${C.dim}; margin-bottom: 4px; }
.mbar-track { height: 8px; background: ${C.panel2}; border-radius: 999px; overflow: hidden; }
.mbar-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.targets { display: flex; gap: 14px; align-items: center; margin: 14px 0 4px; flex-wrap: wrap; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
.targets label { display: flex; flex-direction: column; gap: 2px; color: ${C.faint}; }
.targets input { width: 70px; background: ${C.panel}; border: 1px solid ${C.line}; color: ${C.ink}; font-family: inherit; font-size: 12px; padding: 4px 6px; border-radius: 2px; }
.meal { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid ${C.line}; font-size: 14.5px; }
.meal span:first-child { flex: 1; }
@media (prefers-reduced-motion: reduce) { .mbar-fill { transition: none; } }
@media (max-width: 480px) { .nona { font-size: 15px; padding: 18px 12px 60px; } h1 { font-size: 24px; } }
`;
