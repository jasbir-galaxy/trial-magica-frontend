"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { AuthControls } from "../auth-controls";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Star, Trash2, RotateCcw, Search, CirclePlus, PanelLeft, X } from "lucide-react";
import { CHAT_VIEWS, ChatSearchSchema, ChatViewSchema, MAX_CHAT_SEARCH_LENGTH, type Chat, type ChatView } from "@/generated/chats";
import { listChats, favoriteChat, deleteChat, restoreChat } from "@/services/chats";
import { runKeys } from "@/services/runs";
import { ApiError } from "@/services/api-client";
import { NewChatForm } from "./new-chat-form";
import { chatKeys } from "./query-keys";
import styles from "./chats.module.css";

type Operation = { action: "favorite"; chat: Chat; isFavorite: boolean } | { action: "delete" | "restore"; chat: Chat };
export function ChatSidebar({ onClose, onNavigate }: { onClose?: () => void; onNavigate?: () => void }) {
  const fieldId = useId();
  const { userId, getToken } = useAuth(), client = useQueryClient(), router = useRouter();
  const { chatId } = useParams<{ chatId?: string }>();
  const [creating, setCreating] = useState(false), [search, setSearch] = useState(""), [q, setQuery] = useState("");
  const [view, setView] = useState<ChatView>("all"), [deleting, setDeleting] = useState<Chat | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), searchInput = useRef<HTMLInputElement>(null), deleteOpener = useRef<HTMLButtonElement | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const query = useInfiniteQuery({
    queryKey: chatKeys.filtered(userId!, q, view),
    queryFn: ({ signal, pageParam }) => listChats(() => getToken(), pageParam, signal, { q, view }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  const mutation = useMutation<void, Error, Operation>({
    retry: false, networkMode: "always",
    mutationFn: async (operation: Operation) => {
      const token = () => getToken(), signal = lifetime.current?.signal;
      if (operation.action === "favorite") await favoriteChat(operation.chat.id, operation.isFavorite, token, signal);
      else if (operation.action === "restore") await restoreChat(operation.chat.id, token, signal);
      else await deleteChat(operation.chat.id, token, signal);
    },
    onSuccess: (_result, operation) => {
      if (lifetime.current?.signal.aborted) return;
      if (operation.action === "delete") {
        dialog.current?.close(); setDeleting(null);
        for (const key of [chatKeys.detail(userId!, operation.chat.id), chatKeys.messages(userId!, operation.chat.id), runKeys.latest(userId!, operation.chat.id)]) {
          void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key });
        }
        if (operation.chat.id === chatId) router.push("/chats");
        searchInput.current?.focus();
      }
      void client.invalidateQueries({ queryKey: chatKeys.list(userId!) });
      void client.invalidateQueries({ queryKey: chatKeys.detail(userId!, operation.chat.id) });
      if (operation.action === "restore") {
        // A direct visit while trashed may have cached 404s for these reads.
        void client.invalidateQueries({ queryKey: chatKeys.messages(userId!, operation.chat.id) });
        void client.invalidateQueries({ queryKey: runKeys.latest(userId!, operation.chat.id) });
      }
    },
  });
  function closeDelete() {
    if (mutation.isPending) return;
    dialog.current?.close(); setDeleting(null); mutation.reset(); deleteOpener.current?.focus();
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setQuery(ChatSearchSchema.parse(search)); }
  const chats = query.data?.pages.flatMap(page => page.items) ?? [];
  const sessionRejected = query.error instanceof ApiError && query.error.status === 401;
  const error = mutation.error instanceof ApiError ? mutation.error.message : "This change could not be saved. Please try again.";
  return <aside className={styles.sidebar} aria-label="Chat history">
    <div className={styles.sidebarHeading}>
      <Link href="/chats" aria-label="Magica home" onClick={onNavigate}><Image src="/brand/magica.webp" width={80} height={20} alt="Magica" priority /></Link>
      <button className={styles.iconButton} type="button" aria-label="Close sidebar" onClick={onClose}><PanelLeft size={15} aria-hidden="true" /></button>
    </div>
    <button className={styles.newChatButton} aria-label="New chat" onClick={() => setCreating(true)} disabled={creating}><CirclePlus size={16} aria-hidden="true" />New task</button>
    {creating ? <NewChatForm onClose={() => setCreating(false)} onCreated={onNavigate} /> : null}
    <form className={styles.chatSearch} role="search" onSubmit={submitSearch}>
      <label className={styles.srOnly} htmlFor={`${fieldId}-search`}>Search chats</label>
      <div className={styles.searchField}>
      <input ref={searchInput} id={`${fieldId}-search`} type="search" value={search} maxLength={MAX_CHAT_SEARCH_LENGTH} onChange={event => setSearch(event.target.value)} placeholder="Search chats" />
      <button className={styles.iconButton} type="submit" aria-label="Search" title="Search titles and messages"><Search size={15} aria-hidden="true" /></button>
        {q || search ? <button className={styles.iconButton} type="button" aria-label="Clear search" onClick={() => { setSearch(""); setQuery(""); searchInput.current?.focus(); }}><X size={14} aria-hidden="true" /></button> : null}</div>
      <label className={styles.srOnly} htmlFor={`${fieldId}-view`}>Show</label>
      <select id={`${fieldId}-view`} aria-label="Chat view" value={view} onChange={event => setView(ChatViewSchema.parse(event.target.value))}>
        {CHAT_VIEWS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </form>
    {mutation.isError && !deleting ? <p className={styles.error} role="alert">{error}</p> : null}
    {query.isPaused ? <p role="status" className={styles.hint}>You’re offline. Reconnect to load your chats.</p>
      : query.isPending ? <p role="status" className={styles.hint}>Loading your chats…</p> : null}
    {query.isError ? <div role="alert" className={styles.error}>
      <p>{query.error instanceof ApiError ? query.error.message : "Your chats could not be loaded."}</p>
      {!sessionRejected ? <button className={styles.secondary} disabled={query.isFetching} onClick={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}>Try again</button> : null}
    </div> : null}
    {!sessionRejected ? <>
      {query.isSuccess && chats.length === 0 ? <p className={styles.hint}>{q ? "No chats match your search." : view === "favorites" ? "No favorite chats yet." : view === "trash" ? "Trash is empty." : "No chats yet. Create one to get started."}</p> : null}
      <nav aria-label="Conversations" className={styles.chatList} onClick={event => { if ((event.target as HTMLElement).closest("a[href]")) onNavigate?.(); }}>
        {chats.map(chat => <div className={styles.chatRow} key={chat.id}>
          {chat.deletedAt ? <div className={styles.chatLink}><span className={styles.chatTitle}>{chat.title}</span><span className={styles.hint}>In Trash</span></div> :
            <Link href={`/chats/${chat.id}`} prefetch={false} className={styles.chatLink} aria-current={chatId === chat.id ? "page" : undefined}>
              <span className={styles.chatTitle}>{chat.title}</span>
              <time dateTime={chat.createdAt}>{new Date(chat.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</time>
            </Link>}
          <div className={styles.chatActions}>
            {chat.deletedAt ? <button className={styles.iconButton} type="button" disabled={mutation.isPending} aria-label={`Restore ${chat.title}`} title="Restore chat" onClick={() => mutation.mutate({ action: "restore", chat })}><RotateCcw size={16} aria-hidden="true" /></button> : <>
              <button className={styles.iconButton} type="button" disabled={mutation.isPending} aria-label={`${chat.isFavorite ? "Remove" : "Add"} ${chat.title} ${chat.isFavorite ? "from" : "to"} favorites`} aria-pressed={chat.isFavorite} title={chat.isFavorite ? "Remove favorite" : "Add favorite"} onClick={() => mutation.mutate({ action: "favorite", chat, isFavorite: !chat.isFavorite })}><Star size={16} fill={chat.isFavorite ? "currentColor" : "none"} aria-hidden="true" /></button>
              <button className={styles.iconButton} type="button" disabled={mutation.isPending} aria-label={`Delete ${chat.title}`} title="Delete chat" onClick={event => { deleteOpener.current = event.currentTarget; mutation.reset(); setDeleting(chat); dialog.current?.showModal(); }}><Trash2 size={16} aria-hidden="true" /></button>
            </>}
          </div>
        </div>)}
      </nav>
    </> : null}
    {query.hasNextPage && !query.isError ? <button className={styles.secondary} disabled={query.isFetching || query.isPaused} onClick={() => void query.fetchNextPage()}>
      {query.isFetchingNextPage ? "Loading…" : "Load more chats"}
    </button> : null}
    <Link href="/chats/integrations" onClick={onNavigate} className={styles.secondary}>API &amp; webhooks</Link>
    <AuthControls />
    <dialog ref={dialog} className={styles.deleteDialog} aria-labelledby={`${fieldId}-delete-title`} onCancel={event => { event.preventDefault(); closeDelete(); }}>
      <h2 id={`${fieldId}-delete-title`}>Delete chat?</h2><p>Move “{deleting?.title}” to Trash? You can restore it later. Saved files stay in your media library.</p>
      {mutation.isError ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={mutation.isPending} onClick={closeDelete}>Cancel</button>
        <button type="button" className={styles.primary} disabled={!deleting || mutation.isPending} onClick={() => { if (deleting) mutation.mutate({ action: "delete", chat: deleting }); }}>{mutation.isPending ? "Deleting…" : "Move to Trash"}</button></div>
    </dialog>
  </aside>;
}
