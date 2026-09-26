# Decisiones técnicas vigentes

Fecha: 2026-09-25. Autoridad: instrucción maestra del propietario. `CONFIRMED` no significa implementado; la evidencia de ejecución está en [GAP_ANALYSIS.md](GAP_ANALYSIS.md).

| ID    | Decisión                                                                         | Estado    | Consecuencia                                                                                   |
| ----- | -------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| TD-01 | Monolito modular Java 21/Spring Boot/PostgreSQL como core transaccional          | CONFIRMED | Un escritor principal local; módulos por dominio y transacciones explícitas.                   |
| TD-02 | Servidor central on-premise; LAN sigue operando sin WAN                          | CONFIRMED | Nginx, API, DB y storage locales; servicios externos degradables.                              |
| TD-03 | Una API `/api/v1` para web y app; Nginx es ingreso                               | CONFIRMED | Spring y PostgreSQL privados; mismo hostname mediante split-horizon DNS cuando exista dominio. |
| TD-04 | WOK emite identidad y permisos propios                                           | CONFIRMED | JWT corto, refresh opaco rotativo, Google como proveedor de identidad solamente.               |
| TD-05 | Regla de 3 h para reserva formal y mesa web/app; 20 min de tolerancia            | CONFIRMED | Motor de capacidad aún decide aceptación; cierre restringe internamente.                       |
| TD-06 | Capacidades de servicio independientes y overrides auditados                     | CONFIRMED | No derivar pickup/delivery/reservas de un único booleano global.                               |
| TD-07 | Pagos, FEL, Meta, email, STT e IA tras puertos/adapters                          | CONFIRMED | Mock explícito mientras falte proveedor; red externa fuera de la transacción SQL.              |
| TD-08 | IA en runtime aislado, sin acceso directo a DB ni autoridad de acciones críticas | CONFIRMED | Backend valida tools, ownership y datos mínimos; fallback humano.                              |
| TD-09 | Web Next.js/React/TypeScript; app Cliente React Native/Expo/TypeScript           | CONFIRMED | El plan móvil cubre todo Cliente; componentes DOM no se comparten.                             |
| TD-10 | `database/design/generate.py` es fuente declarativa del modelo candidato         | CONFIRMED | Regenerar JSON/SQL/ERD/diccionario; Flyway representa cambios ejecutables.                     |
| TD-11 | PostgreSQL Outbox para eventos externos iniciales                                | CONFIRMED | No introducir Kafka ni microservicios por defecto.                                             |
| TD-12 | `APPLE_LOGIN = LATER / DECISION_REQUIRED`                                        | OPEN      | Mantener identidad externa multi-provider sin flujo Apple activo.                              |

## Decisiones anteriores sustituidas

| Tema                                     | Estado anterior      | Estado actual              | Motivo                                                                         |
| ---------------------------------------- | -------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| Monorepo o repos separados               | PENDING_CONFIRMATION | SUPERSEDED por TD-01/03/09 | El trabajo actual integra API, web, DB y futuro móvil en este repositorio.     |
| React Native/Expo                        | PENDING_CONFIRMATION | SUPERSEDED por TD-09       | El propietario seleccionó app Cliente Expo como arquitectura objetivo.         |
| Backend de pickup como alcance total     | Plan de corte        | SUPERSEDED                 | El producto incluye reservas, delivery, pagos, FEL, Meta, IA y demás dominios. |
| ERD/SQL candidato como cierre del diseño | Candidato histórico  | SUPERSEDED por TD-10       | Requiere revisión y migraciones verificadas antes de uso real.                 |
| Estado operativo global único            | Fixture de web       | SUPERSEDED por TD-06       | Cada capacidad puede pausar o exigir aprobación por separado.                  |

Ver [DECISIONS_REQUIRED.md](DECISIONS_REQUIRED.md) para proveedores y datos que sí requieren decisión externa. Los detalles de implementación se registran en la documentación de cada dominio y en pruebas, no en la existencia de una pantalla.
