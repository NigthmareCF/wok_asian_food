# Arranque y pruebas cruzadas

Alcance: entrega integrada aceptada para pruebas cruzadas, sin credenciales productivas ni despliegue autorizado. [Estado y límites](WEB_INTEGRATED_HANDOFF.md).

Resultado vigente: [compatibilidad y cierre autorizado](COMPATIBILITY_CHECK.md). Corte previo sobre development 9eab323: Web build/lint/tipos y786 tests; API build/verify offline con245 tests, incluido opt-in1/1; SQL aislado27+12. Cierre posterior: Node portable y opt-in real aprobados en Windows/Linux (8 casos por sistema); smoke completo aprobado (44 HTTP y7 SQL); npm ci/lint/tipos Mobile aprobados en copia limpia con lockfile remoto y Node22. CI remoto y gate actualizado siguen pendientes antes de merge; Android no está validado.

## Demo ya encendida

En el equipo anfitrión: http://127.0.0.1:18087/login. Recargar pestañas antiguas antes de probar. 127.0.0.1 solo sirve en ese equipo: no es una URL compartida por red ni despliegue del equipo. Configurar acceso de red exige una tarea posterior; no se abrió ningún puerto nuevo.

La demo conserva PostgreSQL/volumen/datos y el API compilado de las mismas fuentes productivas. Web se compiló y reinició el 7/oct; registry de procesos actualizado. Las cuentas son exclusivamente ficticias y se distribuyen por el canal de pruebas autorizado, **sin poner contraseñas en Git ni usarlas para producción**. No crear cuentas, reseedear ni cambiar contraseñas para arrancar. El directorio temporal `wok-manual-20261007-100804` contiene la configuración privada y scripts propios; no copiar compose.json/compose-vars, logs ni bases al repo.

Apagado cuando el responsable lo autorice: ejecutar el stop.ps1 de ese directorio, que verifica IDs/propiedad y conserva volumen. Esta preparación no apagó recursos.

## Arranque reproducible en un entorno del equipo separado

Prerequisitos ya disponibles: Node compatible con el lockfile, npm, Java21, Maven o wrapper/caché instalado, Docker/Compose y PostgreSQL18. Versiones/dependencias quedan fijadas por package-lock/pom; no actualizar para arrancar. Conservar cambios locales y usar un checkout aprobado distinto del entorno del restaurante. No ejecutar comandos de instalación en esta preparación. Si falta una dependencia/imagen/caché, informar el bloqueo; no sustituir un build fallido por binario antiguo.

Variables de configuración, sin valores secretos:

| Variable | Uso |
|---|---|
| WOK_DB_NAME, WOK_DB_USER, WOK_DB_PASSWORD | Base/usuario propios del nuevo entorno, contraseña gestionada fuera de Git |
| SPRING_DATASOURCE_URL/USERNAME/PASSWORD | Alternativa de conexión al arrancar Java fuera de Compose |
| WOK_AUTH_ISSUER | URI válida del issuer del entorno; definirla antes de emitir sesiones |
| WOK_AUTH_JWT_SECRET_BASE64, WOK_AUTH_CHALLENGE_PEPPER_BASE64 | Claves propias del entorno, suministradas por responsable, nunca copiar de demo/producción |
| WOK_API_BASE_URL | URL del API accesible desde el servidor Web; no desde el navegador |
| WOK_COOKIE_SECURE | false solo en demo HTTP local; true con HTTPS productivo |
| WOK_HTTP_BIND_ADDRESS, WOK_HTTP_PORT | Escucha del gateway; usar loopback y puerto libre en pruebas |
| WOK_CORS_ALLOWED_ORIGINS | Orígenes permitidos del entorno cuando se consume API directamente |
| WOK_EMAIL_MODE, WOK_EMAIL_HEALTH_ENABLED, WOK_SMTP_* | Mock o Mailpit/SMTP de pruebas; no acredita envío real |
| WOK_AI_MODE, WOK_FISCAL_MODE | disabled/mock en pruebas; no fiscal real ni IA habilitada |
| SPRING_FLYWAY_LOCATIONS | Compose monta database/migrations y usa filesystem:/database/migrations |

No abrir ni versionar archivos .env existentes. El responsable prepara configuración privada para el nuevo entorno; no copiar la del anfitrión. Antes de iniciar API comparar flyway_schema_history con V1–V27, revisar checksum y upgrades; detenerse ante incompatibilidad. Cambiar nombre de proyecto Compose produce volumen separado, pero comprobar que ningún override/montaje apunta a bases existentes. Evitar comandos down -v/reset/seeds sobre volúmenes existentes.

Con caché/artefactos de dependencias ya disponibles, en el checkout de pruebas:

```powershell
npm.cmd run build --workspace @wok/web
# Desde apps/api, con Maven instalado y caché completa:
mvn.cmd -o --batch-mode --no-transfer-progress -DskipTests package
```

Para composición Docker, el responsable puede ejecutar después de revisar puertos, nombres y configuración propia:

```powershell
docker compose --env-file '<configuracion-privada-propia>' -p 'wok-team-cross-test' -f docker-compose.yml -f infra/compose.dev.yml --profile dev up -d --build --pull never
```

Ese build Docker no garantiza trabajar offline: los Dockerfiles resuelven dependencias dentro de sus stages. No ejecutar si requiere descargas no autorizadas; usar los builds locales con runtimes ya disponibles y una composición aislada aprobada, o registrar el bloqueo. No se añadió un script que copie secretos o reconfigure servicios. La reproducibilidad desde máquina vacía sigue pendiente: esta entrega reutilizó herramientas/dependencias instaladas.

## Checks y datos

Pruebas de mutación solo con PostgreSQL nuevo aislado/Testcontainers; no apuntar tests/smoke a la demo con datos conservados ni al restaurante. Comprobar que Docker realmente ejecutó los casos, no solo que Maven terminó verde. Seeds existentes son ficticios, exclusivamente para una base nueva; no son catálogo/usuarios aprobados por negocio.

```powershell
npm.cmd run lint --workspace @wok/web
npm.cmd run typecheck --workspace @wok/web
npm.cmd run test --workspace @wok/web -- --maxWorkers=2
npm.cmd run build --workspace @wok/web
# Desde apps/api:
mvn.cmd -o --batch-mode --no-transfer-progress verify
```

`WebFindingBoundaryIntegrationTest` requiere una copia Web compilada sin .env y CLI Next ya instalada. Desde apps/api, usando rutas absolutas del entorno propio:

```powershell
mvn.cmd -o '-Dtest=WebFindingBoundaryIntegrationTest' '-Dwok.web.test.dir=<copia>/apps/web' '-Dwok.web.next.bin=<dependencias>/next/dist/bin/next' test
```

Este caso emite sesiones sintéticas de fixture; no sustituye login normal. El harness visual local opcional no forma parte de Git ni es requisito para el caso HTTP/SQL. Seguir CI para SQL de database/tests y operational-flow-smoke.sh en Bash/base nueva; no trasladar sus operaciones de limpieza a servicios existentes. Anotar comando/opciones, fallos/omitidas y tipo de evidencia, sin cookies/tokens ni logs de configuración secreta.

El test ahora elige Node desde PATH (`node.exe` Windows, `node` Linux/macOS), tanto para Next como para el harness visual opcional. No requiere rutas de equipo incrustadas. Regresión focalizada:

```powershell
mvn.cmd -o '-Dtest=NodeRuntimeTest,WebFindingBoundaryIntegrationTest' '-Dwok.web.test.dir=<copia>/apps/web' '-Dwok.web.next.bin=<dependencias>/next/dist/bin/next' test
```

En Linux usar `mvn` y propiedades equivalentes. Las dependencias deben incluir el SWC de la misma versión Next y plataforma; una copia de node_modules Windows no basta. En este cierre se reutilizó SWC16.3.6 de una imagen cacheada. Los ocho casos pasaron en ambos sistemas; no se ejecutó de nuevo el harness visual ni toda la suite.

Checks Mobile exigidos por CI: `npm run lint --workspace mobile` y `npm run typecheck --workspace mobile`. Inicialmente fallaron por dependencias del lockfile remoto ausentes. Cierre8/oct: instalación autorizada en copia limpia, `npm ci --no-audit --no-fund --cache /workspace/npm-cache` raíz con Node22.23.3/npm10.9.9, seguida de ambos checks: exit0 para los tres comandos. Fuentes/manifiestos/lockfile9eab323 sin cambios. Sin --force/--legacy-peer-deps ni instalación en proyecto/demo; no equivale a Android o build Mobile.

Smoke corregido y completo aprobado8/oct: `bash .github/scripts/operational-flow-smoke.sh` con Bash/jq1.7.1 verificado, PG18 tmpfs/API nuevos. Incluye siete casos SQL con rollback y44 HTTP:202 del pickup válido, negativo422 sin escritura, pagos/cierre y todos los pasos originales. El selector SQL usa horario/zona/preparación/máximo reales; fallback horario determinista únicamente en base nueva, con guard antes de seed. No ejecutar contra demo ni cambiar su horario. Necesita juntos operational-flow-smoke.sh, pickup-smoke-window.sql y smoke_pickup_window.sql; el propio smoke resuelve includes y envía SQL por stdin como CI. V26/V27 permanecen intactas y compatibles con development9eab323. Todos los pasos/evidencias en COMPATIBILITY_CHECK.md; CI remoto y gate final siguen pendientes.

## Guion breve del equipo

1. Login normal CLIENT A/B en sesiones separadas. A completa catálogo→carrito→checkout→historial/detalle; recarga y compara aislamiento con B. Verificar mismo registro desde personal.
2. Perfil: agregar/eliminar teléfono y recargar; conflictos de versión deben consultar estado actual. Mensajes y reserva enviada ya tienen confirmación de Javier; ampliar con decisiones/cancelación del personal y polling visible sin recarga.
3. Personal: mesa→cuenta→crear/ampliar→cocina→servido→pago→cierre/limpieza. Registrar qué se probó de parciales, caja y conciliación; no deducirlos del flujo general de Javier.
4. En base aislada, pérdida de respuesta/cambio de sesión: conservar dueño/clave/cuerpo y recuperar explícitamente sin duplicar. Montaje/refresco no debe provocar escrituras. Las carreras F3/F4 controladas pueden ampliarse luego en navegador.
5. Solicitudes a 768/820, móvil y escritorio; teclado/foco/Cerrar sesión. Administración: operaciones soportadas y bloqueos explícitos, sin ampliar permisos.

Registrar responsable, build, recorrido, esperado/obtenido y clasificación (controlada, HTTP/API/SQL real, navegador, dispositivo físico). No declarar ventas reales ni Android por abrir la Web. No repetir la auditoría completa para esta entrega.
