import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("the original character sprites load and render at an identifiable size", async ({ page }) => {
  await page.goto("/");
  const gallery = await page.evaluate(async () => {
    const sprites = [
      ["clone-cultivator.svg", "修行分身"],
      ["rescue-scout.svg", "救援同伴"],
      ["rift-beast.svg", "裂隙兽"],
      ["supply-chest.svg", "补给箱"],
    ];
    const images = await Promise.all(
      sprites.map(([file]) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Sprite did not load: " + file));
        image.src = "/src/assets/original/" + file;
      })),
    );

    const canvas = document.createElement("canvas");
    canvas.width = 430;
    canvas.height = 176;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#19252e";
    ctx.fillRect(0, 0, 430, 176);
    const xPositions = [7, 116, 220, 334];
    const imageSizes = images.map((img, index) => {
      const scale = 2;
      const x = xPositions[index];
      const y = 16 + (66 - img.naturalHeight) * 2;
      ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
      ctx.fillStyle = "#f5e2b9";
      ctx.font = "14px sans-serif";
      ctx.fillText(sprites[index][1], x, 167);
      return [img.naturalWidth, img.naturalHeight];
    });
    return { png: canvas.toDataURL("image/png"), imageSizes };
  });
  expect(gallery.imageSizes).toEqual([[48, 64], [44, 60], [56, 60], [38, 34]]);
  mkdirSync("test-results/camp-ui", { recursive: true });
  writeFileSync(
    "test-results/camp-ui/original-character-lineup.png",
    Buffer.from(gallery.png.split(",")[1], "base64"),
  );
});
