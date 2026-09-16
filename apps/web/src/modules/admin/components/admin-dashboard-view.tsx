"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ClipboardList,
  PackageSearch,
  RefreshCw,
  Utensils,
} from "lucide-react";
import {
  adminDashboardData,
  adminPeriods,
  type AdminDashboardItem,
  type AdminPeriod,
} from "@/data/fixtures/admin";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./admin-dashboard.module.css";

type ViewState = "normal" | "loading" | "empty" | "error";

const sections: {
  key:
    | "alerts"
    | "criticalProducts"
    | "suggestedPurchases"
    | "suggestedProductions";
  title: string;
  empty: string;
  icon: typeof AlertTriangle;
}[] = [
  {
    key: "alerts",
    title: "Alertas",
    empty: "Sin alertas en este período.",
    icon: AlertTriangle,
  },
  {
    key: "criticalProducts",
    title: "Productos críticos",
    empty: "Sin productos críticos en este período.",
    icon: PackageSearch,
  },
  {
    key: "suggestedPurchases",
    title: "Compras sugeridas",
    empty: "Sin compras sugeridas en este período.",
    icon: ClipboardList,
  },
  {
    key: "suggestedProductions",
    title: "Producciones sugeridas",
    empty: "Sin producciones sugeridas en este período.",
    icon: Utensils,
  },
];

const stateLabels: Record<ViewState, string> = {
  normal: "Normal",
  loading: "Carga",
  empty: "Vacío",
  error: "Error",
};

const initialExpandedSections = {
  alerts: true,
  criticalProducts: true,
  suggestedPurchases: true,
  suggestedProductions: true,
} satisfies Record<(typeof sections)[number]["key"], boolean>;

export function AdminDashboardView({
  initialPeriod = "today",
  initialState = "normal",
}: {
  initialPeriod?: AdminPeriod;
  initialState?: ViewState;
}) {
  const [period, setPeriod] = useState<AdminPeriod>(initialPeriod);
  const [viewState, setViewState] = useState<ViewState>(initialState);
  const [expandedSections, setExpandedSections] = useState(
    initialExpandedSections,
  );

  const periodData = useMemo(() => adminDashboardData[period], [period]);
  const visibleData =
    viewState === "empty" ? adminDashboardData.month : periodData;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className="ops-kicker">Canal administrativo</span>
          <h1>Dashboard administrativo</h1>
          <p>Resumen de alertas, productos críticos y sugerencias.</p>
        </div>
        <StatusBadge label="DATOS SIMULADOS" tone="info" />
      </header>

      <section className={styles.controls} aria-label="Controles del dashboard">
        <div className={styles.controlGroup}>
          <span>Período</span>
          <div className={styles.segmented} aria-label="Seleccionar período">
            {adminPeriods.map((item) => (
              <button
                aria-pressed={period === item.value}
                key={item.value}
                onClick={() => {
                  setPeriod(item.value);
                  setViewState("normal");
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.controlGroup}>
          <span>Estado simulado</span>
          <div className={styles.segmented} aria-label="Seleccionar estado">
            {(Object.keys(stateLabels) as ViewState[]).map((state) => (
              <button
                aria-pressed={viewState === state}
                key={state}
                onClick={() => setViewState(state)}
                type="button"
              >
                {stateLabels[state]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {viewState === "loading" ? <LoadingState /> : null}
      {viewState === "error" ? <ErrorState /> : null}

      {viewState === "normal" || viewState === "empty" ? (
        <>
          <section
            className={styles.metrics}
            aria-label="Métricas administrativas"
          >
            {visibleData.metrics.map((metric) => (
              <article className={styles.metric} key={metric.id}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <p>{metric.detail}</p>
              </article>
            ))}
          </section>

          <section
            className={styles.contentGrid}
            aria-label="Resumen administrativo"
          >
            {sections.map((section) => {
              const Icon = section.icon;
              const items = visibleData[section.key];
              const contentId = `admin-dashboard-${section.key}`;
              const expanded = expandedSections[section.key];
              return (
                <article className={styles.panel} key={section.key}>
                  <header className={styles.panelHeader}>
                    <button
                      aria-controls={contentId}
                      aria-expanded={expanded}
                      className={styles.sectionToggle}
                      onClick={() =>
                        setExpandedSections((current) => ({
                          ...current,
                          [section.key]: !current[section.key],
                        }))
                      }
                      type="button"
                    >
                      <span>
                        <Icon aria-hidden="true" size={18} />
                        <h2>{section.title}</h2>
                      </span>
                      <span className={styles.sectionToggleMeta}>
                        <span>{items.length}</span>
                        <ChevronDown aria-hidden="true" size={18} />
                      </span>
                    </button>
                  </header>
                  <div hidden={!expanded} id={contentId}>
                    <ItemList emptyLabel={section.empty} items={items} />
                  </div>
                </article>
              );
            })}
          </section>
        </>
      ) : null}

      <p className={styles.disclaimer}>
        Datos simulados para validar la experiencia administrativa. No
        representan reglas de negocio ni integración con backend.
      </p>
    </div>
  );
}

function ItemList({
  emptyLabel,
  items,
}: {
  emptyLabel: string;
  items: AdminDashboardItem[];
}) {
  if (items.length === 0) {
    return (
      <div className={styles.emptyList}>
        <BarChart3 aria-hidden="true" size={22} />
        <strong>{emptyLabel}</strong>
      </div>
    );
  }

  return (
    <ul className={styles.itemList}>
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function LoadingState() {
  return (
    <section className={styles.statePanel} aria-live="polite">
      <RefreshCw aria-hidden="true" size={24} />
      <div>
        <strong>Cargando dashboard</strong>
        <span>Preparando datos simulados del período seleccionado.</span>
      </div>
    </section>
  );
}

function ErrorState() {
  return (
    <section className={styles.statePanel} role="alert">
      <AlertTriangle aria-hidden="true" size={24} />
      <div>
        <strong>No pudimos cargar el dashboard</strong>
        <span>Intenta nuevamente con los datos simulados.</span>
      </div>
    </section>
  );
}
