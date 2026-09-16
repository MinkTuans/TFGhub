import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`Vietnamese copy and full custom glyph rendering at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const remoteFonts: string[] = [];
    page.on("request", request => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFonts.push(request.url());
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mỗi trò chơi lớn đều bắt đầu từ một ý tưởng nhỏ.");
    await expect(page.getByText("NƠI ƯƠM MẦM NHỮNG TRÒ CHƠI", { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-vietnamese-${width}.png`), fullPage: true });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "h1" });
    for (const text of ["Chỉnh sửa hồ sơ", "Chỉnh sửa hồ sơ".normalize("NFD")]) {
      await page.locator("h1").evaluate((element, value) => { element.textContent = value; }, text);
      await page.evaluate(() => document.fonts.ready);
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      expect(fonts.length).toBeGreaterThan(0);
      expect(fonts.every(font => font.isCustomFont && font.familyName.includes("Lora")), JSON.stringify(fonts)).toBe(true);
    }
    await page.goto("/register");
    await expect(page.getByLabel("Thư điện tử")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("TFG Sans");
    expect(await page.evaluate(() => document.fonts.check('400 16px "TFG Sans"', "Tiếng Việt đầy đủ dấu"))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`register-vietnamese-${width}.png`), fullPage: true });
    expect(remoteFonts).toEqual([]);
  });
}
