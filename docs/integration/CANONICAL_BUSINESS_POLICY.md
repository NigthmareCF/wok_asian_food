# Política canónica de negocio para la integración

Confirmada por el responsable en este chat el 9 de octubre de 2026. Fuente: especificación adjunta y reglas adicionales. Tiene prioridad sobre comportamientos de los PR; confirmar un requisito no demuestra que esté implementado ni amplía el alcance de AI/Vision. Valores iniciales configurables en backend, nunca constantes en vistas.

## Identidad, permisos y auditoría

- Operaciones transaccionales requieren cuenta CLIENT autenticada y verificada. Registro: nombres, apellidos, teléfono, email y contraseña; verificar email y verificar teléfono antes de DELIVERY. Para Guatemala aceptar 8 dígitos en UX y validar/normalizar en backend (formato +502 cuando corresponda).
- Un usuario puede tener varios roles: capacidades efectivas por unión de permisos concedidos. Backend autoriza cada operación y ownership. Registro público jamás acepta asignación de roles operativos, aunque se envíen en el payload.
- Contraseñas con hash adaptativo; mostrar/ocultar solo lo escrito por el usuario. Spring vuelve a validar lo validado por Next.
- Cambios sensibles registran actor, fecha, operación y motivo cuando aplique, con auditoría durable. Restricciones de clientes son internas, específicas, auditables y no se exponen como etiquetas públicas.

## Horarios y modalidades

Defaults: martes–domingo 14:00–22:00; última llegada de mesa 21:15; cocina normalmente deja de admitir alrededor de 21:20; PICKUP tardío listo/recogido aproximadamente hasta 21:30; aceptación automática DELIVERY termina 20:00. Los valores aproximados requieren parametrización/criterio operativo preciso antes de pruebas de frontera. Override DELIVERY exige encargado autorizado, confirmación logística y motivo auditado. Tolerancia nunca extiende cutoff.

Plataforma 24/7 para menú, mensajes y reserva futura. Pedido programado solicitado fuera de horario queda PENDING_HUMAN_REVIEW; no entra automáticamente en cocina al abrir. No inventar transiciones equivalentes ni cambiar enum sin reconciliar API/BD/web/móvil.

PICKUP: anticipación mínima ETA vigente; validar productos/modificadores, cliente/teléfono, hora, comentarios y pago. Programados cerca de apertura, especialmente 14:00–15:00, requieren confirmación humana. READY dispara aviso; recordatorio a los 15 minutos, configurable e idempotente. Efectivo al recoger, POS local y transferencia; tarjeta online solo si gateway real configurado. El máximo fijo de tres horas del PR39 no se considera requisito canónico: debe reconciliarse con programación/configuración y revisión humana, sin sustituirlo por otro máximo inventado.

DELIVERY: sin mínimo de compra ni zonas/tarifas rígidas. Agencia externa confirma cobertura, tarifa y repartidor; puede rechazar o proponer punto intermedio. Dirección, referencia, preferentemente lat/lng/map link, nombre/apellidos, teléfono verificado, pedido y pago. DELIVERY_QUOTE_PENDING representa espera logística. Tarifa separada de cocina. Prepago preferente; COD existe, default Q300 configurable para elevar a revisión/proponer prepago. Liquidación del repartidor en cartera, nunca efectivo ficticio en caja. ETA de entrega y anticipación máxima siguen pendientes de definición precisa; no heredar horario/máximo PICKUP.

CONTACTAR LOGÍSTICA prepara número, cliente, teléfono, ubicación, referencia y pago para apertura manual de WhatsApp; empleado envía. No implementar envío automático ni bloquear flujo por Meta pendiente. Chat interno independiente.

## Reservas y producción

- Mismo día: mínimo base 120 minutos. Motor aumenta por grupo, preorden, carga y cierre; heurística inicial +15 minutos por cada dos comensales sobre cuatro, subordinada a capacidad real. Sin máximo global arbitrario de personas. Grupos/carga/cierre pueden exigir REQUIRES_HUMAN_APPROVAL.
- Llegada 21:15 exige preorden completa y llegada hasta ese cutoff; ausencia pierde mesa y producción iniciada puede convertirse a PICKUP con decisión operativa.
- Tolerancia general 20 minutos y estado de demora visible; cutoff 21:15 prevalece. Cancelación sin producción iniciada con >=2h puede ser automática/reagendable; con <2h requiere revisión. Preorden pendiente/revisión editable; aceptada no editable directamente por cliente.
- Carrito no reserva stock. CART -> QUOTE -> HOLD; duración default 10–15 minutos aún requiere escoger valor configurado. Hold reduce available-to-promise, expira/reclama y se revalida tras espera logística. Aceptación compromete asignación; demanda futura no secuestra stock físico actual.
- Agotado manual y detección por receta/inventario cuando exista soporte. Antes de aceptación recalcular quote; después nunca sustituir automáticamente: CUSTOMER_DECISION_REQUIRED, decidir sustitución puntual/eliminación/cancelación y detener parte afectada.
- Pedido grande dinámico por ETA/capacidad/producciones/áreas/cierre; advertencia default 75 minutos, revisión alrededor de 90 minutos, configurables. No umbral fijo de cantidad.
- Antes de aceptación/pago cancelación libre; después CANCELLATION_REQUESTED y decisión del empleado. PREPARING/READY rechazo por defecto salvo override autorizado; cliente no modifica orden confirmada.
- Versiones históricas de recetas conservadas. Compra registrada y entrada de inventario son operaciones distintas, auditadas y verificables por separado.

## Comandas, pagos y cierre

Comanda digital/imprimible/PDF, hardware posterior. PICKUP incluye orden, identidad/teléfono, hora, productos/modificadores, comentarios y pago; DELIVERY agrega dirección/referencia sin tarifa en cocina. Mesa tiene orden maestra y tandas con actor/hora aunque cuentas estén separadas. Reserva sin preorden no genera comanda; resumen anticipado no equivale a liberar producción. Liberar cocina cuando corresponde preparar y después de aprobación requerida.

Propina, tolerancias y reglas de cierre configurables. Para smoke conservar invariantes financieros: pago parcial confirmado -> replay sin duplicado -> cierre rechazado con saldo -> completar pago confirmado -> saldo cero -> cierre pedido -> cierre/liberación mesa. También rechazar liberación mientras pedido no esté cerrado. PREPARED/PENDING no son pagos; intento activo/ambiguo aplica bloqueo vigente. Ruta DELIVERY respeta prepago/COD y liquidación en cartera, sin inventar mesa. Este orden técnico debe revisarse por responsable financiero; el mensaje actual no confirma explícitamente ese orden ni todas sus precondiciones.

Sin certificador real, documento COMPROBANTE/PRECUENTA/RESUMEN con NO ES DTE / NO FEL CERTIFICADO. Cliente default Consumidor Final, NIT/datos fiscales si solicita; dividir consumo/cuentas y drafts preservados. MockFelAdapter no demuestra autorización SAT.

## AI, Vision y recorrido de entrega

IA puede proponer; acciones restringidas requieren autorización humana. Vision es señal complementaria con confianza visible. No ampliar AI/Vision fuera del alcance confirmado ni declarar chatbot LLM real sin runtime/proveedor.

Recorrido obligatorio: registro -> verificación/login -> menú real -> perfil -> reserva -> PICKUP -> carrito/quote/hold/capacidad -> pedido -> recepción operativa -> aprobación/estados -> comanda -> caja/comprobante/draft -> mensajes. DELIVERY con logística manual; Google OAuth solo si conectado. Meta real, FEL certificado, tarjeta online y LLM no se declaran terminados sin proveedores/configuración reales.

## Gates adicionales del candidato combinado

- Multirrol conserva unión en UI y API; registro malicioso no obtiene roles operativos. Verificar ownership y teléfono no verificado en DELIVERY.
- Defaults se obtienen de configuración; cambio de horarios/propina/tolerancia/cierre modifica behavior sin editar vistas. Fronteras por modalidad y cutoff prevalente sobre tolerancia.
- Fuera de horario requiere revisión; abrir el negocio no libera cocina automáticamente. Overrides auditados con actor y motivo.
- Hold concurrente no sobrevende, expiración/revalidación correctas, demanda futura separada; sustitución/cancelación no eluden aprobación.
- Historial de receta intacto; compra sin entrada no aumenta stock; restricciones internas no se filtran a cliente.
- COD no ingresa caja hasta liquidación real; tarifas excluidas de cocina; comprobante nunca finge FEL.
- No activar módulos faltantes por integrar PR. Registrar brechas con responsable y dependencia antes de ampliar alcance.
