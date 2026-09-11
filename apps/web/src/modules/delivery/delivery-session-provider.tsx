"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  deliveryOrders,
  deliveryDrivers,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type Driver,
} from "@/data/fixtures/delivery";

type UpdateDeliveryStatusInput = {
  orderId: string;
  status: DeliveryOrderStatus;
  driverId?: string;
};

type AssignDriverInput = {
  orderId: string;
  driverId: string;
};

type DeliverySessionContextValue = {
  orders: DeliveryOrder[];
  drivers: Driver[];
  updateDeliveryStatus: (input: UpdateDeliveryStatusInput) => boolean;
  assignDriver: (input: AssignDriverInput) => boolean;
  updateDriverStatus: (driverId: string, status: Driver["status"]) => boolean;
};

const DeliverySessionContext = createContext<DeliverySessionContextValue | null>(null);

export function DeliverySessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [orders, setOrders] = useState<DeliveryOrder[]>(deliveryOrders);
  const [drivers, setDrivers] = useState<Driver[]>(deliveryDrivers);

  const value = useMemo<DeliverySessionContextValue>(
    () => ({
      orders,
      drivers,
      updateDeliveryStatus({ orderId, status, driverId }) {
        const order = orders.find((o) => o.id === orderId);
        if (!order) return false;

        setOrders((current) =>
          current.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status,
                  driver: driverId
                    ? drivers.find((d) => d.id === driverId)?.name ?? order.driver
                    : order.driver,
                  driverPhone: driverId
                    ? drivers.find((d) => d.id === driverId)?.phone ?? order.driverPhone
                    : order.driverPhone,
                  vehicle: driverId
                    ? drivers.find((d) => d.id === driverId)?.vehicle ?? order.vehicle
                    : order.vehicle,
                }
              : o,
          ),
        );

        if (driverId && status === "picked-up") {
          setDrivers((current) =>
            current.map((d) =>
              d.id === driverId ? { ...d, status: "on-delivery", currentOrderId: orderId } : d,
            ),
          );
        } else if (driverId && (status === "delivered" || status === "cancelled")) {
          setDrivers((current) =>
            current.map((d) =>
              d.id === driverId
                ? { ...d, status: "available", currentOrderId: undefined }
                : d,
            ),
          );
        }

        return true;
      },
      assignDriver({ orderId, driverId }) {
        const order = orders.find((o) => o.id === orderId);
        const driver = drivers.find((d) => d.id === driverId);
        if (!order || !driver) return false;

        if (driver.status !== "available") return false;

        setOrders((current) =>
          current.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "driver-assigned",
                  driver: driver.name,
                  driverPhone: driver.phone,
                  vehicle: driver.vehicle,
                }
              : o,
          ),
        );

        setDrivers((current) =>
          current.map((d) =>
            d.id === driverId
              ? { ...d, status: "on-delivery", currentOrderId: orderId }
              : d,
          ),
        );

        return true;
      },
      updateDriverStatus(driverId, status) {
        setDrivers((current) =>
          current.map((d) =>
            d.id === driverId
              ? {
                  ...d,
                  status,
                  currentOrderId:
                    status === "on-delivery" ? d.currentOrderId : undefined,
                }
              : d,
          ),
        );
        return true;
      },
    }),
    [orders, drivers],
  );

  return (
    <DeliverySessionContext.Provider value={value}>
      {children}
    </DeliverySessionContext.Provider>
  );
}

export function useDeliverySession() {
  const context = useContext(DeliverySessionContext);
  if (!context) {
    throw new Error("useDeliverySession must be used inside DeliverySessionProvider");
  }
  return context;
}