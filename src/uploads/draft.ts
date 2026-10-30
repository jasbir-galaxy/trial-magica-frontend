import { createStore } from "zustand/vanilla";
import { persist, createJSONStorage } from "zustand/middleware";
import { z } from "zod";
import { UploadFileSchema, MAX_ATTACHMENTS, SignedUploadSchema, AssemblyIdSchema } from "@/generated/uploads";
const BatchSchema = z.object({ requestId: z.uuid(), uploadId: z.uuid().optional(), params: z.string().optional(), signature: z.string().optional(), expiresAt: z.string().optional(), assemblyId: AssemblyIdSchema.optional() });
const StateSchema = z.object({ selected: z.array(UploadFileSchema).max(MAX_ATTACHMENTS), batch: BatchSchema.nullable() });
type Selected = z.infer<typeof UploadFileSchema>;
type Batch = z.infer<typeof BatchSchema>;
type Draft = { selected: Selected[]; batch: Batch | null; hydrated: boolean;
  add: (file: Selected) => void; remove: (id: string) => void; clear: () => void; setBatch: (batch: Batch | null) => void; setHydrated: () => void };
export function createUploadDraft(userId: string, chatId: string) {
  return createStore<Draft>()(persist((set) => ({
    selected: [], batch: null, hydrated: false,
    add: file => set(state => state.selected.some(item => item.id === file.id) || state.selected.length >= MAX_ATTACHMENTS ? state : { selected: [...state.selected, UploadFileSchema.parse(file)] }),
    remove: id => set(state => ({ selected: state.selected.filter(file => file.id !== id) })),
    clear: () => set({ selected: [] }), setBatch: batch => set({ batch }), setHydrated: () => set({ hydrated: true }),
  }), { name: `magica-attachments:${userId}:${chatId}`, storage: createJSONStorage(() => localStorage), skipHydration: true,
    partialize: state => ({ selected: state.selected, batch: state.batch }),
    merge: (saved, current) => { const parsed = StateSchema.safeParse(saved); return { ...current, ...(parsed.success ? parsed.data : {}) }; },
  }));
}
export type UploadDraft = ReturnType<typeof createUploadDraft>;
export function signedBatch(value: z.infer<typeof SignedUploadSchema>, requestId: string): Batch {
  return { requestId, uploadId: value.upload.id, params: value.params, signature: value.signature, expiresAt: value.expiresAt };
}
