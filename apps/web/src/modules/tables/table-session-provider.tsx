"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  operationalTables,
  type OperationalTable,
} from "@/data/fixtures/operation";

export type JoinedTableGroup = {
  id: string;
  tableIds: [string, string];
  numbers: [number, number];
  zone: OperationalTable["zone"];
  capacity: number;
};

type TableSessionResult = {
  ok: boolean;
  message: string;
};

type TableSessionContextValue = {
  joinedGroups: JoinedTableGroup[];
  joinTables: (tableIds: string[]) => TableSessionResult;
  separateTables: (groupId: string) => TableSessionResult;
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

  const value = useMemo<TableSessionContextValue>(
    () => ({
      joinedGroups,
      joinTables(tableIds) {
        const uniqueIds = [...new Set(tableIds)];
        if (uniqueIds.length !== 2) {
          return { ok: false, message: "Selecciona exactamente dos mesas." };
        }

        const tables = uniqueIds
          .map((id) => operationalTables.find((table) => table.id === id))
          .filter((table): table is OperationalTable => Boolean(table))
          .sort((a, b) => a.number - b.number);

        if (tables.length !== 2) {
          return {
            ok: false,
            message: "No se encontraron las mesas seleccionadas.",
          };
        }

        const [firstTable, secondTable] = tables;
        if (tables.some((table) => table.status !== "free")) {
          return { ok: false, message: "Solo se pueden unir mesas libres." };
        }
        if (firstTable.zone !== secondTable.zone) {
          return {
            ok: false,
            message: "Las mesas deben estar en la misma zona.",
          };
        }
        if (!firstTable.adjacentTableIds?.includes(secondTable.id)) {
          return {
            ok: false,
            message: "Las mesas seleccionadas no son adyacentes.",
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
          id: `joined-${firstTable.id}-${secondTable.id}`,
          tableIds: [firstTable.id, secondTable.id],
          numbers: [firstTable.number, secondTable.number],
          zone: firstTable.zone,
          capacity: firstTable.capacity + secondTable.capacity - 2,
        };
        setJoinedGroups((current) => [...current, group]);

        return {
          ok: true,
          message: `Mesas ${group.numbers.join(" y ")} unidas. Capacidad combinada: ${group.capacity} personas.`,
        };
      },
      separateTables(groupId) {
        const group = joinedGroups.find((item) => item.id === groupId);
        if (!group) {
          return { ok: false, message: "La unión ya no está disponible." };
        }

        setJoinedGroups((current) =>
          current.filter((item) => item.id !== groupId),
        );
        return {
          ok: true,
          message: `Mesas ${group.numbers.join(" y ")} separadas y restauradas.`,
        };
      },
    }),
    [joinedGroups],
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
