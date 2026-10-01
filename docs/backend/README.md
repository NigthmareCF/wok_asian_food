# Plan backend — WOK Asian Food

Propuesta de trabajo para seis integrantes y entrega en cinco o seis semanas, preparada el 15 de septiembre de 2026. Base actualizada: Java/Spring por experiencia del equipo e indicación del ingeniero comunicada por el PM; versiones por fijar. Expo sigue como recomendación. No representa implementación.

1. [Plan de desarrollo](DEVELOPMENT_PLAN.md): arquitectura, alcance, responsabilidades, calendario, integración web/móvil, pruebas y decisiones pendientes.
2. [Backlog inicial](BACKLOG.md): paquetes de trabajo, responsables propuestos, dependencias y criterios de aceptación.
3. [Plan concreto de app Cliente](../mobile/CLIENT_APP_PLAN.md): React Native + Expo, pantallas, tareas y pruebas.
4. [Registro de avance](../progress/BACKEND.md): resultado de esta preparación y límites de la revisión.

Recomendación central: backend modular con Java/Spring Boot y PostgreSQL, compartido por la web actual y una futura app React Native con Expo. Construir cada flujo con persistencia y pruebas desde el inicio, manteniendo operación local ante pérdida de Internet.

Para comenzar, resolver las decisiones D-01 a D-05 del plan y convertir las tareas de la primera semana en issues pequeños. La asignación nominal y las fechas se confirman con el equipo; no se deducen del reparto frontend.

El reparto inicial es 3 web, 2 backend y 1 app, con apoyo compartido backend/app. Las últimas 2–3 semanas se reservan para seguridad y estabilización. Una persona compartida no cuenta como dos capacidades completas; consultar escenarios y viabilidad en el plan.
