"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isAccountDetails,
  object,
  isPaymentReceipt,
  type AccountDetails,
} from "./live-contract";
import { useFinancialAttempts } from "./financial-attempt-provider";
import {
  isDurableAttempt,
  isAttemptHistory,
  isPreparationContext,
  isResolutionReview,
  parsePreparation,
  parseResolution,
  matchesPreparation,
  type DurableAttempt,
  type PreparationInput,
  type PreparationContext,
  type ResolutionReview,
  type ResolutionInput,
} from "./attempt-contract";
type Snapshot = {
  scope: string;
  data: AccountDetails | null;
  context: PreparationContext | null;
  attempt: DurableAttempt | null;
  history: DurableAttempt[];
  nextCursor: string | null;
  review: ResolutionReview | null;
  administrative: boolean;
  uncertain: boolean;
  conflict: boolean;
  error: string;
  feedback: string;
  sending: boolean;
};
const initial = (scope: string): Snapshot => ({
  scope,
  data: null,
  context: null,
  attempt: null,
  history: [],
  nextCursor: null,
  review: null,
  administrative: false,
  uncertain: true,
  conflict: false,
  error: "",
  feedback: "",
  sending: false,
});
const stateMessage = (row: DurableAttempt) =>
  row.status === "CONFIRMED"
    ? row.receiptAvailability === "RECONCILIATION_REQUIRED"
      ? "Pago confirmado. Su evidencia se conserva; el saldo requiere conciliación. No vuelvas a cobrar este intento."
      : "Pago confirmado por el servidor."
    : row.status === "REJECTED"
      ? "Este intento no registró un pago en WOK: " + row.rejectionMessage
      : row.status === "PENDING"
        ? "Resultado pendiente. Consulta el intento original; no vuelvas a recibir dinero."
        : row.status === "RETIRED"
          ? "Intento retirado. Se conserva su historia y la deuda de la cuenta."
          : "Intento preparado. Revisa el importe congelado antes de confirmar la captura.";
export function useAccountFinance(
  accountId: string,
  administrativeAttemptId?: string,
) {
  const {
      userId,
      permissions,
      ready,
      selections,
      legacyHints,
      storageNotice,
      identity,
      valid: validIdentity,
      ensureSession,
      select,
    } = useFinancialAttempts(),
    scope =
      userId +
      ":" +
      accountId +
      (administrativeAttemptId ? ":review:" + administrativeAttemptId : "");
  const current = useRef(scope);
  const mounted = useRef(true),
    loadSequence = useRef(0),
    latch = useRef(false);
  const selection = useRef(selections);
  const legacy = useRef(legacyHints);
  useLayoutEffect(() => {
    current.current = scope;
    selection.current = selections;
    legacy.current = legacyHints;
  }, [scope, selections, legacyHints]);
  const proposed = useRef<{ scope: string; input: PreparationInput } | null>(
    null,
  );
  const memory = useRef<Snapshot>(initial(scope));
  const [snapshot, setSnapshot] = useState<Snapshot>(() => initial(scope));
  const reviewTarget = useCallback(() => {
    if (administrativeAttemptId) return administrativeAttemptId;
    const v = new URLSearchParams(window.location.search).get("reviewAttempt");
    return v && isUuid(v) ? v : null;
  }, [administrativeAttemptId]);
  const valid = useCallback(
    (ticket: ReturnType<typeof identity>, target: string) =>
      mounted.current && current.current === target && validIdentity(ticket),
    [validIdentity],
  );
  const refresh = useCallback(async () => {
    if (!ready) return;
    const ticket = identity(),
      target = scope,
      requestedReview = reviewTarget(),
      requestedSelection = new URLSearchParams(window.location.search).get(
        "selectedAttempt",
      ),
      sequence = ++loadSequence.current;
    const check = () => {
      if (
        !valid(ticket, target) ||
        (administrativeAttemptId &&
          new URLSearchParams(window.location.search).get("reviewAttempt") !==
            administrativeAttemptId) ||
        loadSequence.current !== sequence ||
        reviewTarget() !== requestedReview ||
        new URLSearchParams(window.location.search).get("selectedAttempt") !==
          requestedSelection
      )
        throw Error("La cuenta o sesión cambió.");
    };
    const headers = { "X-Financial-Actor": ticket.userId },
      base = "/bff/operational/accounts/" + accountId;
    async function read<T>(
      url: string,
      guard: (v: unknown) => v is T,
    ): Promise<T> {
      const response = await fetch(url, { cache: "no-store", headers });
      check();
      const body: unknown = await response.json().catch(() => null);
      check();
      if (!response.ok || !guard(body))
        throw Error(
          object(body) && typeof body.message === "string"
            ? body.message
            : "Resultado no consultable o DTO inválido. No autoriza otra captura.",
        );
      return body;
    }
    try {
      await ensureSession(
        requestedReview
          ? ["payments:manage", "payments:resolve"]
          : permissions.includes("payments:manage")
            ? ["payments:manage"]
            : ["accounts:manage"],
      );
      check();
      const data = await read(base, isAccountDetails);
      check();
      if (data.account.id !== accountId)
        throw Error("La cuenta recibida no coincide.");
      if (requestedReview && administrativeAttemptId) {
        const review = await read(
          base + "/payment-attempts/" + requestedReview + "/resolution",
          isResolutionReview,
        );
        check();
        if (
          review.attempt.accountId !== accountId ||
          review.attempt.attemptId !== requestedReview
        )
          throw Error("La revisión recibida no coincide.");
        const previous =
          memory.current.scope === target ? memory.current : initial(target);
        const next = {
          ...initial(target),
          data,
          review,
          administrative: true,
          uncertain: false,
          feedback: previous.feedback,
          sending: previous.sending,
        };
        memory.current = next;
        setSnapshot(next);
        return;
      }
      if (!requestedReview && !permissions.includes("payments:manage")) {
        const next = { ...initial(target), data, uncertain: false };
        memory.current = next;
        setSnapshot(next);
        return;
      }
      const context = await read(
        base + "/payment-attempts/context",
        isPreparationContext,
      );
      check();
      if (context.accountId !== accountId)
        throw Error("El contexto no coincide.");
      const history = await read(base + "/payment-attempts", isAttemptHistory);
      check();
      if (history.items.some((i) => i.accountId !== accountId))
        throw Error("El historial no coincide.");
      let attempt =
        context.ownActiveAttempt ??
        history.items.find(
          (i) => i.attemptId === selection.current[accountId]?.attemptId,
        ) ??
        history.items[0] ??
        null;
      if (requestedSelection) {
        if (!isUuid(requestedSelection))
          throw Error(
            "Selección inválida; consulta el historial del servidor.",
          );
        const selected = await read(
          base + "/payment-attempts/" + requestedSelection,
          isDurableAttempt,
        );
        check();
        if (
          selected.accountId !== accountId ||
          selected.attemptId !== requestedSelection
        )
          throw Error("El intento seleccionado no coincide.");
        attempt = selected;
      }
      let legacyNotice = "";
      const hint = legacy.current[accountId];
      if (hint && !context.ownActiveAttempt) {
        // Una referencia v1 nunca reenvía el payload local ni crea una identidad.
        try {
          const row = await read(
            base + "/payment-attempts/by-legacy-key/" + hint,
            isDurableAttempt,
          );
          check();
          if (row.accountId !== accountId)
            throw Error("Referencia de otra cuenta.");
          attempt = row;
        } catch (cause) {
          check();
          legacyNotice =
            "La referencia anterior no tiene un intento durable consultable. Requiere revisión; no se reenviará el cobro.";
          try {
            const old = await read(
              base + "/payments/by-idempotency-key/" + hint,
              isPaymentReceipt,
            );
            check();
            if (old.accountId === accountId)
              legacyNotice =
                "Existe un pago legacy confirmado: " +
                old.paymentId +
                ". No se crea ni captura otro intento para recuperarlo.";
          } catch {
            check();
          }
        }
      }
      const review = requestedReview
        ? await read(
            base + "/payment-attempts/" + requestedReview + "/resolution",
            isResolutionReview,
          )
        : null;
      check();
      if (
        review &&
        (review.attempt.accountId !== accountId ||
          review.attempt.attemptId !== requestedReview)
      )
        throw Error("La revisión recibida no coincide.");
      const conflict = !!(
        context.ownActiveAttempt &&
        proposed.current?.scope === target &&
        !matchesPreparation(context.ownActiveAttempt, proposed.current.input)
      );
      const old =
        memory.current.scope === target ? memory.current : initial(target);
      const next: Snapshot = {
        ...old,
        scope: target,
        data,
        context,
        history: history.items,
        nextCursor: history.nextCursor ?? null,
        attempt,
        review,
        administrative: !!requestedReview,
        uncertain: false,
        conflict,
        error:
          legacyNotice ||
          (conflict
            ? "El activo del servidor no coincide con la preparación enviada. Revísalo y selecciónalo explícitamente; no se capturará automáticamente."
            : ""),
        feedback: old.feedback,
        sending: old.sending,
      };
      memory.current = next;
      setSnapshot(next);
      if (attempt) select(accountId, attempt.attemptId);
    } catch (cause) {
      if (valid(ticket, target) && loadSequence.current === sequence) {
        const old =
          memory.current.scope === target ? memory.current : initial(target);
        const next = {
          ...old,
          uncertain: true,
          error:
            cause instanceof TypeError
              ? "Resultado incierto. No se pudo comunicar con el servidor. Consulta el intento original; no autoriza otro cobro."
              : cause instanceof Error
                ? cause.message
                : "Resultado incierto. Consulta el servidor.",
        };
        memory.current = next;
        setSnapshot(next);
      }
    }
  }, [
    scope,
    accountId,
    identity,
    ensureSession,
    select,
    permissions,
    valid,
    reviewTarget,
    administrativeAttemptId,
    ready,
  ]);
  const cancelReads = useCallback(() => {
    mounted.current = false;
    loadSequence.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => void refresh(), 0);
    const focus = () => void refresh();
    const visibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const logout = () => {
      loadSequence.current++;
      const next = initial(current.current);
      memory.current = next;
      setSnapshot(next);
    };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", focus);
    window.addEventListener("wok:logout", logout);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelReads();
      clearTimeout(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", focus);
      window.removeEventListener("wok:logout", logout);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh, cancelReads]);
  async function mutate(
    kind: "prepare" | "capture" | "retire" | "replacement" | "resolve",
    input?: PreparationInput | ResolutionInput | string,
    targetAttempt?: { attemptId: string; version: number },
  ) {
    // Destino, identidad, contenido y versión se capturan antes del primer await.
    const ticket = identity(),
      target = scope,
      view = memory.current,
      account = accountId,
      administrativeId = reviewTarget();
    const row = kind === "resolve" ? view.review?.attempt : view.attempt;
    const previous = view.context?.expectedPreviousAttemptId ?? null,
      reasonReplacement = replacementReason.current;
    const prepared =
      kind === "prepare" || kind === "replacement"
        ? parsePreparation(structuredClone(input))
        : null;
    if (latch.current) return;
    latch.current = true;
    const check = () => {
      if (
        !valid(ticket, target) ||
        reviewTarget() !== administrativeId ||
        (administrativeAttemptId &&
          new URLSearchParams(window.location.search).get("reviewAttempt") !==
            administrativeAttemptId)
      )
        throw Error(
          "La sesión, cuenta o destino cambió. Consulta el registro original.",
        );
    };
    const update = (changes: Partial<Snapshot>) => {
      if (!valid(ticket, target)) return;
      const old =
        memory.current.scope === target ? memory.current : initial(target);
      const next = { ...old, ...changes };
      memory.current = next;
      setSnapshot(next);
    };
    update({ sending: true, error: "", feedback: "" });
    const headers = { "X-Financial-Actor": ticket.userId },
      base = "/bff/operational/accounts/" + account + "/payment-attempts";
    async function read<T>(url: string, guard: (v: unknown) => v is T) {
      const response = await fetch(url, { cache: "no-store", headers });
      check();
      const body: unknown = await response.json().catch(() => null);
      check();
      if (!response.ok || !guard(body))
        throw Error(
          "No pudimos revalidar el registro. Consulta antes de continuar.",
        );
      return body;
    }
    try {
      check();
      if (view.scope !== target || view.uncertain || view.conflict)
        throw Error("Consulta y revisa primero el registro del servidor.");
      if (
        kind !== "resolve" &&
        (view.administrative || !!administrativeAttemptId)
      )
        throw Error(
          "La consulta administrativa no autoriza acciones del propietario.",
        );
      if (
        kind !== "prepare" &&
        (!row ||
          (targetAttempt &&
            (row.attemptId !== targetAttempt.attemptId ||
              row.version !== targetAttempt.version)))
      )
        throw Error(
          "La selección o versión cambió. Revisa el contenido congelado.",
        );
      if (
        kind === "prepare" &&
        (!prepared ||
          !view.context?.canPrepare ||
          (prepared.expectedPreviousAttemptId ?? null) !== previous)
      )
        throw Error(
          "La preparación requiere contenido explícito y contexto actualizado.",
        );
      if (
        kind === "replacement" &&
        (!prepared || prepared.expectedPreviousAttemptId !== row?.attemptId)
      )
        throw Error("El reemplazo debe estar vinculado al rechazo original.");
      await ensureSession(
        kind === "resolve"
          ? ["payments:manage", "payments:resolve"]
          : ["payments:manage"],
      );
      check();
      let payload: unknown = prepared,
        url = base;
      if (kind === "prepare") {
        const context = await read(base + "/context", isPreparationContext);
        check();
        if (
          context.accountId !== account ||
          !context.canPrepare ||
          (context.expectedPreviousAttemptId ?? null) !== previous
        )
          throw Error(
            "El contexto cambió. Revisa antes de preparar otra operación.",
          );
        proposed.current = { scope: target, input: prepared! };
      } else if (kind === "resolve") {
        const review = await read(
          base + "/" + row!.attemptId + "/resolution",
          isResolutionReview,
        );
        check();
        const evidence = parseResolution(input);
        if (
          review.attempt.accountId !== account ||
          review.attempt.attemptId !== row!.attemptId ||
          review.attempt.version !== row!.version ||
          review.ownerUserId === ticket.userId ||
          !review.availableActions.includes("RETIRE_WITH_EVIDENCE") ||
          !evidence ||
          evidence.expectedVersion !== row!.version
        )
          throw Error(
            "Otro responsable, evidencia NOT_RECEIVED y versión vigente son obligatorios.",
          );
        payload = evidence;
        url += "/" + row!.attemptId + "/resolution";
      } else {
        const latest = await read(
          base + "/" + row!.attemptId,
          isDurableAttempt,
        );
        check();
        const action =
          kind === "capture"
            ? row!.status === "PENDING"
              ? "CONTINUE_SAME_ATTEMPT"
              : "CAPTURE"
            : kind === "retire"
              ? "RETIRE"
              : "REPLACE";
        if (
          latest.accountId !== account ||
          latest.attemptId !== row!.attemptId ||
          latest.version !== row!.version ||
          latest.status !== row!.status ||
          !latest.availableActions.includes(action)
        )
          throw Error(
            "El intento o su versión cambió. Consulta y revisa nuevamente.",
          );
        if (kind === "replacement" && latest.status !== "REJECTED")
          throw Error("Solo un rechazo durable autorizado permite reemplazo.");
        url += "/" + row!.attemptId + "/" + kind;
        const reason = typeof input === "string" ? input : undefined;
        payload =
          kind === "capture"
            ? { expectedVersion: row!.version }
            : kind === "retire"
              ? { expectedVersion: row!.version, reason }
              : {
                  expectedVersion: row!.version,
                  reason: reasonReplacement,
                  payment: prepared,
                };
        if (
          kind !== "capture" &&
          (kind === "retire" ? !reason?.trim() : !reasonReplacement.trim())
        )
          throw Error("Indica el motivo.");
      }
      await ensureSession(
        kind === "resolve"
          ? ["payments:manage", "payments:resolve"]
          : ["payments:manage"],
      );
      check();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "X-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });
      check();
      const body: unknown = await response.json().catch(() => null);
      check();
      const result =
        kind === "resolve" && isResolutionReview(body)
          ? body.attempt
          : isDurableAttempt(body)
            ? body
            : null;
      if (
        !response.ok ||
        !result ||
        result.accountId !== account ||
        (row &&
          !["prepare", "replacement"].includes(kind) &&
          result.attemptId !== row.attemptId) ||
        (prepared && !matchesPreparation(result, prepared))
      )
        throw Error(
          object(body) && typeof body.message === "string"
            ? body.message
            : "Respuesta incierta o inválida. Consulta el intento; no autoriza reemplazo.",
        );
      select(account, result.attemptId);
      update(
        kind === "resolve"
          ? {
              review: body as ResolutionReview,
              feedback: stateMessage(result),
              uncertain: false,
            }
          : {
              attempt: result,
              feedback: stateMessage(result),
              uncertain: false,
            },
      );
      if (prepared) proposed.current = null;
      await refresh();
      check();
    } catch (cause) {
      update({
        uncertain: true,
        error:
          cause instanceof TypeError
            ? "Resultado incierto. No se pudo comunicar con el servidor. Consulta el intento original; no autoriza otro cobro."
            : cause instanceof Error
              ? cause.message
              : "Resultado incierto. Consulta el intento original.",
      });
    } finally {
      latch.current = false;
      update({ sending: false });
    }
  }
  const replacementReason = useRef("");
  async function loadMore() {
    const ticket = identity(),
      target = scope,
      old = memory.current,
      cursor = old.nextCursor;
    if (!cursor || old.scope !== target) return;
    try {
      await ensureSession();
      if (!valid(ticket, target)) return;
      const response = await fetch(
        "/bff/operational/accounts/" +
          accountId +
          "/payment-attempts?cursor=" +
          cursor,
        { cache: "no-store", headers: { "X-Financial-Actor": ticket.userId } },
      );
      if (!valid(ticket, target)) return;
      const body: unknown = await response.json();
      if (!valid(ticket, target)) return;
      if (
        !response.ok ||
        !isAttemptHistory(body) ||
        body.items.some((i) => i.accountId !== accountId)
      )
        throw Error("Historial no disponible.");
      const next = {
        ...memory.current,
        history: [
          ...memory.current.history,
          ...body.items.filter(
            (i) =>
              !memory.current.history.some((j) => j.attemptId === i.attemptId),
          ),
        ],
        nextCursor: body.nextCursor ?? null,
      };
      memory.current = next;
      setSnapshot(next);
    } catch {
      if (valid(ticket, target)) {
        const next = {
          ...memory.current,
          error: "No se pudo consultar otra página.",
        };
        memory.current = next;
        setSnapshot(next);
      }
    }
  }
  const view = snapshot.scope === scope && ready ? snapshot : initial(scope);
  return {
    ...view,
    administrative: !!administrativeAttemptId || view.administrative,
    ready: ready,
    userId: userId,
    permissions: permissions,
    storageNotice: storageNotice,
    blocked: view.uncertain || view.conflict,
    canPrepare:
      !!view.context?.canPrepare &&
      !view.uncertain &&
      !view.conflict &&
      !view.administrative &&
      !administrativeAttemptId,
    reload: () => void refresh(),
    check: refresh,
    recover: refresh,
    prepare: (input: PreparationInput) => mutate("prepare", input),
    capture: (selected: { attemptId: string; version: number }) =>
      mutate("capture", undefined, selected),
    retire: (
      reason: string,
      selected: { attemptId: string; version: number },
    ) => mutate("retire", reason, selected),
    replace: (input: PreparationInput, reason: string) => {
      replacementReason.current = reason;
      return mutate("replacement", input);
    },
    resolve: (
      input: ResolutionInput,
      selected: { attemptId: string; version: number },
    ) => mutate("resolve", input, selected),
    loadMore,
    selectAttempt: (id: string) => {
      const old = memory.current;
      if (old.scope !== scope || old.uncertain) return;
      const row = old.history.find((i) => i.attemptId === id);
      if (!row) return;
      proposed.current = null;
      select(accountId, id);
      const next = { ...old, attempt: row, conflict: false, error: "" };
      memory.current = next;
      setSnapshot(next);
    },
  };
}
