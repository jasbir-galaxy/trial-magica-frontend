import { expect, test } from "@playwright/test";
import { SendTurnResultSchema } from "../src/generated/runs";

test.describe("signed-out isolation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("does not expose saved chats to a signed-out browser", async ({ page }) => {
    await page.goto("/chats");
    await expect(page.getByRole("button", { name: "Sign in to your chats" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Conversations" })).toHaveCount(0);
  });
});

test("creates, searches, favorites, trashes and restores an owned chat", async ({ page }) => {
  const title = `Playwright workspace ${Date.now()}`;
  await page.goto("/chats");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.getByRole("textbox", { name: /Chat title/ }).fill(title);
  await page.getByRole("button", { name: "Create chat", exact: true }).click();
  await expect(page).toHaveURL(/\/chats\/[a-f0-9-]{36}$/);
  const chatURL = page.url();
  await page.getByRole("searchbox", { name: "Search chats" }).fill(title);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `Add ${title} to favorites`, exact: true }).click();
  await page.getByRole("complementary", { name: "Chat history", exact: true }).getByLabel("Chat view").selectOption("favorites");
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
  // Deleting the open chat navigates home and remounts the sidebar.
  await expect(page).toHaveURL(/\/chats$/);
  await page.getByRole("complementary", { name: "Chat history", exact: true }).getByLabel("Chat view").selectOption("trash");
  await page.getByRole("button", { name: `Restore ${title}`, exact: true }).click();
  await page.getByRole("complementary", { name: "Chat history", exact: true }).getByLabel("Chat view").selectOption("all");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(chatURL);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeInViewport();
});

test("recovers a lost send response and a waiting plan without duplicate messages", async ({ page }) => {
  let accepted: ReturnType<typeof SendTurnResultSchema.parse> | undefined;
  const submittedIds: string[] = [];
  await page.route("**/api/app/v1/chats/*/turns", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submittedIds.push(route.request().postDataJSON().requestId);
    if (accepted) return route.continue();
    // The real backend accepts the turn, then the client loses its response.
    // Only transport failure is simulated; auth, persistence, model and worker are real.
    const response = await route.fetch();
    expect(response.status()).toBe(202);
    accepted = SendTurnResultSchema.parse(await response.json());
    await route.abort("connectionfailed");
  });
  await page.goto("/chats");
  await page.getByRole("button", { name: "Plan mode", exact: true }).click();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Playwright acceptance: Propose a two-step plan to verify 17 × 23. After approval answer in one sentence. Do not use media tools.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry send", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Retry send", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/chats/${accepted!.run.chatId}$`));
  expect(submittedIds).toHaveLength(2); expect(new Set(submittedIds).size).toBe(1);
  await expect(page.getByRole("button", { name: "Approve plan", exact: true })).toBeVisible({ timeout: 150_000 });
  await page.reload();
  await page.getByRole("button", { name: "Approve plan", exact: true }).click();
  await page.reload();
  const replies = page.locator('[data-role="assistant"]');
  await expect(replies).toHaveCount(1);
  await expect(replies).toContainText("391", { timeout: 150_000 });
  await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(replies).toHaveCount(1);
  await expect(replies).toContainText("391");
  await expect(replies).toContainText("Usage · 0M credits");
});

test("stops a waiting run and preserves its cancelled reply after reload", async ({ page }) => {
  await page.goto("/chats");
  await page.getByRole("button", { name: "Plan mode", exact: true }).click();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Playwright cancellation: Propose a short two-step plan for organizing a desk. Wait for approval. Do not use media tools.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve plan", exact: true })).toBeVisible({ timeout: 150_000 });
  await page.getByRole("button", { name: "Stop reply", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve plan", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-role="assistant"]')).toContainText("You stopped this reply");
  await page.reload();
  await expect(page.locator('[data-role="assistant"]')).toHaveCount(1);
  await expect(page.locator('[data-role="assistant"]')).toContainText("You stopped this reply");
  await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
});
