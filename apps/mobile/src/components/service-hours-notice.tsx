import { Notice } from "./ui";
import { PublicServiceDay } from "@/lib/api";
import { serviceSlotStatus, serviceWindowLabel } from "@/lib/service-hours";

type Props = {
  serviceName: string;
  localDateTime: string;
  day: PublicServiceDay | null;
  loading: boolean;
  error: string;
};

export function ServiceHoursNotice({ serviceName, localDateTime, day, loading, error }: Props) {
  if (!localDateTime) return <Notice>Ingresa una fecha y hora para consultar el horario publicado de {serviceName}.</Notice>;
  if (loading) return <Notice>Consultando el horario publicado de {serviceName}…</Notice>;
  if (error) return <Notice tone="info">{error} El servidor validará el horario al enviar la solicitud.</Notice>;

  const status = serviceSlotStatus(day, localDateTime);
  if (status === "invalid") return null;
  if (status === "unpublished") return <Notice tone="info">No hay un horario publicado disponible para esta fecha. El servidor confirmará si puede recibir la solicitud.</Notice>;
  if (status === "closed") return <Notice tone="error">{serviceName} no opera en la fecha seleccionada.</Notice>;
  const window = day ? serviceWindowLabel(day) : null;
  if (status === "outside-hours") return <Notice tone="error">{serviceName} opera de {window}; selecciona una hora dentro de ese intervalo.</Notice>;
  return <Notice tone="success">Horario publicado de {serviceName}: {window}. La aceptación todavía depende de capacidad y confirmación del restaurante.</Notice>;
}
