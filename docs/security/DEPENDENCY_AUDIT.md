# Auditoria de dependencias

## 2026-09-30

- Next.js y `eslint-config-next` se actualizaron de 16.3.4 a 16.3.6 para
  corregir la vulnerabilidad critica publicada para `next/og ImageResponse`.
- `npm audit --omit=dev` ya no reporta vulnerabilidades altas o criticas.
- Permanecen 14 avisos moderados transitivos del ecosistema Expo. Las
  correcciones automaticas propuestas por npm degradan Expo o Expo Router a
  versiones incompatibles con el SDK 57, por lo que no se aplico
  `npm audit fix --force`.
- Antes de una entrega publica, actualizar Expo dentro de una ruta compatible
  oficialmente, repetir lint/typecheck y validar Android e iOS en dispositivos.

Comando de seguimiento:

```bash
npm audit --omit=dev
```

Este archivo registra la evaluacion; no sustituye la revision periodica de
avisos ni las pruebas de actualizacion.
