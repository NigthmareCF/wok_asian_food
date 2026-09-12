"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  initialConversations,
  initialOnlineRequests,
  type ConversationRecord,
  type OnlineRequestRecord,
  type OnlineRequestStatus,
} from "@/data/fixtures/messaging";
import { currentOperationalUser } from "@/data/fixtures/operation";

type MessagingSessionContextValue = {
  conversations: ConversationRecord[];
  onlineRequests: OnlineRequestRecord[];
  takeConversation: (id: string) => void;
  replyToConversation: (id: string, content: string) => void;
  transferConversation: (id: string, assignedTo: string) => void;
  updateOnlineRequest: (
    id: string,
    status: OnlineRequestStatus,
    rejectionReason?: string,
  ) => void;
};

const MessagingSessionContext =
  createContext<MessagingSessionContextValue | null>(null);

export function MessagingSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [conversations, setConversations] =
    useState<ConversationRecord[]>(initialConversations);
  const [onlineRequests, setOnlineRequests] = useState<OnlineRequestRecord[]>(
    initialOnlineRequests,
  );

  const value = useMemo<MessagingSessionContextValue>(
    () => ({
      conversations,
      onlineRequests,
      takeConversation(id) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === id
              ? {
                  ...conversation,
                  assignedTo: currentOperationalUser,
                  status: "human",
                  unread: 0,
                }
              : conversation,
          ),
        );
      },
      replyToConversation(id, content) {
        const time = new Date().toLocaleTimeString("es-GT", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === id
              ? {
                  ...conversation,
                  preview: content,
                  lastAt: time,
                  messages: [
                    ...conversation.messages,
                    {
                      id: `${id}-${conversation.messages.length + 1}`,
                      sender: "staff",
                      content,
                      time,
                    },
                  ],
                }
              : conversation,
          ),
        );
      },
      transferConversation(id, assignedTo) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === id
              ? { ...conversation, assignedTo, status: "human" }
              : conversation,
          ),
        );
      },
      updateOnlineRequest(id, status, rejectionReason) {
        const checkedAt = new Date().toLocaleTimeString("es-GT", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        setOnlineRequests((current) =>
          current.map((request) =>
            request.id === id
              ? {
                  ...request,
                  status,
                  lastValidatedAt: checkedAt,
                  rejectionReason,
                }
              : request,
          ),
        );
      },
    }),
    [conversations, onlineRequests],
  );

  return (
    <MessagingSessionContext.Provider value={value}>
      {children}
    </MessagingSessionContext.Provider>
  );
}

export function useMessagingSession() {
  const context = useContext(MessagingSessionContext);
  if (!context) {
    throw new Error(
      "useMessagingSession must be used inside MessagingSessionProvider",
    );
  }
  return context;
}
