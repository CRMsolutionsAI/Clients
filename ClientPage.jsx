import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* ─── SUPABASE CLIENT ────────────────────────────────────── */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL  || "",
  import.meta.env.VITE_SUPABASE_ANON_KEY || ""
);
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID || "default";

/* ─── HELPERS ───────────────────────────────────────────── */
const MONTHS_RU = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
function todayRu() { const d = new Date(); return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`; }
function pad2(n) { return String(n).padStart(2, "0"); }
function hhmm(iso) { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function smartFormatTime(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return digits.padStart(2, "0") + ":00";
  if (digits.length === 3) return digits.slice(0, 2) + ":" + digits[2] + "0";
  return digits.slice(0, 2) + ":" + digits.slice(2, 4);
}
function combineRange(start, end) { return (start && end) ? `${start}-${end}` : (start || ""); }
function parseTimeRange(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2})[:\.](\d{2})\s*[-–—]\s*(\d{1,2})[:\.](\d{2})/);
  if (!m) return null;
  const s = parseInt(m[1]) * 60 + parseInt(m[2]), e = parseInt(m[3]) * 60 + parseInt(m[4]);
  return e > s ? e - s : null;
}
function fmtMins(min) {
  if (!min && min !== 0) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? (m > 0 ? `${h}ч ${m}м` : `${h}ч`) : `${m}м`;
}
function fmtMs(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
  if (m > 0) return `${m}м ${sec}с`;
  return `${sec}с`;
}
function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}
function fmtMoney(n) { return n.toLocaleString("uk-UA", { minimumFractionDigits: 0 }); }
function mkId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function taskTotalMs(task) {
  return (task.sessions || []).reduce((s, sess) => s + (sess.endedAt ? new Date(sess.endedAt) - new Date(sess.startedAt) : 0), 0);
}
function taskLastMod(task) {
  const sess = task.sessions || [];
  return sess.length ? (sess[sess.length - 1].endedAt || null) : null;
}
// Parse plan hours: accepts "2,5" or "2.5" → 2.5
function parsePlan(v) { return parseFloat(String(v || "").replace(",", ".")) || 0; }
// Format plan for display: 2.5 → "2,50"
function fmtPlan(v) { const n = parsePlan(v); return n > 0 ? n.toFixed(2).replace(".", ",") : ""; }

/* ─── CONSTANTS ─────────────────────────────────────────── */
const C = {
  bg: "#F2EFE9", card: "#FFFFFF", dark: "#1A1F36", gold: "#C8922A", goldLight: "#FFF3D0",
  border: "#E2DED6", text: "#1F2937", muted: "#6B7280", inputBg: "#FAFAF8",
  success: "#059669", danger: "#DC2626", blue: "#2563EB", blueBg: "#EFF6FF",
};
const baseInp = {
  border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 9px", fontSize: 13,
  fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box",
  background: C.inputBg, color: C.text,
};
const thS = {
  background: "#F5F4F0", fontSize: 11, fontWeight: 700, color: C.muted,
  padding: "7px 8px", textAlign: "left", borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap", letterSpacing: 0.3, userSelect: "none",
};
const tdS = { padding: "5px 7px", fontSize: 13, borderBottom: `1px solid #F5F4F1`, verticalAlign: "middle" };

const STATUS_CFG = {
  new:         { label: "Начато",    color: "#6B7280", bg: "#F3F4F6" },
  in_progress: { label: "В работе",  color: "#D97706", bg: "#FEF3C7" },
  done:        { label: "Выполнено", color: "#059669", bg: "#D1FAE5" },
};
const TASK_COLS = [
  { id: "name",        label: "Задача",    w: 220, sortable: true,  filterable: true,  editable: true  },
  { id: "notBillable", label: "Не в счёт", w: 72,  sortable: true,  filterable: false, editable: true  },
  { id: "planTime",    label: "План, ч",   w: 80,  sortable: true,  filterable: false, editable: true  },
  { id: "totalTime",   label: "Факт",      w: 95,  sortable: true,  filterable: false, editable: false },
  { id: "lastMod",     label: "Изменено",  w: 145, sortable: true,  filterable: false, editable: false },
  { id: "status",      label: "Статус",    w: 115, sortable: true,  filterable: true,  editable: true  },
  { id: "timer",       label: "Таймер",    w: 130, sortable: false, filterable: false, editable: false },
  { id: "result",      label: "Результат", w: 200, sortable: false, filterable: true,  editable: true  },
  { id: "createdAt",   label: "Создана",   w: 110, sortable: true,  filterable: false, editable: false },
];

/* ─── APP ───────────────────────────────────────────────── */
export default function App() {
  const [clientName, setClientName] = useState("Название клиента");
  const [editName, setEditName]     = useState(false);
  const [tab, setTab]               = useState("tasks");

  const [rows, setRows]         = useState([{ id: mkId(), date: "", timeStart: "", timeEnd: "", result: "", isDivider: false }]);
  const [payments, setPayments] = useState([{ id: mkId(), date: "", hours: "", pricePerHour: "" }]);
  const [knowledge, setKnowledge] = useState([
    { id: mkId(), name: "Доступ в систему", url: "" },
    { id: mkId(), name: "Инструкция",       url: "" },
  ]);
  const [tasks, setTasks] = useState([
    { id: mkId(), name: "", status: "new", result: "", planTime: "", notBillable: false, createdAt: new Date().toISOString(), sessions: [] }
  ]);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerElapsed, setTimerElapsed] = useState(0);

  // Supabase sync state
  const [loaded,     setLoaded]     = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error
  const saveTimerRef = useRef(null);

  const activeTimerRef = useRef(null);
  const tasksRef       = useRef(tasks);
  useEffect(() => { activeTimerRef.current = activeTimer; }, [activeTimer]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  /* ── Load from Supabase on mount ── */
  useEffect(() => {
    supabase.from("client_data").select("*").eq("client_id", CLIENT_ID).maybeSingle()
      .then(({ data }) => {
        if (data) {
          if (data.client_name)       setClientName(data.client_name);
          if (data.rows?.length)      setRows(data.rows);
          if (data.payments?.length)  setPayments(data.payments);
          if (data.knowledge?.length) setKnowledge(data.knowledge);
          if (data.tasks?.length)     setTasks(data.tasks);
        }
        setLoaded(true);
      });
  }, []);

  /* ── Save to Supabase (debounced 800ms) ── */
  useEffect(() => {
    if (!loaded) return;
    setSyncStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("client_data").upsert({
        client_id: CLIENT_ID, client_name: clientName,
        rows, payments, knowledge, tasks,
        updated_at: new Date().toISOString(),
      });
      if (error) { setSyncStatus("error"); }
      else { setSyncStatus("saved"); setTimeout(() => setSyncStatus("idle"), 2500); }
    }, 800);
  }, [loaded, clientName, rows, payments, knowledge, tasks]);

  /* ── Stop timer ── */
  const stopTimer = useCallback(() => {
    const at = activeTimerRef.current;
    if (!at) return;
    const endedAt = new Date().toISOString();
    const { taskId, startedAt } = at;
    const session  = { id: mkId(), startedAt, endedAt };
    const taskObj  = tasksRef.current.find(t => t.id === taskId);
    const taskName = taskObj?.name || "";
    const notBillable = !!taskObj?.notBillable;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, sessions: [...(t.sessions || []), session] } : t));
    const s = new Date(startedAt), e = new Date(endedAt);
    setRows(prev => [...prev, {
      id: mkId(), isDivider: false,
      date: todayRu(),
      timeStart: `${pad2(s.getHours())}:${pad2(s.getMinutes())}`,
      timeEnd:   `${pad2(e.getHours())}:${pad2(e.getMinutes())}`,
      result: taskName ? `[${taskName}] ` : "",
      notBillable,
    }]);
    setActiveTimer(null);
    setTimerElapsed(0);
  }, []);

  const stopTimerRef = useRef(stopTimer);
  useEffect(() => { stopTimerRef.current = stopTimer; }, [stopTimer]);

  /* ── Start timer ── */
  const startTimer = useCallback((taskId) => {
    if (activeTimerRef.current) stopTimerRef.current();
    setActiveTimer({ taskId, startedAt: new Date().toISOString() });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: t.status === "done" ? "done" : "in_progress" } : t));
  }, []);

  /* ── Idle 3 min ── */
  useEffect(() => {
    if (!activeTimer) return;
    let idle;
    const reset = () => { clearTimeout(idle); idle = setTimeout(() => stopTimerRef.current(), 3 * 60 * 1000); };
    reset();
    ["mousemove","keydown","mousedown"].forEach(ev => window.addEventListener(ev, reset));
    return () => { clearTimeout(idle); ["mousemove","keydown","mousedown"].forEach(ev => window.removeEventListener(ev, reset)); };
  }, [activeTimer]);

  /* ── Ticker ── */
  useEffect(() => {
    if (!activeTimer) { setTimerElapsed(0); return; }
    const iv = setInterval(() => setTimerElapsed(Date.now() - new Date(activeTimer.startedAt).getTime()), 1000);
    return () => clearInterval(iv);
  }, [activeTimer]);

  /* ── Task CRUD ── */
  const addTask = (afterIdx) => {
    const nt = { id: mkId(), name: "", status: "new", result: "", planTime: "", notBillable: false, createdAt: new Date().toISOString(), sessions: [] };
    setTasks(prev => { const n = [...prev]; n.splice((afterIdx ?? n.length) + 1, 0, nt); return n; });
  };
  const updTask = (id, f, v) => setTasks(prev => prev.map(t => t.id === id ? { ...t, [f]: v } : t));
  const rmTask  = (id) => { if (activeTimerRef.current?.taskId === id) stopTimerRef.current(); setTasks(prev => prev.filter(t => t.id !== id)); };

  /* ── Rows CRUD ── */
  const addRow     = (ai) => setRows(prev => { const n = [...prev]; n.splice(ai + 1, 0, { id: mkId(), date: "", timeStart: "", timeEnd: "", result: "", isDivider: false }); return n; });
  const addDivider = () => setRows(r => [...r, { id: mkId(), date: "", timeStart: "", timeEnd: "", result: "", isDivider: true, label: "" }]);
  const updRow     = (id, f, v) => setRows(r => r.map(x => x.id === id ? { ...x, [f]: v } : x));
  const rmRow      = (id) => setRows(r => r.filter(x => x.id !== id));

  /* ── Payments CRUD ── */
  const addPayment = (ai) => setPayments(prev => { const n = [...prev]; n.splice((ai ?? n.length - 1) + 1, 0, { id: mkId(), date: "", hours: "", pricePerHour: "" }); return n; });
  const updPay     = (id, f, v) => setPayments(p => p.map(x => x.id === id ? { ...x, [f]: v } : x));
  const rmPay      = (id) => setPayments(p => p.filter(x => x.id !== id));

  /* ── KB CRUD ── */
  const addKb = (ai) => setKnowledge(prev => { const n = [...prev]; n.splice((ai ?? n.length - 1) + 1, 0, { id: mkId(), name: "", url: "" }); return n; });
  const updKb = (id, f, v) => setKnowledge(k => k.map(x => x.id === id ? { ...x, [f]: v } : x));
  const rmKb  = (id) => setKnowledge(k => k.filter(x => x.id !== id));

  /* ── Summaries ── */
  const totalWorkMin   = rows.filter(r => !r.isDivider).reduce((s, r) => s + (parseTimeRange(combineRange(r.timeStart, r.timeEnd)) || 0), 0);
  const billableMin    = rows.filter(r => !r.isDivider && !r.notBillable).reduce((s, r) => s + (parseTimeRange(combineRange(r.timeStart, r.timeEnd)) || 0), 0);
  const totalPaidHours = payments.reduce((s, p) => s + (parseFloat(p.hours) || 0), 0);
  const totalPaidSum   = payments.reduce((s, p) => s + ((parseFloat(p.hours) || 0) * (parseFloat(p.pricePerHour) || 0)), 0);
  const diffHours      = totalPaidHours - (billableMin / 60);

  return (
    <div style={{ fontFamily: "'Golos Text','Segoe UI',sans-serif", minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes ring  { 0%{box-shadow:0 0 0 0 rgba(220,38,38,.5)} 70%{box-shadow:0 0 0 6px rgba(220,38,38,0)} 100%{box-shadow:0 0 0 0 rgba(220,38,38,0)} }
        @keyframes spin  { to { transform: rotate(360deg); } }
        .timer-stop:hover { background: rgba(220,38,38,.35) !important; }
        .timer-start:hover { background: rgba(5,150,105,.18) !important; border-color: rgba(5,150,105,.7) !important; }
      `}</style>

      {/* Loading screen */}
      {!loaded && (
        <div style={{ position: "fixed", inset: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999, gap: 16 }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          <div style={{ fontSize: 14, color: C.muted }}>Загрузка данных...</div>
        </div>
      )}

      {/* Header */}
      <header style={{ background: C.dark, color: "#fff", padding: "0 20px", display: "flex", alignItems: "center", gap: 14, height: 56, flexShrink: 0, boxShadow: "0 2px 16px rgba(0,0,0,.3)" }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.gold, letterSpacing: 0.3, flexShrink: 0 }}>◈ ClientPage</div>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,.12)" }} />
        {editName
          ? <input autoFocus value={clientName} onChange={e => setClientName(e.target.value)}
              onBlur={() => setEditName(false)} onKeyDown={e => e.key === "Enter" && setEditName(false)}
              style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "4px 12px", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 700, outline: "none", minWidth: 200 }} />
          : <div onClick={() => setEditName(true)} style={{ fontWeight: 700, fontSize: 16, color: "#fff", cursor: "text", display: "flex", alignItems: "center", gap: 6 }}>
              {clientName}<span style={{ fontSize: 11, color: "#6B7280", fontWeight: 400 }}>✎</span>
            </div>
        }

        {/* Sync indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, flexShrink: 0 }}>
          {syncStatus === "saving" && <><span style={{ width: 6, height: 6, borderRadius: "50%", border: `2px solid #6B7280`, borderTopColor: "transparent", display: "inline-block", animation: "spin .7s linear infinite" }} /><span style={{ color: "#6B7280" }}>Сохранение...</span></>}
          {syncStatus === "saved"  && <><span style={{ color: "#4ADE80", fontSize: 13 }}>✓</span><span style={{ color: "#4ADE80" }}>Сохранено</span></>}
          {syncStatus === "error"  && <><span style={{ color: "#F87171" }}>✗</span><span style={{ color: "#F87171" }}>Ошибка связи</span></>}
        </div>

        {/* ── Elegant timer chip ── */}
        {activeTimer && (() => {
          const taskName = tasks.find(t => t.id === activeTimer.taskId)?.name || "";
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 0, background: "rgba(15,18,30,.6)", borderRadius: 12, border: "1px solid rgba(220,38,38,.22)", height: 38, overflow: "hidden", flexShrink: 0, backdropFilter: "blur(8px)" }}>
              {/* Left accent */}
              <div style={{ width: 3, alignSelf: "stretch", background: C.danger, animation: "ring 2s infinite", flexShrink: 0 }} />

              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 0 10px" }}>
                {/* Dot */}
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.danger, flexShrink: 0, animation: "blink 1.2s ease-in-out infinite" }} />

                {/* Task label */}
                {taskName && (
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.38)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: .1 }}>
                    {taskName}
                  </span>
                )}

                {/* Elapsed */}
                <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: 1.5, fontFamily: "monospace, monospace" }}>
                  {fmtElapsed(timerElapsed)}
                </span>
              </div>

              {/* Stop button */}
              <button className="timer-stop" onClick={() => stopTimerRef.current()}
                style={{ height: "100%", padding: "0 13px", background: "rgba(220,38,38,.12)", border: "none", borderLeft: "1px solid rgba(220,38,38,.2)", color: "#FCA5A5", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, letterSpacing: .3, transition: "background .15s", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 9 }}>■</span> СТОП
              </button>
            </div>
          );
        })()}

        <nav style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          {[["tasks","✅ Задачи"],["time","⏱ Время"],["payments","💳 Оплаты"],["kb","📚 База знаний"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ background: tab === k ? "rgba(200,146,42,.15)" : "none", border: `1px solid ${tab === k ? "rgba(200,146,42,.6)" : "transparent"}`, color: tab === k ? C.gold : "#9CA3AF", borderRadius: 7, padding: "5px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>{l}</button>
          ))}
        </nav>
      </header>

      {/* Summary bar */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "10px 20px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <SumCard label="Відпрацьовано, год" value={totalWorkMin > 0 ? (totalWorkMin / 60).toFixed(2) : "—"} color={C.dark} />
        <SumCard label="До рахунку, год"    value={billableMin > 0 ? (billableMin / 60).toFixed(2) : "—"} color={C.success} />
        <SumCard label="Оплачено, год"      value={totalPaidHours > 0 ? totalPaidHours.toFixed(2) : "—"} color={C.blue} />
        <SumCard label="Різниця (рах.), год" value={billableMin > 0 || totalPaidHours > 0 ? (diffHours >= 0 ? "+" : "") + diffHours.toFixed(2) : "—"} color={diffHours < -0.01 ? C.danger : C.success} />
        <SumCard label="Оплачено, ₴"        value={totalPaidSum > 0 ? fmtMoney(Math.round(totalPaidSum)) : "—"} color={C.gold} />
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>Хв. часу: {fmtMins(totalWorkMin)}</div>
      </div>

      <main style={{ flex: 1, padding: 16, overflow: "auto" }}>
        {tab === "tasks"    && <TasksTab tasks={tasks} activeTimer={activeTimer} timerElapsed={timerElapsed} onAdd={addTask} onUpd={updTask} onRm={rmTask} onStart={startTimer} onStop={() => stopTimerRef.current()} />}
        {tab === "time"     && <TimeTab rows={rows} onAddRow={addRow} onAddDivider={addDivider} onUpdRow={updRow} onRmRow={rmRow} totalWorkMin={totalWorkMin} />}
        {tab === "payments" && <PaymentsTab payments={payments} onAdd={addPayment} onUpd={updPay} onRm={rmPay} totalPaidHours={totalPaidHours} totalPaidSum={totalPaidSum} />}
        {tab === "kb"       && <KbTab items={knowledge} onAdd={addKb} onUpd={updKb} onRm={rmKb} />}
      </main>
    </div>
  );
}

function SumCard({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

/* ─── CELL NAVIGATION & PLAN INPUT ─────────────────────── */
function navCell(e, dir) {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const inputs = Array.from(tr.querySelectorAll("input:not([type=checkbox])"));
  const idx = inputs.indexOf(e.target);
  const target = inputs[idx + dir];
  if (target) { e.preventDefault(); target.focus(); target.select?.(); }
}

/* Plan hours: "2,5" or "2.5" → formats to "2,50" on blur */
function PlanInput({ value, onChange, onAddBelow, over }) {
  const [raw, setRaw]         = useState(value);
  const [focused, setFocused] = useState(false);
  const commit = () => {
    const f = raw.trim() ? fmtPlan(raw) : "";
    setFocused(false); setRaw(f); onChange(f);
  };
  return (
    <input
      value={focused ? raw : value}
      onChange={e => setRaw(e.target.value)}
      onFocus={e => { setRaw(value); setFocused(true); e.currentTarget.style.background = C.inputBg; e.currentTarget.style.borderColor = C.gold; }}
      onBlur={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.border; commit(); }}
      onKeyDown={e => {
        if (e.key === "Enter")      { e.preventDefault(); commit(); onAddBelow?.(); }
        if (e.key === "ArrowRight") { commit(); navCell(e, 1); }
        if (e.key === "ArrowLeft")  { commit(); navCell(e, -1); }
      }}
      inputMode="decimal"
      style={{ ...baseInp, textAlign: "center", padding: "2px 4px", fontSize: 12, width: "100%",
        color: over ? C.danger : C.text, fontWeight: over ? 700 : 400,
        border: `1px solid ${C.border}`, background: "transparent" }}
      placeholder="0,00"
    />
  );
}

/* ─── TASKS TAB ─────────────────────────────────────────── */
function TasksTab({ tasks, activeTimer, timerElapsed, onAdd, onUpd, onRm, onStart, onStop }) {
  const [colOrder,      setColOrder]      = useState(TASK_COLS.map(c => c.id));
  const [pinned,        setPinned]        = useState(new Set(["name"]));
  const [sort,          setSort]          = useState({ colId: null, dir: "asc" });
  const [filters,       setFilters]       = useState({});
  const [dragColId,     setDragColId]     = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);
  const [colWidths,     setColWidths]     = useState(() =>
    Object.fromEntries(TASK_COLS.map(c => [c.id, c.w]))
  );
  const resizingRef = useRef(null); // { colId, startX, startW }

  /* ── Column resize handlers ── */
  const startResize = (e, colId) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { colId, startX: e.clientX, startW: colWidths[colId] };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev) => {
      if (!resizingRef.current) return;
      const { colId: cid, startX, startW } = resizingRef.current;
      const newW = Math.max(60, startW + ev.clientX - startX);
      setColWidths(prev => ({ ...prev, [cid]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const getCellVal = (task, colId) => {
    if (colId === "totalTime") return taskTotalMs(task);
    if (colId === "lastMod")   return taskLastMod(task) || "";
    if (colId === "createdAt") return task.createdAt || "";
    if (colId === "status")    return STATUS_CFG[task.status]?.label || "";
    if (colId === "planTime")    return parsePlan(task.planTime);
    if (colId === "notBillable") return task.notBillable ? 1 : 0;
    return task[colId] || "";
  };

  const displayedTasks = useMemo(() => {
    let arr = [...tasks];
    Object.entries(filters).forEach(([colId, fv]) => {
      if (!fv?.trim()) return;
      arr = arr.filter(t => String(getCellVal(t, colId)).toLowerCase().includes(fv.toLowerCase()));
    });
    if (sort.colId) {
      arr.sort((a, b) => {
        const va = getCellVal(a, sort.colId), vb = getCellVal(b, sort.colId);
        const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "ru");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return arr;
  }, [tasks, sort, filters]);

  const orderedCols = useMemo(() => {
    const cols = colOrder.map(id => TASK_COLS.find(c => c.id === id)).filter(Boolean);
    return [...cols.filter(c => pinned.has(c.id)), ...cols.filter(c => !pinned.has(c.id))];
  }, [colOrder, pinned]);

  const pinnedBorderIdx = useMemo(() => orderedCols.findIndex(c => !pinned.has(c.id)) - 1, [orderedCols, pinned]);

  const handleColDrop = (targetId) => {
    if (!dragColId || dragColId === targetId || pinned.has(dragColId)) return;
    setColOrder(prev => {
      const arr = [...prev];
      const fi = arr.indexOf(dragColId), ti = arr.indexOf(targetId);
      arr.splice(fi, 1); arr.splice(ti, 0, dragColId);
      return arr;
    });
    setDragColId(null); setDragOverColId(null);
  };

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(0,0,0,.07)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.dark }}>✅ Задачи</div>
        <span style={{ fontSize: 11, color: C.muted }}>Enter — новая · тяните заголовок — порядок · тяните край — ширина · 📌 — закрепить · клик — сортировка</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            {orderedCols.map(c => <col key={c.id} style={{ width: colWidths[c.id] ?? c.w }} />)}
            <col style={{ width: 28 }} />
          </colgroup>
          <thead>
            <tr>
              {orderedCols.map((col, ci) => {
                const isActive = sort.colId === col.id;
                const isPinned = pinned.has(col.id);
                const isDragOv = dragOverColId === col.id && !isPinned && dragColId !== col.id;
                return (
                  <th key={col.id}
                    draggable={!isPinned}
                    onDragStart={e => { if (resizingRef.current) { e.preventDefault(); return; } setDragColId(col.id); }}
                    onDragOver={e => { e.preventDefault(); if (!isPinned) setDragOverColId(col.id); }}
                    onDrop={() => handleColDrop(col.id)}
                    onDragLeave={() => setDragOverColId(p => p === col.id ? null : p)}
                    onDragEnd={() => { setDragColId(null); setDragOverColId(null); }}
                    style={{ ...thS, position: "relative", cursor: isPinned ? "default" : "grab",
                      background: isDragOv ? "#EEF2FF" : isPinned ? "#F0EDE6" : thS.background,
                      borderRight: ci === pinnedBorderIdx ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                      overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3, paddingRight: 6 }}>
                      <span
                        onClick={() => { if (col.sortable) setSort(s => s.colId === col.id ? { colId: col.id, dir: s.dir === "asc" ? "desc" : "asc" } : { colId: col.id, dir: "asc" }); }}
                        style={{ flex: 1, cursor: col.sortable ? "pointer" : "default", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {col.label}{isActive && <span style={{ marginLeft: 3, color: C.gold }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                      </span>
                      <button
                        onClick={() => setPinned(p => { const n = new Set(p); isPinned ? n.delete(col.id) : n.add(col.id); return n; })}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 9, color: isPinned ? C.gold : "#D0CBC4", lineHeight: 1, flexShrink: 0 }}
                        title={isPinned ? "Открепить" : "Закрепить"}>📌</button>
                    </div>
                    {/* ── Resize handle ── */}
                    <div
                      onMouseDown={e => startResize(e, col.id)}
                      style={{
                        position: "absolute", right: 0, top: 0, bottom: 0, width: 5,
                        cursor: "col-resize", zIndex: 10,
                        background: "transparent",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(200,146,42,.35)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    />
                  </th>
                );
              })}
              <th style={{ ...thS, width: 28, borderRight: "none" }} />
            </tr>
            {/* Filter row */}
            <tr style={{ background: "#FAFAF8" }}>
              {orderedCols.map((col, ci) => (
                <td key={col.id} style={{ padding: "3px 5px", borderBottom: `1px solid ${C.border}`, borderRight: ci === pinnedBorderIdx ? `2px solid ${C.gold}` : `1px solid ${C.border}` }}>
                  {col.filterable && (
                    <input value={filters[col.id] || ""} onChange={e => setFilters(f => ({ ...f, [col.id]: e.target.value }))}
                      placeholder="🔍 фильтр"
                      style={{ ...baseInp, fontSize: 11, padding: "2px 5px", background: "transparent", border: `1px solid ${filters[col.id] ? C.gold : "transparent"}` }}
                      onFocus={e => e.currentTarget.style.borderColor = C.gold}
                      onBlur={e => { if (!filters[col.id]) e.currentTarget.style.borderColor = "transparent"; }} />
                  )}
                </td>
              ))}
              <td style={{ borderBottom: `1px solid ${C.border}` }} />
            </tr>
          </thead>
          <tbody>
            {displayedTasks.length === 0 && tasks.length > 0 && (
              <tr><td colSpan={orderedCols.length + 1} style={{ ...tdS, textAlign: "center", color: C.muted, padding: "28px 0" }}>
                Нет совпадений — очистите фильтр
              </td></tr>
            )}
            {displayedTasks.length === 0 && tasks.length === 0 && (
              <tr><td colSpan={orderedCols.length + 1} style={{ ...tdS, padding: "12px 16px" }}>
                <input autoFocus placeholder="Введите задачу и нажмите Enter..."
                  style={{ ...baseInp, border: "none", background: "transparent", fontSize: 13, fontWeight: 600 }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAdd(-1); } }} />
              </td></tr>
            )}
            {displayedTasks.map((task) => (
              <TaskRow key={task.id} task={task} orderedCols={orderedCols} pinnedBorderIdx={pinnedBorderIdx}
                colWidths={colWidths}
                activeTimer={activeTimer} timerElapsed={timerElapsed}
                onUpd={onUpd} onRm={onRm} onStart={onStart} onStop={onStop}
                onAddBelow={() => onAdd(tasks.indexOf(task))} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── TASK ROW ───────────────────────────────────────────── */
function TaskRow({ task, orderedCols, pinnedBorderIdx, activeTimer, timerElapsed, onUpd, onRm, onStart, onStop, onAddBelow }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos,     setTooltipPos]     = useState({ x: 0, y: 0 });
  const isActive  = activeTimer?.taskId === task.id;
  const totalMs   = taskTotalMs(task) + (isActive ? timerElapsed : 0);
  const lastMod   = taskLastMod(task);
  const isDone    = task.status === "done";
  const statusCfg = STATUS_CFG[task.status] || STATUS_CFG.new;
  const STATUS_CYCLE = { new: "in_progress", in_progress: "done", done: "new" };

  const renderCell = (col, ci) => {
    const bR = ci === pinnedBorderIdx ? `2px solid ${C.gold}` : undefined;
    const cs  = { ...tdS, borderRight: bR, background: isActive ? "rgba(220,38,38,.025)" : undefined };

    switch (col.id) {
      case "name":
        return (
          <td key="name" style={cs}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={isDone} onChange={() => onUpd(task.id, "status", isDone ? "new" : "done")}
                style={{ width: 14, height: 14, accentColor: C.success, cursor: "pointer", flexShrink: 0 }} />
              <input value={task.name} onChange={e => onUpd(task.id, "name", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAddBelow(); } }}
                style={{ ...baseInp, border: "none", background: "transparent", padding: "2px 0", fontWeight: 600,
                  textDecoration: isDone ? "line-through" : "none", color: isDone ? C.muted : C.text }}
                onFocus={e => { e.currentTarget.style.cssText += ";background:" + C.inputBg + ";border:1px solid " + C.gold + ";padding:2px 6px;border-radius:5px"; }}
                onBlur={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.border = "none"; e.currentTarget.style.padding = "2px 0"; }}
                placeholder="Задача..." />
            </div>
          </td>
        );

      case "notBillable":
        return (
          <td key="notBillable" style={{ ...cs, textAlign: "center" }}>
            <label title="Не включать в счёт клиенту" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
              <input type="checkbox" checked={!!task.notBillable}
                onChange={e => onUpd(task.id, "notBillable", e.target.checked)}
                style={{ width: 14, height: 14, accentColor: C.danger, cursor: "pointer" }} />
              {task.notBillable && (
                <span style={{ fontSize: 9, fontWeight: 700, color: C.danger, letterSpacing: .3, lineHeight: 1 }}>не в счёт</span>
              )}
            </label>
          </td>
        );

      case "planTime": {
        const planH = parsePlan(task.planTime);
        const factH = totalMs / 3600000;
        const pct   = planH > 0 ? Math.min(factH / planH, 1) : 0;
        const over  = planH > 0 && factH > planH;
        return (
          <td key="planTime" style={{ ...cs, textAlign: "center" }}>
            <PlanInput
              value={task.planTime || ""}
              onChange={v => onUpd(task.id, "planTime", v)}
              onAddBelow={onAddBelow}
              over={over}
            />
            {planH > 0 && (
              <div style={{ height: 2, background: "#EFEDE9", borderRadius: 1, marginTop: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct * 100}%`, background: over ? C.danger : C.success, borderRadius: 1, transition: "width .3s" }} />
              </div>
            )}
          </td>
        );
      }

      case "totalTime":
        return (
          <td key="totalTime" style={{ ...cs, textAlign: "center", position: "relative" }}>
            <span
              onMouseEnter={e => {
                if (!task.sessions?.length) return;
                const r = e.currentTarget.getBoundingClientRect();
                setTooltipPos({ x: r.left - 10, y: r.bottom + 6 });
                setTooltipVisible(true);
              }}
              onMouseLeave={() => setTooltipVisible(false)}
              style={{ fontWeight: 700, color: totalMs > 0 ? (isActive ? C.danger : C.success) : "#D1D5DB", cursor: task.sessions?.length ? "help" : "default" }}>
              {isActive
                ? <span style={{ fontFamily: "monospace, monospace", letterSpacing: .5 }}>{fmtMs(totalMs)}</span>
                : totalMs > 0 ? fmtMs(totalMs) : "—"}
            </span>
            {tooltipVisible && task.sessions?.length > 0 && (
              <SessionTooltip sessions={task.sessions} pos={tooltipPos} />
            )}
          </td>
        );

      case "lastMod":
        return (
          <td key="lastMod" style={{ ...cs, fontSize: 11, color: C.muted }}>
            {isActive ? <span style={{ color: C.danger, fontWeight: 600 }}>● сейчас</span> : lastMod ? fmtDate(lastMod) : "—"}
          </td>
        );

      case "status":
        return (
          <td key="status" style={cs}>
            <button onClick={() => onUpd(task.id, "status", STATUS_CYCLE[task.status] || "new")}
              style={{ padding: "3px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 11, fontWeight: 700, background: statusCfg.bg, color: statusCfg.color }}>
              {statusCfg.label}
            </button>
          </td>
        );

      case "timer":
        return (
          <td key="timer" style={{ ...cs, textAlign: "center" }}>
            {isActive ? (
              /* ── Active: dot + monospace time + stop icon ── */
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.danger, flexShrink: 0, animation: "blink 1.2s ease-in-out infinite" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.danger, fontVariantNumeric: "tabular-nums", letterSpacing: 1, fontFamily: "monospace, monospace" }}>
                  {fmtElapsed(timerElapsed)}
                </span>
                <button className="timer-stop" onClick={onStop}
                  style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "rgba(220,38,38,.1)", color: C.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, flexShrink: 0, transition: "background .15s" }}
                  title="Остановить">■</button>
              </div>
            ) : isDone ? (
              /* ── Done: greyed out ── */
              <span style={{ fontSize: 11, color: "#D1D5DB" }}>—</span>
            ) : (
              /* ── Idle: minimal play button ── */
              <button className="timer-start" onClick={() => onStart(task.id)}
                style={{ width: 30, height: 30, borderRadius: "50%", border: `1.5px solid rgba(5,150,105,.28)`, background: "rgba(5,150,105,.05)", color: C.success, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, transition: "all .15s" }}
                title="Начать трекинг">▶</button>
            )}
          </td>
        );

      case "result":
        return (
          <td key="result" style={cs}>
            <input value={task.result || ""} onChange={e => onUpd(task.id, "result", e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAddBelow(); } }}
              style={{ ...baseInp, border: "none", background: "transparent", padding: "2px 0", fontSize: 12 }}
              onFocus={e => { e.currentTarget.style.cssText += ";background:" + C.inputBg + ";border:1px solid " + C.gold + ";padding:2px 6px;border-radius:5px"; }}
              onBlur={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.border = "none"; e.currentTarget.style.padding = "2px 0"; }}
              placeholder="Результат..." />
          </td>
        );

      case "createdAt":
        return (
          <td key="createdAt" style={{ ...cs, fontSize: 11, color: C.muted }}>
            {task.createdAt ? fmtDate(task.createdAt) : "—"}
          </td>
        );

      default: return <td key={col.id} style={cs} />;
    }
  };

  return (
    <tr style={{ background: isActive ? "rgba(220,38,38,.02)" : "#fff" }}
      onMouseEnter={e => e.currentTarget.style.background = isActive ? "rgba(220,38,38,.05)" : "#FDFCFB"}
      onMouseLeave={e => e.currentTarget.style.background = isActive ? "rgba(220,38,38,.02)" : "#fff"}>
      {orderedCols.map((col, ci) => renderCell(col, ci))}
      <td style={{ ...tdS, textAlign: "center", width: 28 }}>
        <button onClick={() => onRm(task.id)} style={{ background: "none", border: "none", color: "#D8D4CE", cursor: "pointer", fontSize: 15, lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = C.danger}
          onMouseLeave={e => e.currentTarget.style.color = "#D8D4CE"}>×</button>
      </td>
    </tr>
  );
}

/* ─── SESSION TOOLTIP ────────────────────────────────────── */
function SessionTooltip({ sessions, pos }) {
  return (
    <div style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999, background: C.dark, borderRadius: 10, padding: "10px 14px", minWidth: 240, maxWidth: 340, boxShadow: "0 8px 24px rgba(0,0,0,.4)", pointerEvents: "none" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.5, marginBottom: 7 }}>ИСТОРИЯ СЕССИЙ</div>
      {sessions.map((s) => {
        const dur = s.endedAt ? new Date(s.endedAt) - new Date(s.startedAt) : 0;
        return (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 5, fontSize: 12 }}>
            <span style={{ color: "#D0C8B8" }}>
              {fmtDate(s.startedAt)} → {s.endedAt ? hhmm(s.endedAt) : "..."}
            </span>
            <span style={{ color: C.gold, fontWeight: 700, flexShrink: 0 }}>{fmtMs(dur)}</span>
          </div>
        );
      })}
      <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.1)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span style={{ color: "#9CA3AF" }}>Всего</span>
        <span style={{ color: "#fff", fontWeight: 700 }}>{fmtMs(sessions.reduce((s, x) => s + (x.endedAt ? new Date(x.endedAt) - new Date(x.startedAt) : 0), 0))}</span>
      </div>
    </div>
  );
}

/* ─── TIME TAB ───────────────────────────────────────────── */
function TimeTab({ rows, onAddRow, onAddDivider, onUpdRow, onRmRow, totalWorkMin }) {

  /* Enter in any row → add after the last non-divider row
     that sits after the last divider (or at the very end)    */
  const addAtEnd = () => onAddRow(rows.length - 1);

  /* Block minutes for each divider: from row after prev divider up to this divider */
  const getBlockMins = (dividerIdx) => {
    let prevDiv = -1;
    for (let j = dividerIdx - 1; j >= 0; j--) {
      if (rows[j].isDivider) { prevDiv = j; break; }
    }
    return rows
      .slice(prevDiv + 1, dividerIdx)
      .filter(r => !r.isDivider && !r.notBillable)
      .reduce((s, r) => s + (parseTimeRange(combineRange(r.timeStart, r.timeEnd)) || 0), 0);
  };

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(0,0,0,.07)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.dark }}>⏱ Учёт времени</div>
        <span style={{ fontSize: 11, color: C.muted }}>Enter — новая строка в конце блока</span>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={onAddDivider} style={{ padding: "5px 14px", borderRadius: 8, border: `1px solid ${C.blue}`, background: C.blueBg, color: C.blue, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>+ Закрыть фронт работы</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead><tr>
            <th style={{ ...thS, width: 130 }}>ДАТА</th>
            <th style={{ ...thS, width: 160 }}>ХРОНОМЕТРАЖ</th>
            <th style={{ ...thS, width: 80, textAlign: "center" }}>МИН</th>
            <th style={{ ...thS, width: 80, textAlign: "center" }}>ЧАСОВ</th>
            <th style={thS}>РЕЗУЛЬТАТ РАБОТЫ</th>
            <th style={{ ...thS, width: 28 }} />
          </tr></thead>
          <tbody>
            {rows.map((row, i) => row.isDivider
              ? <DividerRow key={row.id} row={row} onUpd={onUpdRow} onRm={onRmRow} blockMins={getBlockMins(i)} />
              : <TimeRow    key={row.id} row={row} onUpd={onUpdRow} onRm={onRmRow} onAddBelow={addAtEnd} />
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: "#F9F8F6" }}>
              <td colSpan={2} style={{ ...tdS, fontWeight: 700, fontSize: 12, color: C.muted, letterSpacing: 0.5 }}>ИТОГО</td>
              <td style={{ ...tdS, textAlign: "center", fontWeight: 700, fontSize: 14, color: C.dark }}>{totalWorkMin > 0 ? totalWorkMin : "—"}</td>
              <td style={{ ...tdS, textAlign: "center", fontWeight: 700, fontSize: 14, color: C.success }}>{totalWorkMin > 0 ? (totalWorkMin / 60).toFixed(2) : "—"}</td>
              <td colSpan={2} style={{ ...tdS, fontSize: 12, color: C.muted }}>{totalWorkMin > 0 && fmtMins(totalWorkMin)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}


function SmartTimeInput({ value, onChange, placeholder, onAddBelow }) {
  const [raw, setRaw]         = useState(value);
  const [focused, setFocused] = useState(false);
  const commit = () => { const f = raw.trim() ? smartFormatTime(raw) : ""; setFocused(false); setRaw(f); onChange(f); };
  return (
    <input value={focused ? raw : value} onChange={e => setRaw(e.target.value)}
      onFocus={() => { setRaw(value); setFocused(true); }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Tab")        { commit(); }
        if (e.key === "Enter")      { e.preventDefault(); commit(); onAddBelow?.(); }
        if (e.key === "ArrowRight") { commit(); navCell(e, 1); }
        if (e.key === "ArrowLeft")  { commit(); navCell(e, -1); }
      }}
      style={{ ...baseInp, width: 68, padding: "4px 6px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
      placeholder={placeholder} />
  );
}

function SmartDateInput({ value, onChange, onAddBelow }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      onFocus={e => { if (!value) onChange(todayRu()); e.currentTarget.style.borderColor = C.gold; }}
      onBlur={e => e.currentTarget.style.borderColor = C.border}
      onKeyDown={e => {
        if (e.key === "Enter")      { e.preventDefault(); onAddBelow?.(); }
        if (e.key === "ArrowRight") navCell(e, 1);
        if (e.key === "ArrowLeft")  navCell(e, -1);
      }}
      style={{ ...baseInp, padding: "4px 7px" }} placeholder="дата" />
  );
}

function TimeRow({ row, onUpd, onRm, onAddBelow }) {
  const mins        = parseTimeRange(combineRange(row.timeStart, row.timeEnd));
  const isFromTask  = row.result?.startsWith("[") && row.result?.includes("]");
  const nb          = !!row.notBillable;
  const rowBg       = nb ? "rgba(220,38,38,.06)" : "#fff";
  const rowBgHover  = nb ? "rgba(220,38,38,.11)" : "#FDFCFB";
  return (
    <tr onMouseEnter={e => e.currentTarget.style.background = rowBgHover}
      onMouseLeave={e => e.currentTarget.style.background = rowBg}
      style={{ background: rowBg }}>
      <td style={{ ...tdS, borderLeft: nb ? `3px solid rgba(220,38,38,.45)` : "none" }}>
        <SmartDateInput value={row.date} onChange={v => onUpd(row.id, "date", v)} onAddBelow={onAddBelow} />
      </td>
      <td style={{ ...tdS, padding: "5px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <SmartTimeInput value={row.timeStart} onChange={v => onUpd(row.id, "timeStart", v)} placeholder="10:00" onAddBelow={onAddBelow} />
          <span style={{ color: C.muted, fontSize: 13, flexShrink: 0 }}>—</span>
          <SmartTimeInput value={row.timeEnd}   onChange={v => onUpd(row.id, "timeEnd",   v)} placeholder="12:00" onAddBelow={onAddBelow} />
        </div>
      </td>
      <td style={{ ...tdS, textAlign: "center" }}><span style={{ fontWeight: 600, color: mins ? C.dark : "#D1D5DB" }}>{mins ?? "—"}</span></td>
      <td style={{ ...tdS, textAlign: "center" }}><span style={{ fontWeight: 600, color: mins ? C.success : "#D1D5DB" }}>{mins ? (mins / 60).toFixed(2) : "—"}</span></td>
      <td style={tdS}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {nb && <span style={{ fontSize: 9, fontWeight: 700, color: C.danger, background: "rgba(220,38,38,.1)", borderRadius: 4, padding: "1px 5px", flexShrink: 0, whiteSpace: "nowrap" }}>не в счёт</span>}
          <input value={row.result} onChange={e => onUpd(row.id, "result", e.target.value)}
            style={{ ...baseInp, padding: "4px 7px", color: isFromTask ? C.blue : C.text, flex: 1 }}
            onKeyDown={e => {
              if (e.key === "Enter")      { e.preventDefault(); onAddBelow(); }
              if (e.key === "ArrowRight") navCell(e, 1);
              if (e.key === "ArrowLeft")  navCell(e, -1);
            }}
            onFocus={e => e.currentTarget.style.borderColor = C.gold}
            onBlur={e => e.currentTarget.style.borderColor = C.border}
            placeholder="Что сделано..." />
        </div>
      </td>
      <td style={{ ...tdS, textAlign: "center" }}>
        <button onClick={() => onRm(row.id)} style={{ background: "none", border: "none", color: "#D8D4CE", cursor: "pointer", fontSize: 15, lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = C.danger} onMouseLeave={e => e.currentTarget.style.color = "#D8D4CE"}>×</button>
      </td>
    </tr>
  );
}

function DividerRow({ row, onUpd, onRm, blockMins }) {
  const blockHours = blockMins > 0 ? (blockMins / 60).toFixed(2) : null;
  return (
    <tr style={{ background: "#EBF4FF" }}>
      <td colSpan={5} style={{ padding: "7px 10px", borderBottom: `2px solid ${C.blue}`, borderTop: `2px solid ${C.blue}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, flexShrink: 0 }}>🔷 ЗАКРЫТИЕ ФРОНТА РАБОТЫ</span>

          {/* Date — auto-fills today on focus */}
          <input
            value={row.date}
            onChange={e => onUpd(row.id, "date", e.target.value)}
            onFocus={e => { if (!row.date) onUpd(row.id, "date", todayRu()); e.currentTarget.style.borderColor = C.blue; }}
            onBlur={e => e.currentTarget.style.borderColor = "rgba(37,99,235,.3)"}
            style={{ ...baseInp, width: 110, padding: "3px 7px", background: "rgba(255,255,255,.7)", borderColor: "rgba(37,99,235,.3)", color: C.blue, fontSize: 12, fontWeight: 600 }}
            placeholder="Дата" />

          {/* Block time — computed automatically */}
          {blockHours !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(37,99,235,.08)", borderRadius: 7, padding: "3px 10px", border: "1px solid rgba(37,99,235,.2)", flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: "rgba(37,99,235,.6)", fontWeight: 600 }}>БЛОК</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.blue, fontVariantNumeric: "tabular-nums" }}>
                {fmtMins(blockMins)}
              </span>
              <span style={{ fontSize: 10, color: "rgba(37,99,235,.5)" }}>/ {blockHours} ч</span>
            </div>
          )}

          <input value={row.label || ""} onChange={e => onUpd(row.id, "label", e.target.value)}
            style={{ ...baseInp, flex: 1, padding: "3px 7px", background: "rgba(255,255,255,.7)", borderColor: "rgba(37,99,235,.3)", color: C.blue, fontSize: 12 }}
            placeholder="Примечание к счёту..." />
        </div>
      </td>
      <td style={{ padding: "7px 8px", borderBottom: `2px solid ${C.blue}`, borderTop: `2px solid ${C.blue}`, textAlign: "center" }}>
        <button onClick={() => onRm(row.id)} style={{ background: "none", border: "none", color: "rgba(37,99,235,.4)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = C.danger} onMouseLeave={e => e.currentTarget.style.color = "rgba(37,99,235,.4)"}>×</button>
      </td>
    </tr>
  );
}

/* ─── PAYMENTS TAB ──────────────────────────────────────── */
function PaymentsTab({ payments, onAdd, onUpd, onRm, totalPaidHours, totalPaidSum }) {
  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(0,0,0,.07)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.dark }}>💳 Оплати від клієнта</div>
        <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>Enter — новий рядок</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
          <thead><tr>
            <th style={{ ...thS, width: 140 }}>ДАТА</th>
            <th style={{ ...thS, width: 100, textAlign: "center" }}>ГОДИНИ</th>
            <th style={{ ...thS, width: 160, textAlign: "center" }}>ВАРТІСТЬ 1 ГОДИНИ, ₴</th>
            <th style={{ ...thS, width: 140, textAlign: "center" }}>СУМА, ₴</th>
            <th style={{ ...thS, width: 28 }} />
          </tr></thead>
          <tbody>
            {payments.map((p, pi) => {
              const sum = (parseFloat(p.hours) || 0) * (parseFloat(p.pricePerHour) || 0);
              const ab  = () => onAdd(pi);
              return (
                <tr key={p.id} onMouseEnter={e => e.currentTarget.style.background = "#FDFCFB"} onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                  <td style={tdS}><SmartDateInput value={p.date} onChange={v => onUpd(p.id, "date", v)} onAddBelow={ab} /></td>
                  <td style={{ ...tdS, textAlign: "center" }}>
                    <input value={p.hours} onChange={e => onUpd(p.id, "hours", e.target.value)} type="number" step="0.5"
                      style={{ ...baseInp, textAlign: "center", padding: "4px 7px", width: 80 }} placeholder="1"
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ab(); } }}
                      onFocus={e => e.currentTarget.style.borderColor = C.gold} onBlur={e => e.currentTarget.style.borderColor = C.border} />
                  </td>
                  <td style={{ ...tdS, textAlign: "center" }}>
                    <input value={p.pricePerHour} onChange={e => onUpd(p.id, "pricePerHour", e.target.value)} type="number"
                      style={{ ...baseInp, textAlign: "center", padding: "4px 7px", width: 120 }} placeholder="2000"
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ab(); } }}
                      onFocus={e => e.currentTarget.style.borderColor = C.gold} onBlur={e => e.currentTarget.style.borderColor = C.border} />
                  </td>
                  <td style={{ ...tdS, textAlign: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: sum > 0 ? C.success : "#D1D5DB" }}>
                      {sum > 0 ? fmtMoney(Math.round(sum)) + " ₴" : "—"}
                    </span>
                  </td>
                  <td style={{ ...tdS, textAlign: "center" }}>
                    <button onClick={() => onRm(p.id)} style={{ background: "none", border: "none", color: "#D8D4CE", cursor: "pointer", fontSize: 15, lineHeight: 1 }}
                      onMouseEnter={e => e.currentTarget.style.color = C.danger} onMouseLeave={e => e.currentTarget.style.color = "#D8D4CE"}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {payments.length > 0 && (
            <tfoot>
              <tr style={{ background: "#F9F8F6" }}>
                <td style={{ ...tdS, fontWeight: 700, fontSize: 12, color: C.muted, letterSpacing: 0.5 }}>РАЗОМ</td>
                <td style={{ ...tdS, textAlign: "center", fontWeight: 700, color: C.dark }}>{totalPaidHours > 0 ? totalPaidHours.toFixed(2) + " год" : "—"}</td>
                <td />
                <td style={{ ...tdS, textAlign: "center", fontWeight: 700, color: C.success }}>{totalPaidSum > 0 ? fmtMoney(Math.round(totalPaidSum)) + " ₴" : "—"}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ─── KNOWLEDGE BASE ────────────────────────────────────── */
function KbTab({ items, onAdd, onUpd, onRm }) {
  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(0,0,0,.07)", overflow: "hidden", maxWidth: 640 }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.dark }}>📚 База знаний</div>
        <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>Enter — новая запись</span>
      </div>
      <div style={{ padding: "10px 0" }}>
        {items.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 0", color: C.muted, fontSize: 13 }}>
            Нет записей
            <div style={{ marginTop: 10 }}><button onClick={() => onAdd(0)} style={{ padding: "5px 16px", borderRadius: 8, border: `1px dashed ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>+ Добавить</button></div>
          </div>
        )}
        {items.map((item, i) => {
          const ab = () => onAdd(i);
          return (
            <div key={item.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderBottom: i < items.length - 1 ? `1px solid #F5F4F1` : "none" }}
              onMouseEnter={e => e.currentTarget.style.background = "#FDFCFB"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <input value={item.name} onChange={e => onUpd(item.id, "name", e.target.value)}
                style={{ ...baseInp, width: 180, padding: "5px 8px", fontWeight: 600 }} placeholder="Название"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ab(); } }}
                onFocus={e => e.currentTarget.style.borderColor = C.gold} onBlur={e => e.currentTarget.style.borderColor = C.border} />
              <input value={item.url} onChange={e => onUpd(item.id, "url", e.target.value)}
                style={{ ...baseInp, flex: 1, padding: "5px 8px", color: C.blue }} placeholder="https://..."
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ab(); } }}
                onFocus={e => e.currentTarget.style.borderColor = C.gold} onBlur={e => e.currentTarget.style.borderColor = C.border} />
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: C.blue, flexShrink: 0, textDecoration: "none", background: C.blueBg, borderRadius: 6, padding: "4px 10px", border: `1px solid rgba(37,99,235,.25)`, fontWeight: 600 }}>
                  Открыть ↗
                </a>
              )}
              <button onClick={() => onRm(item.id)} style={{ background: "none", border: "none", color: "#D8D4CE", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = C.danger} onMouseLeave={e => e.currentTarget.style.color = "#D8D4CE"}>×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
