# Diagramas del sistema

[`wok-system-architecture.drawio`](wok-system-architecture.drawio) contiene 38 páginas editables: Backend, AI, Auth, los contextos Client/Operational/Admin/Mobile, Reservations/Payment/FEL/Messaging y 27 flujos críticos enumerados del registro al correo. Se genera con `python3 scripts/docs/generate_system_diagrams.py`; modificar la fuente y regenerar para mantener las páginas coherentes. Las flechas representan secuencia y límites de responsabilidad, no endpoints implementados.

La topología LAN/WAN y dispositivos está en `infra/diagrams/`; el ERD físico candidato permanece en `docs/database/erd/`. El runtime IA nunca accede directamente a PostgreSQL; cualquier lectura usa Tool Broker y caso de uso autorizado. Consultar [brechas](../project/GAP_ANALYSIS.md) antes de interpretar un diagrama como función terminada.
