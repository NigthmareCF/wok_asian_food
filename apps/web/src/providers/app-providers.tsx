"use client";

import { createContext, useContext } from "react";

type DataSource = "mock" | "http";
const DataSourceContext = createContext<DataSource>("mock");

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <DataSourceContext value="mock">{children}</DataSourceContext>;
}

export function useDataSource() {
  return useContext(DataSourceContext);
}
