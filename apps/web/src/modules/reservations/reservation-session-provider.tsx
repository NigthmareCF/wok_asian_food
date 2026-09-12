"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  initialReservations,
  type CreateReservationInput,
  type ReservationRecord,
  type ReservationStatus,
} from "@/data/fixtures/reservations";

type ReservationSessionContextValue = {
  reservations: ReservationRecord[];
  createReservation: (input: CreateReservationInput) => string;
  updateReservation: (
    id: string,
    updates: Partial<ReservationRecord>,
  ) => boolean;
  updateReservationStatus: (id: string, status: ReservationStatus) => boolean;
};

const ReservationSessionContext =
  createContext<ReservationSessionContextValue | null>(null);

export function ReservationSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [reservations, setReservations] =
    useState<ReservationRecord[]>(initialReservations);

  const value = useMemo<ReservationSessionContextValue>(
    () => ({
      reservations,
      createReservation(input) {
        const sequence =
          reservations
            .map((reservation) => Number(reservation.id.split("-")[1]))
            .reduce((highest, current) => Math.max(highest, current), 200) + 1;
        const id = `RSV-${sequence}`;
        const createdAt = new Date().toLocaleTimeString("es-GT", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        setReservations((current) => [{ ...input, id, createdAt }, ...current]);
        return id;
      },
      updateReservation(id, updates) {
        if (!reservations.some((reservation) => reservation.id === id)) {
          return false;
        }
        setReservations((current) =>
          current.map((reservation) =>
            reservation.id === id
              ? { ...reservation, ...updates }
              : reservation,
          ),
        );
        return true;
      },
      updateReservationStatus(id, status) {
        if (!reservations.some((reservation) => reservation.id === id)) {
          return false;
        }
        setReservations((current) =>
          current.map((reservation) =>
            reservation.id === id ? { ...reservation, status } : reservation,
          ),
        );
        return true;
      },
    }),
    [reservations],
  );

  return (
    <ReservationSessionContext.Provider value={value}>
      {children}
    </ReservationSessionContext.Provider>
  );
}

export function useReservationSession() {
  const context = useContext(ReservationSessionContext);
  if (!context) {
    throw new Error(
      "useReservationSession must be used inside ReservationSessionProvider",
    );
  }
  return context;
}
