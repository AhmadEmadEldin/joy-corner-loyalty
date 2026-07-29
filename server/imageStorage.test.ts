import { cloudinaryPublicId, storeMenuImage } from "./imageStorage";

describe("Cloudinary image storage paths", () => {
  it("uses the configured staging folder", () => {
    expect(
      cloudinaryPublicId(
        "123e4567-e89b-12d3-a456-426614174000",
        "joy-corner/staging/menu-items",
      ),
    ).toBe(
      "joy-corner/staging/menu-items/123e4567-e89b-12d3-a456-426614174000/main",
    );
  });

  it("rejects traversal and invalid item identifiers", () => {
    expect(() => cloudinaryPublicId("item", "../production")).toThrow(
      "folder is invalid",
    );
    expect(() =>
      cloudinaryPublicId("item/other", "joy-corner/staging/menu-items"),
    ).toThrow("identifier is invalid");
  });

  it("creates a unique replacement path when a timestamp is supplied", () => {
    expect(
      cloudinaryPublicId(
        "123e4567-e89b-12d3-a456-426614174000",
        "joy-corner/staging/menu-items",
        1234567890,
      ),
    ).toBe(
      "joy-corner/staging/menu-items/123e4567-e89b-12d3-a456-426614174000/main-1234567890",
    );
  });

  it("rejects content that does not match the declared image type", async () => {
    await expect(
      storeMenuImage(
        "123e4567-e89b-12d3-a456-426614174000",
        `data:image/png;base64,${Buffer.from("not-a-png").toString("base64")}`,
      ),
    ).rejects.toThrow("does not match");
  });

  it("requires an explicit Cloudinary folder", async () => {
    const previous = {
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder: process.env.CLOUDINARY_FOLDER,
    };
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    delete process.env.CLOUDINARY_FOLDER;
    try {
      await expect(
        storeMenuImage(
          "123e4567-e89b-12d3-a456-426614174000",
          "data:image/png;base64,iVBORw0KGgo=",
        ),
      ).rejects.toThrow("credentials and folder");
    } finally {
      restoreEnvironment("CLOUDINARY_API_KEY", previous.apiKey);
      restoreEnvironment("CLOUDINARY_API_SECRET", previous.apiSecret);
      restoreEnvironment("CLOUDINARY_CLOUD_NAME", previous.cloudName);
      restoreEnvironment("CLOUDINARY_FOLDER", previous.folder);
    }
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
