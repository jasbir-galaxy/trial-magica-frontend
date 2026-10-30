// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MessageMarkdown } from "../src/components/chats/message-markdown";
afterEach(cleanup);

it("renders headings, lists, code and GFM tables without changing source text", () => {
  render(<MessageMarkdown text={"## Result\n\n**Complete**\n\n1. First\n2. Second\n\n```ts\nconst value = '<tag>';\n```\n\n| Name | Value |\n| --- | --- |\n| Size | 512 |"} />);
  expect(screen.getByRole("heading", { name: "Result" })).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("Complete").tagName).toBe("STRONG");
  expect(screen.getByText("const value = '<tag>';")).toBeVisible();
  expect(screen.getByRole("table")).toHaveTextContent("Size512");
});
it("keeps raw HTML inert, rejects unsafe links and never loads Markdown images", () => {
  const { container } = render(<MessageMarkdown text={'<script>alert(1)</script>\n\n<img src="https://tracker.example/pixel" onerror="alert(1)">\n\n[bad](javascript:alert%281%29) [data](data:text/html,hello) [local](/api/action) ![untrusted](https://tracker.example/a.png) [safe](https://example.com/help)'} />);
  expect(container.querySelector("script,img,iframe")).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "safe" })).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByText("[Image: untrusted]")).toBeVisible();
});
it("reconciles incomplete streamed Markdown without duplicate blocks", () => {
  const view = render(<MessageMarkdown text="**Working" />);
  expect(screen.getByText("**Working")).toBeVisible();
  view.rerender(<MessageMarkdown text={"**Working**\n\nDone."} />);
  expect(screen.getByText("Working").tagName).toBe("STRONG");
  expect(screen.getAllByText("Done.")).toHaveLength(1);
});
