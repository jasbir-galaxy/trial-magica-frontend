"use client";

import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Message } from "@/generated/chats";
import styles from "./chats.module.css";

const ESTIMATED_MESSAGE_HEIGHT = 180;
const MESSAGE_GAP = 32;
const FOLLOW_THRESHOLD = 80;
const OVERSCAN = 6;

export function MessageTimeline({ messages, activeMessageId, followKey, hasOlder = false, renderMessage, footer }: {
  messages: Message[];
  activeMessageId?: string;
  followKey: string | null;
  hasOlder?: boolean;
  renderMessage: (message: Message) => ReactNode;
  footer?: ReactNode;
}) {
  "use no memo"; // TanStack Virtual exposes a mutable instance; React Compiler must not cache its reads.
  const viewport = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activeIndex = messages.findIndex(message => message.id === activeMessageId);
  const focusedIndex = messages.findIndex(message => message.id === focusedId);
  const getItemKey = useCallback((index: number) => messages[index].id, [messages]);
  const rangeExtractor = useCallback((range: Range) => {
    // Keep the live subscription and keyboard/modal focus mounted offscreen.
    // This adds at most two rows, regardless of conversation length.
    const indices = new Set(defaultRangeExtractor(range));
    if (activeIndex >= 0) indices.add(activeIndex);
    if (focusedIndex >= 0) indices.add(focusedIndex);
    return [...indices].sort((a, b) => a - b);
  }, [activeIndex, focusedIndex]);
  // The entire component opts out above; no mutable instance reads cross a memo boundary.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count: messages.length, getScrollElement: () => viewport.current,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT, getItemKey, rangeExtractor,
    anchorTo: "end", followOnAppend: true, scrollEndThreshold: FOLLOW_THRESHOLD,
    overscan: OVERSCAN, gap: MESSAGE_GAP, paddingStart: 8, paddingEnd: 20,
    directDomUpdates: true, directDomUpdatesMode: "position",
    onChange: instance => setAtEnd(instance.isAtEnd()),
  });
  // Only an explicit local send jumps to the latest reply. Polls and prepends
  // preserve the reading position; end anchoring handles streaming/media growth.
  useLayoutEffect(() => { virtualizer.scrollToEnd(); }, [followKey, virtualizer]);

  return <div className={styles.timeline}>
    <div ref={viewport} className={styles.turnHistory} tabIndex={0} role="region" aria-label="Conversation history">
      <ol ref={virtualizer.containerRef} className={styles.messages} aria-label="Messages">
        {virtualizer.getVirtualItems().map(item => {
          const message = messages[item.index];
          return <li key={item.key} ref={virtualizer.measureElement} data-index={item.index} data-message-id={message.id}
            className={styles.messageRow} aria-posinset={item.index + 1} aria-setsize={hasOlder ? -1 : messages.length}
            onFocusCapture={() => setFocusedId(message.id)}
            onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(null); }}>
            {renderMessage(message)}
            {item.index === messages.length - 1 && footer ? <div className={styles.messageFooter}>{footer}</div> : null}
          </li>;
        })}
      </ol>
    </div>
    {!atEnd ? <button type="button" className={styles.jumpToLatest} aria-label="Jump to latest message"
      onClick={() => { viewport.current?.focus({ preventScroll: true }); virtualizer.scrollToEnd(); }}><ArrowDown size={16} aria-hidden="true" /><span>Latest message</span></button> : null}
  </div>;
}
