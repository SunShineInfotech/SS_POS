// src/lib/serveStatus.ts
// ------------------------------------------------------------------
// Item-level "served" tracking for running restaurant orders.
//
// Every cart line carries servedQty / servedUnits / addedAt / servedAt.
// These fields live inside the running order (restaurantOrders.ts →
// saveActiveOrder), so the Tables screen and the Billing screen always
// see the same state.
//
// servedUnits = one flag per unit (qty 3 → [true, false, false]) so the
// serve checklist can tick each unit separately. servedQty is always
// kept equal to the number of ticked units.
// ------------------------------------------------------------------

export interface ServeLine {
  id: number;
  name: string;
  qty: number;
  image?: string;
  /** How many units of this line have reached the table */
  servedQty?: number;
  /** Per-unit served flags (length = qty) */
  servedUnits?: boolean[];
  /** When this line (or its latest still-unserved units) was ordered */
  addedAt?: string | null;
  /** When the line became fully served */
  servedAt?: string | null;
}

/** Wait-time colour thresholds (minutes) */
export const WAIT_WARN_MIN = 10;
export const WAIT_LATE_MIN = 20;

export type WaitTone = "ok" | "warn" | "late";

const ts = (iso?: string | null) => {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};
const nowIso = () => new Date().toISOString();
const unitCount = (l: ServeLine) =>
  Math.max(0, Math.floor(Number(l.qty) || 0));

/* ---------- Line status ---------- */

export const servedQtyOf = (l: ServeLine) =>
  Math.min(Math.max(Number(l.servedQty) || 0, 0), Number(l.qty) || 0);

export const isLineServed = (l: ServeLine) =>
  (Number(l.qty) || 0) > 0 && servedQtyOf(l) >= Number(l.qty);

export const isLinePartial = (l: ServeLine) =>
  servedQtyOf(l) > 0 && !isLineServed(l);

/** One flag per unit — old orders (no servedUnits) are derived from servedQty */
export const unitFlags = (l: ServeLine): boolean[] => {
  const q = unitCount(l);
  const sq = servedQtyOf(l);
  if (
    Array.isArray(l.servedUnits) &&
    l.servedUnits.length === q &&
    l.servedUnits.filter(Boolean).length === sq
  )
    return l.servedUnits.map(Boolean);
  return Array.from({ length: q }, (_, i) => i < sq);
};

/** Rebuild a line from unit flags — keeps servedQty / servedAt in sync */
const fromFlags = <T extends ServeLine>(l: T, flags: boolean[]): T => {
  const sq = flags.filter(Boolean).length;
  const full = flags.length > 0 && sq === flags.length;
  return {
    ...l,
    servedUnits: flags,
    servedQty: sq,
    servedAt: full ? (isLineServed(l) ? (l.servedAt ?? nowIso()) : nowIso()) : null,
  };
};

/* ---------- Order progress ---------- */

export interface ServeProgress {
  lines: number;
  servedLines: number;
  pendingLines: number;
  qty: number;
  servedQty: number;
  pct: number;
  complete: boolean;
}

export const serveProgress = (items: ServeLine[] = []): ServeProgress => {
  const lines = items.length;
  const servedLines = items.filter(isLineServed).length;
  const qty = items.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const servedQty = items.reduce((s, l) => s + servedQtyOf(l), 0);
  return {
    lines,
    servedLines,
    pendingLines: lines - servedLines,
    qty,
    servedQty,
    pct: qty ? Math.round((servedQty / qty) * 100) : 0,
    complete: lines > 0 && servedLines === lines,
  };
};

const pickTime = (values: number[], mode: "min" | "max") => {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  return new Date(mode === "min" ? Math.min(...v) : Math.max(...v)).toISOString();
};

/** Oldest unserved line → how long the table has been waiting */
export const oldestPendingAt = (
  items: ServeLine[],
  fallback?: string | null,
): string | null =>
  pickTime(
    items
      .filter((l) => !isLineServed(l))
      .map((l) => {
        const t = ts(l.addedAt);
        return Number.isFinite(t) ? t : ts(fallback);
      }),
    "min",
  );

/** When the first item of this visit was ordered */
export const firstOrderedAt = (
  items: ServeLine[],
  fallback?: string | null,
): string | null =>
  pickTime([...items.map((l) => ts(l.addedAt)), ts(fallback)], "min");

/** When the last item was served (order completion time) */
export const lastServedAt = (items: ServeLine[]): string | null =>
  pickTime(
    items.map((l) => ts(l.servedAt)),
    "max",
  );

/** Pending first (oldest on top), served lines at the bottom */
export const sortForServing = <T extends ServeLine>(items: T[]): T[] =>
  [...items].sort((a, b) => {
    const da = isLineServed(a) ? 1 : 0;
    const db = isLineServed(b) ? 1 : 0;
    if (da !== db) return da - db;
    return (ts(a.addedAt) || 0) - (ts(b.addedAt) || 0);
  });

/* ---------- Mutations (pure — return a new array / line) ---------- */

/** Tick / untick one unit of a line (qty-wise checklist) */
export const toggleUnitServed = <T extends ServeLine>(
  items: T[],
  id: number,
  index: number,
): T[] =>
  items.map((l) => {
    if (l.id !== id) return l;
    const flags = unitFlags(l);
    if (index < 0 || index >= flags.length) return l;
    flags[index] = !flags[index];
    return fromFlags(l, flags);
  });

/** Whole line served ↔ pending */
export const toggleLineServed = <T extends ServeLine>(items: T[], id: number): T[] =>
  items.map((l) =>
    l.id !== id
      ? l
      : fromFlags(l, Array.from({ length: unitCount(l) }, () => !isLineServed(l))),
  );

export const setLineServed = <T extends ServeLine>(
  items: T[],
  id: number,
  served: boolean,
): T[] =>
  items.map((l) =>
    l.id !== id ? l : fromFlags(l, Array.from({ length: unitCount(l) }, () => served)),
  );

export const setAllServed = <T extends ServeLine>(items: T[], served: boolean): T[] =>
  items.map((l) =>
    served && isLineServed(l)
      ? l
      : fromFlags(l, Array.from({ length: unitCount(l) }, () => served)),
  );

/**
 * Qty change from the cart that keeps served info consistent.
 * - More units → new unticked units; on a fully served line they start a fresh wait.
 * - Fewer units → unserved units are removed first.
 */
export const withQtyChange = <T extends ServeLine>(l: T, nextQty: number): T => {
  const flags = unitFlags(l);
  if (nextQty > l.qty) {
    const wasServed = isLineServed(l);
    while (flags.length < nextQty) flags.push(false);
    const next = fromFlags({ ...l, qty: nextQty }, flags);
    return {
      ...next,
      addedAt: wasServed ? nowIso() : (l.addedAt ?? nowIso()),
    };
  }
  while (flags.length > Math.max(0, nextQty)) {
    const i = flags.lastIndexOf(false);
    if (i >= 0) flags.splice(i, 1);
    else flags.pop();
  }
  return fromFlags({ ...l, qty: nextQty }, flags);
};

/* ---------- Time helpers ---------- */

export const minutesSince = (iso?: string | null, now = Date.now()) => {
  const t = ts(iso);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 60000) : 0;
};

export const waitTone = (mins: number): WaitTone =>
  mins >= WAIT_LATE_MIN ? "late" : mins >= WAIT_WARN_MIN ? "warn" : "ok";

/** Live timer text — 04:32 or 1:04:32 */
export const formatTimer = (iso?: string | null, now = Date.now()) => {
  const t = ts(iso);
  if (!Number.isFinite(t)) return "--:--";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

/** Duration between two instants — "14 min", "1h 5m" */
export const formatSpan = (from?: string | null, to?: string | null) => {
  const a = ts(from);
  const b = ts(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const mins = Math.max(0, Math.round((b - a) / 60000));
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};