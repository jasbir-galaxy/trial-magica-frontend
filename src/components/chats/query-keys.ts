export const chatKeys = {
  list: (userId: string) => ["chats", userId] as const,
  filtered: (userId: string, q: string, view: string) => ["chats", userId, { q, view }] as const,
  detail: (userId: string, chatId: string) => ["chat", userId, chatId] as const,
  messages: (userId: string, chatId: string) => ["messages", userId, chatId] as const,
};
