import { expect, test } from "@playwright/test";

test("landing shell renders title, subtitle and mic button", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "SunkeLo" })).toBeVisible();
  await expect(page.getByText("कोई भी फोन पूछो")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tap to record" })).toBeVisible();
});
