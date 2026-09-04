import { useState } from "react";
import { useParams } from "react-router-dom";
import { appendStore, findRecord, updateStore } from "@/lib/store";

/**
 * Shared add/edit form state for master data pages.
 * When the route carries an :id param the record is loaded from the store
 * and saving updates it in place; otherwise a new record is appended.
 */
export function useRecordForm<T extends Record<string, unknown>>(storeKey: string, defaults: T) {
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<T>(() => {
    if (!id) return defaults;
    const found = findRecord<any>(storeKey, id);
    return found ? ({ ...defaults, ...found } as T) : defaults;
  });

  const persist = (extra: Record<string, unknown> = {}) => {
    const payload = { ...form, ...extra };
    if (isEdit && id) updateStore<any>(storeKey, id, payload, []);
    else appendStore<any>(storeKey, { ...payload, id: Date.now() }, []);
  };

  return { form, setForm, isEdit, persist };
}
