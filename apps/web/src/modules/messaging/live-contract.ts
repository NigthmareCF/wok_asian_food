import { isUuid } from "@/modules/checkout/pickup-contract";
import { record, instant } from "@/modules/client-workflows/validation";
export type Conversation = {
  conversationId: string;
  status: string;
  handlingMode: string;
  updatedAt: string;
  customerName?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
};
export type Message = {
  messageId: string;
  senderType: string;
  body: string;
  status: string;
  createdAt: string;
};
export type MessageReceipt = {
  messageId: string;
  status: string;
  createdAt: string;
  idempotentReplay: boolean;
};
export const parseMessage = (v: unknown): { body: string } | null =>
  record(v) &&
  typeof v.body === "string" &&
  v.body.trim().length > 0 &&
  v.body.length <= 4000
    ? { body: v.body.trim() }
    : null;
export function isConversation(v: unknown): v is Conversation {
  return (
    record(v) &&
    isUuid(v.conversationId) &&
    ["OPEN", "WAITING", "CLOSED"].includes(String(v.status)) &&
    typeof v.handlingMode === "string" &&
    instant(v.updatedAt) &&
    (v.customerName == null || typeof v.customerName === "string") &&
    (v.lastMessage == null || typeof v.lastMessage === "string") &&
    (v.lastMessageAt == null || instant(v.lastMessageAt))
  );
}
export const isConversations = (v: unknown): v is Conversation[] =>
  Array.isArray(v) && v.every(isConversation);
export const isMessages = (v: unknown): v is Message[] =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      record(x) &&
      isUuid(x.messageId) &&
      typeof x.senderType === "string" &&
      typeof x.body === "string" &&
      typeof x.status === "string" &&
      instant(x.createdAt),
  );
export const isMessageReceipt = (v: unknown): v is MessageReceipt =>
  record(v) &&
  isUuid(v.messageId) &&
  typeof v.status === "string" &&
  instant(v.createdAt) &&
  typeof v.idempotentReplay === "boolean";
