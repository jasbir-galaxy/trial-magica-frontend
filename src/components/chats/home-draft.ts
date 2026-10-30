import { createStore } from "zustand/vanilla";
import { persist, createJSONStorage } from "zustand/middleware";
import { z } from "zod";
import { ChatIdSchema, CreateChatSchema, MAX_CHAT_TITLE_LENGTH, MAX_TEXT_LENGTH } from "@/generated/chats";
import { FREE_CHAT_MODEL, SendTurnSchema } from "@/generated/runs";

export const PendingConversationSchema = z.object({ chat: CreateChatSchema.extend({ requestId: z.uuid() }), turn: SendTurnSchema, chatId: ChatIdSchema.optional() });
export type PendingConversation = z.infer<typeof PendingConversationSchema>;
const SavedDraftSchema = z.object({ text: z.string().max(MAX_TEXT_LENGTH), pending: PendingConversationSchema.nullable(), planMode: z.boolean().default(false) });
type Draft = z.infer<typeof SavedDraftSchema> & { hydrated: boolean; setHydrated(): void; setText(text: string): void; setPlanMode(enabled: boolean): void; prepare(): PendingConversation; rememberChat(id: string): void; clear(): void };
export function createHomeDraft(userId: string, sessionId: string) {
  return createStore<Draft>()(persist((set, get) => ({
    text: "", pending: null, planMode: false, hydrated: false,
    setHydrated: () => set({ hydrated: true }),
    setText: text => { if (!get().pending) set({ text: text.slice(0, MAX_TEXT_LENGTH) }); },
    setPlanMode: planMode => { if (!get().pending) set({ planMode }); },
    prepare: () => {
      const saved = get().pending; if (saved) return saved;
      const text = get().text.trim();
      const pending = PendingConversationSchema.parse({ chat: { requestId: crypto.randomUUID(), title: text.replace(/\s+/g, " ").slice(0, MAX_CHAT_TITLE_LENGTH) }, turn: { requestId: crypto.randomUUID(), text, model: FREE_CHAT_MODEL, planMode: get().planMode } });
      set({ pending }); return pending;
    },
    rememberChat: id => set(state => ({ pending: state.pending ? { ...state.pending, chatId: ChatIdSchema.parse(id) } : null })),
    clear: () => set({ text: "", pending: null }),
  }), {
    name: `magica-new-conversation:${userId}:${sessionId}`, storage: createJSONStorage(() => sessionStorage), skipHydration: true,
    partialize: state => ({ text: state.text, pending: state.pending, planMode: state.planMode }),
    merge: (saved, current) => { const parsed = SavedDraftSchema.safeParse(saved); return { ...current, ...(parsed.success ? parsed.data : {}) }; },
  }));
}
