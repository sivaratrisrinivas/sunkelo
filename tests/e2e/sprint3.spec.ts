import { expect, test } from "@playwright/test";

function buildSSE(events: Array<{ type: string; data: Record<string, unknown> }>): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`).join("");
}

test("shows progress steps and understood product during sprint 3 flow", async ({ page }) => {
  await page.route("**/api/query", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
      body: buildSSE([
        { type: "status", data: { status: "listening" } },
        {
          type: "status",
          data: {
            status: "understood",
            context: { transcript: "Redmi Note 15 kaisa hai?", language: "hi-IN" },
          },
        },
        {
          type: "status",
          data: {
            status: "searching",
            context: { product: "Redmi Note 15", productSlug: "redmi-note-15" },
          },
        },
        { type: "done", data: { cached: false, remaining: 4 } },
      ]),
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("Type product name (fallback)").fill("Redmi Note 15 kaisa hai?");
  await page.getByRole("button", { name: "Ask" }).click();

  await expect(page.getByLabel("Query progress")).toBeVisible();
  await expect(page.getByText("Understood: Redmi Note 15")).toBeVisible();
  await expect(page.getByText("Searching", { exact: true })).toBeVisible();
});

test("shows non-product error card and suggestion chips", async ({ page }) => {
  await page.route("**/api/query", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
      body: buildSSE([
        { type: "status", data: { status: "listening" } },
        {
          type: "status",
          data: {
            status: "understood",
            context: { transcript: "weather kya hai?", language: "hi-IN" },
          },
        },
        {
          type: "error",
          data: {
            code: "NOT_A_PRODUCT",
            message: "I can only help with phone reviews.",
          },
        },
        { type: "done", data: { cached: false, remaining: 4 } },
      ]),
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("Type product name (fallback)").fill("weather kya hai?");
  await page.getByRole("button", { name: "Ask" }).click();

  await expect(
    page.getByText("Main sirf phone reviews mein madad kar sakta hoon. Inmein se koi query try karo."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Redmi Note 15 kaisa hai?" })).toBeVisible();
});
