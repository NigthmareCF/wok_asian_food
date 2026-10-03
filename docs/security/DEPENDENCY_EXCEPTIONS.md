# Excepciones de dependencias

Este registro no desactiva la auditoria. El CI permite solamente los avisos enumerados aqui y continua bloqueando cualquier otra alerta alta o critica.

## GHSA-86w9-cpqp-85rv

- Paquete: `node-forge`.
- Severidad: alta.
- Origen: dependencia transitiva de herramientas de compilacion de Expo 57 (`@expo/cli` y `@expo/code-signing-certificates`).
- Estado al 2026-10-02: el aviso incluye `node-forge` hasta 1.4.0 y no publica una version npm corregida. La version 1.4.0 es la ultima disponible.
- Exposicion en este repositorio: herramienta de compilacion movil; no forma parte del servidor Spring Boot ni de la aplicacion Next desplegada.
- Mitigacion: no procesar certificados o firmas de fuentes no confiables con estas herramientas. Mantener Expo aislado del backend y no usar `npm audit fix --force`, porque propone una degradacion incompatible.
- Revision obligatoria: 2026-11-02, o antes si `node-forge` o Expo publican una correccion.
- Eliminacion: retirar la excepcion de `.github/scripts/audit-production-dependencies.mjs` al actualizar a una cadena corregida.

## GHSA-vfj7-8cjw-p6xm

- Paquete: `braces`.
- Severidad: alta.
- Origen: dependencia transitiva de herramientas de compilacion de Expo 57 y Metro (`micromatch` a traves de `metro-file-map`, `metro-config` y `@expo/cli`).
- Estado al 2026-10-02: el aviso incluye `braces` hasta 3.0.3 y no publica una version npm corregida. La version 3.0.3 es la ultima disponible.
- Exposicion en este repositorio: herramienta de compilacion movil; no forma parte del servidor Spring Boot ni de la aplicacion Next desplegada.
- Mitigacion: no procesar patrones glob profundamente anidados de fuentes no confiables con estas herramientas. Mantener Expo aislado del backend y no usar `npm audit fix --force`, porque propone una actualizacion mayor incompatible de Expo.
- Revision obligatoria: 2026-11-02, o antes si `braces`, `micromatch` o Expo publican una correccion.
- Eliminacion: retirar la excepcion de `.github/scripts/audit-production-dependencies.mjs` al actualizar a una cadena corregida.

Las alertas moderadas se muestran en el reporte de npm, pero la politica actual del proyecto bloquea severidades altas y criticas.
