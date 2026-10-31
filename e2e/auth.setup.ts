import { test as setup, expect } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { chmodSync, mkdirSync } from "node:fs";

setup("authenticate an isolated Clerk test user", async ({ page }) => {
  if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") || !process.env.CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) throw new Error("E2E requires keys from the existing Clerk development instance.");
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL;
  if (!emailAddress?.includes("+clerk_test@")) throw new Error("Set E2E_CLERK_USER_EMAIL to a dedicated +clerk_test user; do not use a personal account.");
  await clerkSetup();
  await page.goto("/chats");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/chats");
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  mkdirSync(".auth", { recursive: true, mode: 0o700 }); chmodSync(".auth", 0o700);
  await page.context().storageState({ path: ".auth/user.json" }); chmodSync(".auth/user.json", 0o600);
});
