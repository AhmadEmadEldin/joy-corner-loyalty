import { cloudinaryPublicId } from "./imageStorage";

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
});
