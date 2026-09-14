"use client";

import { createContext, useContext } from "react";
import { CartProvider } from "@/modules/cart/cart-provider";

type DataSource = "mock" | "http";
const DataSourceContext = createContext<DataSource>("mock");

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <DataSourceContext value="mock">
      <CartProvider>{children}</CartProvider>
    </DataSourceContext>
  );
}

export function useDataSource() {
  return useContext(DataSourceContext);
}
