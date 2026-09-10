"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Link2,
  Sparkles,
  Unlink,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import {
  operationalTables,
  type OperationalTable,
  type OperationalTableStatus,
} from "@/data/fixtures/operation";
import {
  useTableSession,
  type JoinedTableGroup,
} from "@/modules/tables/table-session-provider";

const tableStatus = {
  free: { icon: CircleCheck, label: "Libre", tone: "success" },
  occupied: { icon: UsersRound, label: "Ocupada", tone: "danger" },
  reserved: { icon: CalendarClock, label: "Reservada", tone: "warning" },
  preparing: { icon: Sparkles, label: "Preparación", tone: "info" },
  "out-of-service": {
    icon: Wrench,
    label: "Fuera de servicio",
    tone: "neutral",
  },
} satisfies Record<
  OperationalTableStatus,
  { icon: typeof CircleCheck; label: string; tone: string }
>;

type TableFilter = "all" | OperationalTableStatus;
type ZoneFilter = "all" | OperationalTable["zone"];
type FloorItem =
  | { kind: "table"; table: OperationalTable }
  | { kind: "group"; group: JoinedTableGroup };

const filters: { value: TableFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "free", label: "Libres" },
  { value: "occupied", label: "Ocupadas" },
  { value: "reserved", label: "Reservadas" },
  { value: "preparing", label: "Preparación" },
  { value: "out-of-service", label: "Fuera de servicio" },
];

export function TableFloorSessionView() {
  const { joinedGroups, joinTables, separateTables } = useTableSession();
  const [filter, setFilter] = useState<TableFilter>("all");
  const [zone, setZone] = useState<ZoneFilter>("all");
  const [joinMode, setJoinMode] = useState(false);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [pendingSeparation, setPendingSeparation] =
    useState<JoinedTableGroup | null>(null);
  const [feedback, setFeedback] = useState("");

  const joinedGroupByTable = useMemo(() => {
    const groups = new Map<string, JoinedTableGroup>();
    joinedGroups.forEach((group) => {
      group.tableIds.forEach((tableId) => groups.set(tableId, group));
    });
    return groups;
  }, [joinedGroups]);

  const floorItems = useMemo(() => {
    const renderedGroups = new Set<string>();
    return operationalTables.reduce<FloorItem[]>((items, table) => {
      const group = joinedGroupByTable.get(table.id);
      if (group) {
        if (
          renderedGroups.has(group.id) ||
          (filter !== "all" && filter !== "free") ||
          (zone !== "all" && group.zone !== zone)
        ) {
          return items;
        }
        renderedGroups.add(group.id);
        items.push({ kind: "group", group });
        return items;
      }

      if (
        (filter === "all" || table.status === filter) &&
        (zone === "all" || table.zone === zone)
      ) {
        items.push({ kind: "table", table });
      }
      return items;
    }, []);
  }, [filter, joinedGroupByTable, zone]);

  const firstSelectedTable = operationalTables.find(
    (table) => table.id === selectedTables[0],
  );

  const getDisabledReason = (table: OperationalTable) => {
    if (selectedTables.includes(table.id)) return "";
    if (table.status !== "free") return "Solo se pueden unir mesas libres";
    if (selectedTables.length >= 2) return "Solo se pueden unir dos mesas";
    if (!firstSelectedTable) return "";
    if (table.zone !== firstSelectedTable.zone) {
      return "Debe estar en la misma zona";
    }
    if (!firstSelectedTable.adjacentTableIds?.includes(table.id)) {
      return "Debe ser una mesa adyacente";
    }
    return "";
  };

  const joinInstruction =
    selectedTables.length === 0
      ? "Selecciona una mesa libre"
      : selectedTables.length === 1
        ? "Ahora selecciona una mesa libre adyacente"
        : "Las mesas están listas para unirse";

  const toggleJoinMode = () => {
    setJoinMode((current) => !current);
    setSelectedTables([]);
    setFeedback("");
  };

  const toggleTable = (table: OperationalTable) => {
    if (getDisabledReason(table)) return;
    setSelectedTables((current) =>
      current.includes(table.id)
        ? current.filter((id) => id !== table.id)
        : [...current, table.id],
    );
  };

  const confirmJoin = () => {
    const result = joinTables(selectedTables);
    setFeedback(result.message);
    if (!result.ok) return;
    setJoinMode(false);
    setSelectedTables([]);
  };

  const confirmSeparation = () => {
    if (!pendingSeparation) return;
    const result = separateTables(pendingSeparation.id);
    setFeedback(result.message);
    setPendingSeparation(null);
  };

  return (
    <div className="ops-dashboard table-floor">
      <header className="ops-page-header ops-page-header--focused">
        <div>
          <Link className="text-action" href="/operation">
            <ArrowLeft aria-hidden="true" size={15} /> Volver a operación
          </Link>
          <span className="ops-kicker">Salón en tiempo real</span>
          <h1>Mesas</h1>
          <p>Consulta ocupación, responsables y próximas reservas.</p>
        </div>
        <button
          className="button button--secondary button--compact"
          onClick={toggleJoinMode}
          type="button"
        >
          <Link2 aria-hidden="true" size={17} />
          {joinMode ? "Cancelar unión" : "Unir mesas"}
        </button>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <CircleCheck aria-hidden="true" size={18} />
          <span>{feedback}</span>
        </div>
      ) : null}

      <section className="table-floor__toolbar" aria-label="Controles de mesas">
        <div
          className="segmented-control table-filter"
          aria-label="Filtrar mesas"
        >
          {filters.map((item) => {
            const count =
              item.value === "all"
                ? operationalTables.length
                : operationalTables.filter(
                    (table) => table.status === item.value,
                  ).length;
            return (
              <button
                aria-pressed={filter === item.value}
                key={item.value}
                onClick={() => setFilter(item.value)}
                type="button"
              >
                {item.label} <span>{count}</span>
              </button>
            );
          })}
        </div>
        <label className="table-zone-filter">
          <span>Zona</span>
          <select
            onChange={(event) => setZone(event.target.value as ZoneFilter)}
            value={zone}
          >
            <option value="all">Todas</option>
            <option value="Salon">Salón</option>
            <option value="Terraza">Terraza</option>
          </select>
        </label>
      </section>

      {joinMode ? (
        <div className="table-join-bar" role="status">
          <div>
            <strong>{joinInstruction}</strong>
            <span>{selectedTables.length} de 2 seleccionadas</span>
          </div>
          <button
            className="button button--primary button--compact"
            disabled={selectedTables.length !== 2}
            onClick={confirmJoin}
            type="button"
          >
            Confirmar unión
          </button>
        </div>
      ) : null}

      <section className="table-grid" aria-label="Mapa de mesas">
        {floorItems.map((item) => {
          if (item.kind === "group") {
            const { group } = item;
            return (
              <article className="table-card table-card--joined" key={group.id}>
                <Link
                  aria-label={`Ver detalle de mesas ${group.numbers.join(" y ")}`}
                  className="table-card__joined-link"
                  href={`/operation/tables/${group.id}`}
                >
                  <div className="table-card__top">
                    <div className="table-card__number table-card__number--joined">
                      <span>Mesas</span>
                      <strong>{group.numbers.join(" + ")}</strong>
                    </div>
                    <span className="table-state table-state--joined">
                      <Link2 aria-hidden="true" size={16} /> Unidas
                    </span>
                  </div>
                  <div className="table-card__body">
                    <span>Capacidad combinada</span>
                    <strong>{group.capacity} personas</strong>
                    <small>
                      Se restan 2 lugares por las caras que quedan unidas.
                    </small>
                  </div>
                  <span className="table-card__open table-card__joined-open">
                    Ver detalle <ArrowRight aria-hidden="true" size={15} />
                  </span>
                </Link>
                <div className="table-card__footer">
                  <span>{group.zone}</span>
                  <button
                    aria-label={`Separar mesas ${group.numbers.join(" y ")}`}
                    className="table-card__separate"
                    onClick={() => setPendingSeparation(group)}
                    type="button"
                  >
                    <Unlink aria-hidden="true" size={15} /> Separar
                  </button>
                </div>
              </article>
            );
          }

          const { table } = item;
          const status = tableStatus[table.status];
          const StatusIcon = status.icon;
          const selected = selectedTables.includes(table.id);
          const disabledReason = joinMode ? getDisabledReason(table) : "";
          const cardContent = (
            <>
              <div className="table-card__top">
                <div className="table-card__number">
                  <span>Mesa</span>
                  <strong>{table.number}</strong>
                </div>
                <span className={`table-state table-state--${status.tone}`}>
                  <StatusIcon aria-hidden="true" size={16} />
                  {status.label}
                </span>
              </div>
              <div className="table-card__body">
                <span>
                  {table.guests > 0
                    ? `${table.guests} personas`
                    : `Capacidad ${table.capacity}`}
                </span>
                <strong>
                  {table.responsible ??
                    (table.status === "out-of-service"
                      ? "Revisión pendiente"
                      : "Sin asignar")}
                </strong>
                {table.nextReservation ? (
                  <small>
                    Próxima {table.nextReservation.time} ·{" "}
                    {table.nextReservation.guest}
                  </small>
                ) : table.elapsed ? (
                  <small>Abierta hace {table.elapsed}</small>
                ) : (
                  <small>Sin reserva próxima</small>
                )}
              </div>
              <div className="table-card__footer">
                {table.balance > 0 ? (
                  <span>Q {table.balance.toFixed(2)}</span>
                ) : (
                  <span>{table.zone}</span>
                )}
                {joinMode ? (
                  <strong className="table-card__selection-label">
                    {selected
                      ? "Seleccionada"
                      : disabledReason || "Seleccionar"}
                  </strong>
                ) : (
                  <span className="table-card__open">
                    {table.status === "free" ? "Abrir" : "Ver detalle"}
                    <ArrowRight aria-hidden="true" size={15} />
                  </span>
                )}
              </div>
            </>
          );

          return joinMode ? (
            <button
              aria-label={
                disabledReason
                  ? `Mesa ${table.number} no disponible: ${disabledReason}`
                  : `Seleccionar mesa ${table.number}`
              }
              aria-pressed={selected}
              className={`table-card table-card--${status.tone}${selected ? " table-card--selected" : ""}`}
              disabled={Boolean(disabledReason)}
              key={table.id}
              onClick={() => toggleTable(table)}
              title={disabledReason || undefined}
              type="button"
            >
              {cardContent}
            </button>
          ) : (
            <Link
              aria-label={`Mesa ${table.number}, ${status.label}, ${
                table.balance > 0
                  ? `saldo Q ${table.balance.toFixed(2)}`
                  : table.zone
              }`}
              className={`table-card table-card--${status.tone}`}
              href={`/operation/tables/${table.id}`}
              key={table.id}
            >
              {cardContent}
            </Link>
          );
        })}
      </section>

      {floorItems.length === 0 ? (
        <div className="ops-empty-state">
          <strong>No hay mesas en esta combinación</strong>
          <span>Cambia el estado o la zona para continuar.</span>
        </div>
      ) : null}

      <p className="mock-disclaimer">
        Las uniones duran mientras navegas y se reinician al recargar la página.
      </p>

      {pendingSeparation ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="separate-dialog-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar confirmación"
              className="icon-button confirm-dialog__close"
              onClick={() => setPendingSeparation(null)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Unlink aria-hidden="true" size={22} />
            </span>
            <h2 id="separate-dialog-title">
              Separar mesas {pendingSeparation.numbers.join(" y ")}
            </h2>
            <p>
              Ambas mesas recuperarán su capacidad, posición y estado libre
              original.
            </p>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setPendingSeparation(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                onClick={confirmSeparation}
                type="button"
              >
                Confirmar separación
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
