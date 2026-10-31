// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MessageBody } from "../src/components/chats/message-body";
import { MessageSchema } from "../src/generated/chats";
afterEach(cleanup);
const date = "2026-10-31T00:00:00.000Z";
const message = MessageSchema.parse({ id: "10000000-0000-4000-8000-000000000001", chatId: "10000000-0000-4000-8000-000000000002", role: "assistant", status: "completed", createdAt: date, updatedAt: date, content: [
  { type: "thinking", startedAt: date, durationMs: 1200 },
  { type: "reasoning", text: "Checked facts <script>unsafe</script>", format: "summary" },
  { type: "text", text: "The answer." },
  { type: "citation", url: "https://example.com/source", title: "Original source" },
  { type: "usage", actualModel: "fixture/free", promptTokens: 12, completionTokens: 8, applicationCredits: 0 },
] });
it("renders saved rich blocks in order with safe links, measured duration and inspectable usage", () => {
  const { container } = render(<MessageBody message={message} />);
  expect(screen.getByText("Thought for 1.2s")).toBeVisible();
  fireEvent.click(screen.getByText("Reasoning summary"));
  expect(screen.getByText("Checked facts <script>unsafe</script>")).toBeVisible();
  expect(container.querySelector("script")).toBeNull();
  const link = screen.getByRole("link", { name: "Original source" });
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByText("The answer.").compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByText("Usage · 0M credits"));
  expect(screen.getByText("fixture/free")).toBeVisible();
  expect(screen.getByText("12")).toBeVisible();
});
it("keeps reasoning and citations on failed readback and does not keep a crashed thinking timer running", () => {
  render(<MessageBody message={{ ...message, status: "failed", error: "Connection interrupted. Please retry.", content: [{ type: "thinking", startedAt: date, durationMs: null }, ...message.content.slice(1)] }} />);
  expect(screen.getByText("Thinking stopped")).toBeVisible();
  expect(screen.getByRole("link", { name: "Original source" })).toBeVisible();
  expect(screen.getByText("Connection interrupted. Please retry.")).toBeVisible();
});
it("uses the latest complete rich snapshot and still accepts old plain-text frames", () => {
  const view = render(<MessageBody message={message} frame={{ sequence: 2, text: "Live", content: [{ type: "reasoning", text: "Updated summary", format: "summary" }, { type: "text", text: "Live" }] }} />);
  expect(screen.getByText("Live")).toBeVisible();
  expect(screen.queryByText("The answer.")).not.toBeInTheDocument();
  view.rerender(<MessageBody message={message} frame={{ sequence: 3, text: "Legacy stream" }} />);
  expect(screen.getByText("Legacy stream")).toBeVisible();
});
