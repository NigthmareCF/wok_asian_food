"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  operationalTables,
  type OperationalReservation,
  type OperationalTable,
} from "@/data/fixtures/operation";

export type JoinedTableGroup = {
  id: string;
  tableIds: string[];
  numbers: number[];
  zone: OperationalTable["zone"];
  capacity: number;
  status: "free" | "reserved" | "occupied";
  guests: number;
  responsible?: string;
  reservation?: OperationalReservation;
};

export const formatTableNumbers = (numbers: number[]) =>
  new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(
    numbers.map(String),
  );

type TableSessionResult = {
  ok: boolean;
  message: string;
};

type TableSessionContextValue = {
  tables: OperationalTable[];
  joinedGroups: JoinedTableGroup[];
  joinTables: (tableIds: string[]) => TableSessionResult;
  separateTables: (groupId: string) => TableSessionResult;
  updateTable: (
    tableId: string,
    updater: (table: OperationalTable) => OperationalTable,
  ) => void;
  updateJoinedGroup: (
    groupId: string,
    updater: (group: JoinedTableGroup) => JoinedTableGroup,
  ) => void;
};

const TableSessionContext = createContext<TableSessionContextValue | null>(
  null,
);

export function TableSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [joinedGroups, setJoinedGroups] = useState<JoinedTableGroup[]>([]);
  const [tableOverrides, setTableOverrides] = useState<
    Record<string, OperationalTable>
  >({});
  const tables = useMemo(
    () => operationalTables.map((table) => tableOverrides[table.id] ?? table),
    [tableOverrides],
  );

  const value = useMemo<TableSessionContextValue>(
    () => ({
      tables,
      joinedGroups,
      joinTables(tableIds) {
        const uniqueIds = [...new Set(tableIds)];
        if (uniqueIds.length < 2) {
          return { ok: false, message: "Selecciona al menos dos mesas." };
        }

        const selectedTables = uniqueIds
          .map((id) => tables.find((table) => table.id === id))
          .filter((table): table is OperationalTable => Boolean(table))
          .sort((a, b) => a.number - b.number);

        if (selectedTables.length !== uniqueIds.length) {
          return {
            ok: false,
            message: "No se encontraron las mesas seleccionadas.",
          };
        }

        const [firstTable] = selectedTables;
        if (selectedTables.some((table) => table.status !== "free")) {
          return { ok: false, message: "Solo se pueden unir mesas libres." };
        }
        if (selectedTables.some((table) => table.zone !== firstTable.zone)) {
          return {
            ok: false,
            message: "Las mesas deben estar en la misma zona.",
          };
        }
        const selectedIds = new Set(uniqueIds);
        const connectedIds = new Set<string>([firstTable.id]);
        const pendingIds = [firstTable.id];

        while (pendingIds.length > 0) {
          const currentId = pendingIds.shift();
          const currentTable = selectedTables.find(
            (table) => table.id === currentId,
          );
          currentTable?.adjacentTableIds?.forEach((adjacentId) => {
            if (selectedIds.has(adjacentId) && !connectedIds.has(adjacentId)) {
              connectedIds.add(adjacentId);
              pendingIds.push(adjacentId);
            }
          });
        }

        if (connectedIds.size !== selectedTables.length) {
          return {
            ok: false,
            message: "Todas las mesas deben formar un grupo conectado.",
          };
        }
        if (
          joinedGroups.some((group) =>
            group.tableIds.some((id) => uniqueIds.includes(id)),
          )
        ) {
          return { ok: false, message: "Una de las mesas ya está unida." };
        }

        const group: JoinedTableGroup = {
          id: `joined-${selectedTables.map((table) => table.id).join("-")}`,
          tableIds: selectedTables.map((table) => table.id),
          numbers: selectedTables.map((table) => table.number),
          zone: firstTable.zone,
          capacity:
            selectedTables.reduce((total, table) => total + table.capacity, 0) -
            (selectedTables.length - 1) * 2,
          status: "free",
          guests: 0,
        };
        setJoinedGroups((current) => [...current, group]);

        return {
          ok: true,
          message: `Mesas ${formatTableNumbers(group.numbers)} unidas. Capacidad combinada: ${group.capacity} personas.`,
        };
      },
      separateTables(groupId) {
        const group = joinedGroups.find((item) => item.id === groupId);
        if (!group) {
          return { ok: false, message: "La unión ya no está disponible." };
        }
        if (group.status !== "free") {
          return {
            ok: false,
            message:
              "No se puede separar una unión con reservación o atención activa.",
          };
        }

        setJoinedGroups((current) =>
          current.filter((item) => item.id !== groupId),
        );
        return {
          ok: true,
          message: `Mesas ${formatTableNumbers(group.numbers)} separadas y restauradas.`,
        };
      },
      updateTable(tableId, updater) {
        setTableOverrides((current) => {
          const table =
            current[tableId] ??
            operationalTables.find((item) => item.id === tableId);
          if (!table) return current;
          return { ...current, [tableId]: updater(table) };
        });
      },
      updateJoinedGroup(groupId, updater) {
        setJoinedGroups((current) =>
          current.map((group) =>
            group.id === groupId ? updater(group) : group,
          ),
        );
      },
    }),
    [joinedGroups, tables],
  );

  return (
    <TableSessionContext.Provider value={value}>
      {children}
    </TableSessionContext.Provider>
  );
}

export function useTableSession() {
  const context = useContext(TableSessionContext);
  if (!context) {
    throw new Error("useTableSession must be used inside TableSessionProvider");
  }
  return context;
}
