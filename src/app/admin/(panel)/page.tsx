"use client";

/**
 * Orders day view (003 spec FR2–FR4, research D3): polls the full day every
 * ~5s, filters client-side (so the new-order alert never goes blind behind a
 * filter), loops a Web Audio two-tone while unaccepted `new` orders exist,
 * and drives the detail panel. On 409 stale_state (another device won the
 * race) it refetches and re-renders the valid actions.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { OrderStatus } from "@/lib/order-status";
import { localDateKey } from "@/lib/schedule";

import { DayHeader } from "@/components/admin/DayHeader";
import { shiftDateKey } from "@/components/admin/format";
import { OrderDetailPanel, type TransitionExtras } from "@/components/admin/OrderDetailPanel";
import { OrdersList } from "@/components/admin/OrdersList";
import { SoundToggle, type SoundState } from "@/components/admin/SoundToggle";
import { StatusFilterChips } from "@/components/admin/StatusFilterChips";
import type { DayView, OrderDetailPayload } from "@/components/admin/types";

const POLL_INTERVAL_MS = 5000;
const ALERT_INTERVAL_MS = 3000;

const ACTION_ERRORS_RO: Record<string, string> = {
  invalid_transition: "Tranziția nu mai este permisă din starea curentă a comenzii.",
  cancel_reason_required: "Motivul anulării este obligatoriu.",
  estimate_not_allowed: "Estimarea se poate seta doar la preluarea comenzii.",
  nothing_to_undo: "Nu mai există un pas de anulat.",
  not_found: "Comanda nu a fost găsită.",
  validation: "Date invalide — estimarea trebuie să fie un număr întreg de minute (> 0).",
};

/** Short two-note ding; called repeatedly while a `new` order waits (Q4). */
function playAlertTone(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const notes: [frequency: number, offset: number][] = [
    [880, 0],
    [659.25, 0.18],
  ];
  for (const [frequency, offset] of notes) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(0.35, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.35);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.4);
  }
}

export default function AdminOrdersPage() {
  const [dateKey, setDateKey] = useState(() => localDateKey(new Date()));
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const [dayView, setDayView] = useState<DayView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrderDetailPayload | null>(null);
  const [detailNotice, setDetailNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Mirror of `detail` readable from the poller without re-creating it.
  const detailRef = useRef<OrderDetailPayload | null>(null);

  const setDetailState = useCallback((value: OrderDetailPayload | null) => {
    detailRef.current = value;
    setDetail(value);
  }, []);

  const refreshDetail = useCallback(
    async (orderId: number) => {
      const response = await fetch(`/api/admin/orders/${orderId}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (response.status === 404) {
        setSelectedId(null);
        setDetailState(null);
        return;
      }
      if (response.ok) setDetailState((await response.json()) as OrderDetailPayload);
    },
    [setDetailState],
  );

  const refreshList = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(`/api/admin/orders?date=${dateKey}`, { signal, cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!response.ok) {
        setLoadFailed(true);
        return;
      }
      const view = (await response.json()) as DayView;
      setDayView(view);
      setLoadFailed(false);
      // Cross-device reconcile (research D3; two devices, Q3): the poller saw
      // a different status than the open panel → the panel is stale.
      const current = detailRef.current;
      if (current) {
        const listRow = view.orders.find((order) => order.id === current.order.id);
        if (
          listRow &&
          (listRow.status !== current.order.status || listRow.estimateMinutes !== current.order.estimateMinutes)
        ) {
          void refreshDetail(current.order.id).catch(() => {});
        }
      }
    },
    [dateKey, refreshDetail],
  );

  useEffect(() => {
    const controller = new AbortController();
    const poll = () => {
      void refreshList(controller.signal).catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [refreshList]);

  function handleSelect(orderId: number) {
    setSelectedId(orderId);
    setDetailState(null);
    setDetailNotice(null);
    void refreshDetail(orderId).catch(() => {});
  }

  function handleClose() {
    setSelectedId(null);
    setDetailState(null);
    setDetailNotice(null);
  }

  const hasNewOrders = dayView?.orders.some((order) => order.status === "new") ?? false;

  useEffect(() => {
    if (!hasNewOrders || !soundEnabled) return;
    let disposed = false;
    const ring = () => {
      audioContextRef.current ??= new AudioContext();
      const ctx = audioContextRef.current;
      if (ctx.state === "running") {
        setSoundBlocked(false);
        playAlertTone(ctx);
        return;
      }
      // Autoplay policy: resume() only sticks after a user gesture — until
      // then surface the blocked state instead of failing silently.
      void ctx
        .resume()
        .then(() => {
          if (disposed) return;
          const running = ctx.state === "running";
          setSoundBlocked(!running);
          if (running) playAlertTone(ctx);
        })
        .catch(() => {
          if (!disposed) setSoundBlocked(true);
        });
    };
    ring();
    const interval = setInterval(ring, ALERT_INTERVAL_MS);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [hasNewOrders, soundEnabled]);

  function toggleSound() {
    // Runs inside a click — the gesture browsers require to unlock audio.
    audioContextRef.current ??= new AudioContext();
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    if (soundBlocked) {
      setSoundBlocked(false);
      setSoundEnabled(true);
    } else {
      setSoundEnabled((enabled) => !enabled);
    }
  }

  const soundState: SoundState = soundEnabled ? (soundBlocked ? "blocked" : "on") : "off";

  async function performAction(path: string, body?: object) {
    if (selectedId == null) return;
    setBusy(true);
    setDetailNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok) {
        setDetailState(payload as OrderDetailPayload);
        void refreshList().catch(() => {});
        return;
      }
      if (response.status === 409) {
        setDetailNotice("Starea s-a schimbat de pe alt dispozitiv — comanda a fost reîncărcată.");
      } else {
        const code = (payload as { error?: string } | null)?.error;
        setDetailNotice((code && ACTION_ERRORS_RO[code]) ?? "Acțiunea nu a reușit. Reîncearcă.");
      }
      await refreshDetail(selectedId);
      void refreshList().catch(() => {});
    } catch {
      setDetailNotice("Eroare de rețea. Verifică conexiunea și reîncearcă.");
    } finally {
      setBusy(false);
    }
  }

  function handleTransition(to: OrderStatus, extras?: TransitionExtras) {
    if (selectedId == null) return;
    void performAction(`/api/admin/orders/${selectedId}/transition`, { to, ...extras });
  }

  function handleUndo() {
    if (selectedId == null) return;
    void performAction(`/api/admin/orders/${selectedId}/undo`);
  }

  const isToday = dateKey === localDateKey(new Date());
  const orders = dayView?.orders ?? [];
  const filteredOrders = statusFilter ? orders.filter((order) => order.status === statusFilter) : orders;
  const statusCounts: Partial<Record<OrderStatus, number>> = {};
  for (const order of orders) {
    statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Comenzi</h1>
        <SoundToggle state={soundState} onToggle={toggleSound} />
      </div>

      <DayHeader
        dateKey={dateKey}
        isToday={isToday}
        totals={dayView && dayView.date === dateKey ? dayView.totals : null}
        onPrevDay={() => setDateKey((key) => shiftDateKey(key, -1))}
        onNextDay={() => setDateKey((key) => shiftDateKey(key, 1))}
        onToday={() => setDateKey(localDateKey(new Date()))}
      />

      <StatusFilterChips value={statusFilter} counts={statusCounts} onChange={setStatusFilter} />

      {loadFailed && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          Nu am putut încărca comenzile. Verifică conexiunea — reîncercăm automat.
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-4">
        {dayView == null && !loadFailed ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Se încarcă…</p>
        ) : (
          <OrdersList orders={filteredOrders} selectedId={selectedId} onSelect={handleSelect} />
        )}

        {detail && (
          <div className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-3 pt-10 lg:sticky lg:top-20 lg:z-auto lg:overflow-visible lg:bg-transparent lg:p-0">
            <OrderDetailPanel
              detail={detail}
              busy={busy}
              notice={detailNotice}
              onTransition={handleTransition}
              onUndo={handleUndo}
              onClose={handleClose}
            />
          </div>
        )}
      </div>
    </div>
  );
}
