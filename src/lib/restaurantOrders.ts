// src/lib/restaurantOrders.ts
// Shared between RestaurantBilling and RestaurantTables.
// A table counts as "Booked" while it has a running order (items in the cart)
// or one or more held bills.
import { loadStore, saveStore } from "@/lib/store";

export const HOLD_KEY = "restaurant-holds";
export const ACTIVE_ORDERS_KEY = "restaurant-active-orders";
/** Fired on window whenever running orders / held bills change */
export const ORDERS_EVENT = "restaurant-orders-changed";

export interface ActiveOrderItem {
  id: number;
  name: string;
  image: string;
  final_amount: number;
  category_name: string;
  cgst: number;
  sgst: number;
  stock: number;
  qty: number;
}

export interface ActiveOrder {
  tableId: string;
  tableName: string;
  items: ActiveOrderItem[];
  customerName: string;
  customerMobile: string;
  customerId: number | null;
  discountType: "%" | "₹";
  discountValue: number;
  resumedId: number | null;
  amount: number;
  startedAt: string;
  updatedAt: string;
}

export interface HeldBillLite {
  id: number;
  tableId?: string;
  tableName: string;
  customerName?: string;
  amount: number;
  heldAt: string;
  items: { qty: number }[];
}

export interface TableOccupancy {
  running: ActiveOrder | null;
  holds: HeldBillLite[];
  amount: number;
  items: number;
  /** Earliest start of the running order / held bills */
  since: string | null;
}

const readArray = <T,>(key: string): T[] => {
  try {
    const v = loadStore<T>(key, []);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export const notifyOrdersChanged = () => {
  try {
    window.dispatchEvent(new Event(ORDERS_EVENT));
  } catch {
    /* non-browser */
  }
};

export const getActiveOrders = () => readArray<ActiveOrder>(ACTIVE_ORDERS_KEY);

export const getActiveOrder = (tableId: string): ActiveOrder | null =>
  getActiveOrders().find((o) => String(o.tableId) === String(tableId)) ??
  null;

export const saveActiveOrder = (
  order: Omit<ActiveOrder, "startedAt" | "updatedAt">,
) => {
  const list = getActiveOrders();
  const id = String(order.tableId);
  const prev = list.find((o) => String(o.tableId) === id);
  const now = new Date().toISOString();
  const next: ActiveOrder = {
    ...order,
    tableId: id,
    startedAt: prev?.startedAt ?? now,
    updatedAt: now,
  };
  saveStore(ACTIVE_ORDERS_KEY, [
    next,
    ...list.filter((o) => String(o.tableId) !== id),
  ]);
  notifyOrdersChanged();
};

export const clearActiveOrder = (tableId: string) => {
  const list = getActiveOrders();
  const next = list.filter((o) => String(o.tableId) !== String(tableId));
  if (next.length !== list.length) {
    saveStore(ACTIVE_ORDERS_KEY, next);
    notifyOrdersChanged();
  }
};

export const getHeldBills = () => readArray<HeldBillLite>(HOLD_KEY);

/** Running order + held bills per table id (only occupied tables are in the map) */
export const buildOccupancy = (
  tables: { id: string | number; name: string }[],
): Map<string, TableOccupancy> => {
  const orders = getActiveOrders();
  const holds = getHeldBills();
  const map = new Map<string, TableOccupancy>();

  for (const t of tables) {
    const id = String(t.id);
    const running =
      orders.find((o) => String(o.tableId) === id && o.items?.length > 0) ??
      null;
    // Older held bills have no tableId — fall back to the table name
    const tHolds = holds.filter((h) =>
      h.tableId != null && h.tableId !== ""
        ? String(h.tableId) === id
        : h.tableName === t.name,
    );
    if (!running && tHolds.length === 0) continue;

    const qty = (items?: { qty: number }[]) =>
      (items ?? []).reduce((s, i) => s + (Number(i.qty) || 0), 0);

    const times = [
      running?.startedAt,
      ...tHolds.map((h) => h.heldAt),
    ].filter(Boolean) as string[];

    map.set(id, {
      running,
      holds: tHolds,
      amount:
        (running?.amount ?? 0) +
        tHolds.reduce((s, h) => s + (Number(h.amount) || 0), 0),
      items: qty(running?.items) + tHolds.reduce((s, h) => s + qty(h.items), 0),
      since: times.length
        ? times.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))
        : null,
    });
  }
  return map;
};