// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ToolCard } from "../src/components/chats/tool-card";
import { ToolInvocationSchema, formatCredits, type ToolInvocation } from "../src/generated/tools";
afterEach(cleanup);
const tool: ToolInvocation = { id: "10000000-0000-4000-8000-000000000001", runId: "10000000-0000-4000-8000-000000000002", callId: "crop", name: "crop_image", label: "Crop Image", position: 0, status: "completed", input: { image_url: "https://example.com/source.png" }, providerRunId: "receipt", output: { assets: [{ kind: "image", url: "https://example.com/crop.png", width: 64, height: 64 }], credits: 5000 }, credits: 5000, error: null, durationMs: 1500, createdAt: "2026-10-28T00:00:00.000Z", startedAt: "2026-10-28T00:00:00.000Z", finishedAt: "2026-10-28T00:00:01.500Z" };
it("renders saved images, sanitized details, duration and M-credit usage", () => {
  render(<ToolCard tool={tool} />);
  expect(screen.getByRole("img", { name: "Crop Image result 1" })).toHaveAttribute("src", "https://example.com/crop.png");
  fireEvent.click(screen.getByText("Crop Image", { selector: "strong" }));
  expect(screen.getByText("0.005M credits")).toBeVisible(); expect(screen.getByText("1.5s")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open original" })).toHaveAttribute("rel", "noopener noreferrer");
});
it("distinguishes pending, failed, cancelled and unresolved tools without showing a fake success", () => {
  for (const [status, label] of [["pending", "Pending"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["unknown", "Needs attention"]] as const) {
    const { unmount } = render(<ToolCard tool={{ ...tool, status, output: null, credits: 0, error: status === "unknown" ? "Contact support before retrying." : null }} />);
    expect(screen.getByText(label)).toBeVisible(); expect(screen.queryByRole("img")).not.toBeInTheDocument();
    if (status === "unknown") expect(screen.getByText("Contact support before retrying.")).toBeVisible();
    unmount();
  }
});
it("renders video controls from asset kind without a per-tool rendering branch", () => {
  render(<ToolCard tool={{ ...tool, name: "merge_videos", label: "Merge Videos", output: { credits: 50000, assets: [{ kind: "video", url: "https://example.com/merged.mp4" }] } }} />);
  expect(screen.getByLabelText("Merge Videos result 1")).toHaveAttribute("controls");
  expect(screen.getByLabelText("Merge Videos result 1")).toHaveAttribute("preload", "metadata");
});
it("rejects unsafe persisted asset URLs and retains precision for small prices", () => {
  expect(ToolInvocationSchema.safeParse({ ...tool, output: { credits: 1, assets: [{ kind: "image", url: "javascript:alert(1)" }] } }).success).toBe(false);
  expect(formatCredits(650)).toBe("0.00065M credits"); expect(formatCredits(1)).toBe("0.000001M credits");
});

it("renders saved text guidance with the generic card and escapes its content", () => {
  const guidance = ToolInvocationSchema.parse({ ...tool, name: "load_skill", label: "Load skill", providerRunId: null, credits: 0,
    output: { assets: [], credits: 0, text: "Guidance <script>do not execute</script>", skill: { name: "precise-cropping", path: "SKILL.md", versionHash: "a".repeat(64), contentHash: "b".repeat(64), assets: ["guides/rectangles.md"] } } });
  const { container } = render(<ToolCard tool={guidance} />);
  fireEvent.click(screen.getByText("Load skill", { selector: "strong" }));
  expect(screen.getByText("Guidance <script>do not execute</script>")).toBeVisible();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("0M credits")).toBeVisible();
});
