# Registro de avances frontend

Este directorio conserva resúmenes de avances relevantes para que otra persona o IA pueda continuar el trabajo sin consultar conversaciones privadas.

- [Cliente](CLIENT.md)
- [Operativo](OPERATIONAL.md)
- [Administrativo](ADMIN.md)

El pull request y sus commits son la evidencia principal. Estos archivos son un índice humano de resultados, decisiones y pendientes.

## Cuándo registrar

Agregar una entrada antes de abrir o actualizar un PR cuando se complete una vista, cambie una decisión relevante o aparezca un bloqueo que afecte al siguiente colaborador.

No registrar cada mensaje ni cada intento fallido. No incluir prompts completos, razonamientos internos, credenciales, datos personales, valores de `.env` ni información real de clientes.

## Formato

Agregar las entradas más recientes al inicio del archivo del canal:

```markdown
## AAAA-MM-DD — Nombre del avance

- Rama: `tipo/nombre`
- Responsables: nombres o usuarios de GitHub
- Asistencia: herramienta utilizada o `No aplica`
- Vistas: IDs y rutas
- Completado: resultado observable
- Archivos principales: rutas relevantes
- Pruebas: comandos y resultado
- Decisiones: decisiones nuevas o `Ninguna`
- Pendiente: trabajo restante o bloqueos
- PR: enlace o `Pendiente`
```

“Asistencia” reconoce el uso de una herramienta, pero la autoría y responsabilidad del commit pertenecen a la persona que revisa y lo publica.

## Reglas

1. Cada pareja modifica únicamente el registro de su canal salvo coordinación explícita.
2. Describir resultados verificables, no actividad vaga como “se avanzó bastante”.
3. Enlazar el PR cuando exista.
4. No marcar una integración backend como terminada si sólo existe un mock.
5. Corregir una entrada anterior mediante otro commit; no ocultar decisiones relevantes.
