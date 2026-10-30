import { z } from "zod";
import { UPLOADS_PATH, ATTACHMENTS_PATH, CreateUploadSchema, SignedUploadSchema, UploadSchema, UploadPolicySchema, AttachmentPageSchema, AttachmentIdListSchema, ResolveAttachmentsSchema, BindAssemblySchema, type CreateUpload } from "@/generated/uploads";
import { apiGet, apiPost } from "./api-client";
type Token = () => Promise<string | null>;
export const uploadKeys = {
  config: (userId: string) => ["uploads", userId, "config"] as const,
  detail: (userId: string, id: string) => ["uploads", userId, id] as const,
  selected: (userId: string, ids: string[]) => ["attachments", userId, ...ids] as const,
  library: (userId: string) => ["media-library", userId] as const,
};
export const getUploadPolicy = (token: Token, signal?: AbortSignal) => apiGet(`${UPLOADS_PATH}/config`, UploadPolicySchema, signal, token);
export const createUpload = (input: CreateUpload, token: Token) => apiPost(UPLOADS_PATH, SignedUploadSchema, CreateUploadSchema.parse(input), token);
export const getUpload = (id: string, token: Token, signal?: AbortSignal) => apiGet(`${UPLOADS_PATH}/${z.uuid().parse(id)}`, UploadSchema, signal, token);
export const bindUpload = (id: string, assemblyId: string, token: Token) => apiPost(`${UPLOADS_PATH}/${z.uuid().parse(id)}`, UploadSchema, BindAssemblySchema.parse({ assemblyId }), token);
export const cancelUpload = (id: string, token: Token) => apiPost(`${UPLOADS_PATH}/${z.uuid().parse(id)}/cancel`, UploadSchema, {}, token);
export const resolveAttachments = (ids: string[], token: Token, signal?: AbortSignal) => apiPost(`${ATTACHMENTS_PATH}/resolve`, ResolveAttachmentsSchema, { ids: AttachmentIdListSchema.parse(ids) }, token, signal);
export const listAttachments = (token: Token, cursor?: string, signal?: AbortSignal) => apiGet(`${ATTACHMENTS_PATH}?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, AttachmentPageSchema, signal, token);
