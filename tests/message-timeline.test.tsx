// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { resizeTimeline } from "./helpers/virtual-layout";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageTimeline } from "../src/components/chats/message-timeline";
import type { Message } from "../src/generated/chats";

const messages = Array.from({ length: 1000 }, (_, index): Message => ({ id: `message-${index}`, chatId: "chat", role: index % 2 ? "assistant" : "user", status: "completed", content: [{ type: "text", text: `Saved message ${index}` }], createdAt: new Date(index * 1000).toISOString(), updatedAt: new Date(index * 1000).toISOString() }));
const renderMessage = (message: Message) => <div data-height={message.error ?? "180"}><p>{message.content[0].type === "text" ? message.content[0].text : ""}</p><button>Inspect {message.id}</button></div>;
const timeline = (items = messages, props: Partial<React.ComponentProps<typeof MessageTimeline>> = {}) => <MessageTimeline messages={items} followKey={null} renderMessage={renderMessage} {...props} />;
const viewport = () => screen.getByRole("region", { name: "Conversation history" });
const rows = () => document.querySelectorAll<HTMLElement>("[data-message-id]");
const scroll = (top: number) => act(() => { viewport().scrollTop = top; fireEvent.scroll(viewport()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("bounds mounted rows for 1,000 messages and starts at the latest message", async () => {
  render(timeline());
  await screen.findByText("Saved message 999");
  await waitFor(() => expect(rows().length).toBeLessThan(25));
  expect(screen.queryByText("Saved message 0")).not.toBeInTheDocument();
  expect(viewport().scrollHeight - viewport().scrollTop - viewport().clientHeight).toBeLessThanOrEqual(1);
  expect(document.querySelector('[data-message-id="message-999"]')).toHaveAttribute("aria-posinset", "1000");
});
it("preserves the visible message and offset when an older page is prepended", async () => {
  const view = render(timeline(messages.slice(900), { hasOlder: true }));
  await screen.findByText("Saved message 999");
  scroll(430);
  await screen.findByText("Saved message 902");
  const top = viewport().scrollTop;
  const anchor = document.querySelector<HTMLElement>('[data-message-id="message-902"]')!;
  const offset = parseFloat(anchor.style.top) - top;
  view.rerender(timeline(messages.slice(880), { hasOlder: true }));
  await waitFor(() => expect(viewport().scrollTop).toBeGreaterThan(top));
  expect(parseFloat(anchor.style.top) - viewport().scrollTop).toBeCloseTo(offset, 0);
  expect(screen.getAllByText("Saved message 902")).toHaveLength(1);
});
it("keeps live output mounted while reading history and does not follow an append", async () => {
  const view = render(timeline(messages, { activeMessageId: "message-999" }));
  await screen.findByText("Saved message 999");
  scroll(430);
  await screen.findByRole("button", { name: "Jump to latest message" });
  const before = document.querySelector('[data-message-id="message-999"]');
  const top = viewport().scrollTop;
  const next = [...messages.slice(0, -1), { ...messages[999], error: "480" }];
  view.rerender(timeline(next, { activeMessageId: "message-999" }));
  act(() => resizeTimeline());
  expect(document.querySelector('[data-message-id="message-999"]')).toBe(before);
  expect(viewport().scrollTop).toBe(top);
  view.rerender(timeline([...next, { ...messages[999], id: "message-1000" }], { activeMessageId: "message-1000" }));
  expect(viewport().scrollTop).toBe(top);
  await userEvent.click(screen.getByRole("button", { name: "Jump to latest message" }));
  expect(viewport()).toHaveFocus();
  await waitFor(() => expect(viewport().scrollHeight - viewport().scrollTop - viewport().clientHeight).toBeLessThanOrEqual(1));
});
it("follows a growing final reply and resize only while pinned", async () => {
  const view = render(timeline(messages));
  await screen.findByText("Saved message 999");
  view.rerender(timeline([...messages.slice(0, -1), { ...messages[999], error: "800" }]));
  act(() => resizeTimeline(450));
  await waitFor(() => expect(viewport().scrollHeight - viewport().scrollTop - viewport().clientHeight).toBeLessThanOrEqual(1));
  scroll(430);
  const top = viewport().scrollTop;
  act(() => resizeTimeline(550));
  expect(viewport().scrollTop).toBe(top);
});
it("retains a focused control outside the rendered window, then releases it on blur", async () => {
  render(timeline());
  await screen.findByText("Saved message 999");
  const button = screen.getByRole("button", { name: "Inspect message-999" });
  act(() => button.focus());
  scroll(430);
  expect(button).toHaveFocus();
  expect(button).toBeInTheDocument();
  expect(rows().length).toBeLessThan(25);
  act(() => viewport().focus());
  await waitFor(() => expect(button).not.toBeInTheDocument());
});
it("an explicit local send jumps to the end, while a restored list has no duplicate rows", async () => {
  const view = render(timeline());
  await screen.findByText("Saved message 999"); scroll(430);
  view.rerender(timeline(messages, { followKey: "new-request" }));
  await waitFor(() => expect(viewport().scrollHeight - viewport().scrollTop - viewport().clientHeight).toBeLessThanOrEqual(1));
  expect(new Set([...rows()].map(row => row.dataset.messageId)).size).toBe(rows().length);
});
