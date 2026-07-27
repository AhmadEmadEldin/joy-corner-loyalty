import fs from "node:fs";
import path from "node:path";

describe("coffee farm artwork optimization", () => {
  const archivedPng = path.resolve(
    process.cwd(),
    "design",
    "assets",
    "joy-coffee-farm-sketch.png",
  );
  const optimizedWebp = path.resolve(
    process.cwd(),
    "src",
    "assets",
    "joy-coffee-farm-sketch.webp",
  );

  it("keeps the design PNG and ships a smaller WebP", () => {
    const pngSize = fs.statSync(archivedPng).size;
    const webp = fs.readFileSync(optimizedWebp);
    expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(webp.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(webp.length).toBeLessThan(pngSize);
  });

  it("does not reference the archived PNG from application CSS", () => {
    const css = [
      fs.readFileSync(path.resolve(process.cwd(), "src", "app.css"), "utf8"),
      fs.readFileSync(
        path.resolve(
          process.cwd(),
          "src",
          "styles",
          "joy-corner-components.css",
        ),
        "utf8",
      ),
    ].join("\n");
    expect(css).not.toContain("joy-coffee-farm-sketch.png");
    expect(css).toContain("joy-coffee-farm-sketch.webp");
    expect(css).toContain("background-image: none !important");
  });
});
