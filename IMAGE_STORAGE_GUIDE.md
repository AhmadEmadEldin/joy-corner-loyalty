# Product Image Storage Guide

Cloudinary is the external object store for new product images because Neon is the primary database and no Firebase/Supabase storage provider exists in this project.

## Required server variables

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

Never expose these values to webpack or the browser.

## Upload path

Cloudinary public ID:

```text
menu-items/{productId}/main-{timestamp}
```

Uploads overwrite the stable product path and request CDN invalidation. The client:

1. accepts JPG, PNG, WebP, or AVIF;
2. rejects files over 5 MB;
3. scales the longest edge to at most 1600px;
4. compresses to WebP at 84% when browser canvas support is available;
5. previews and sends a data URL to the owner-only API.

The API validates declared type, decoded byte length, and file signature, signs
the Cloudinary request server-side, then stores only URL/provider/public ID in
Neon. Replacement uploads a new timestamped asset, commits the Neon reference,
and removes the previous asset only after the database transaction succeeds.

## Legacy migration

Legacy `image_bytes` and `image_content_type` remain readable through `/api/menu/images/:itemId`. A successful new upload clears those blob fields. Products should be migrated by replacing each legacy image through the owner screen, then database blob columns can be removed in a later migration after verification.

## Operations

- Replace: upload to a new timestamped public ID and retire the previous asset
  after Neon commits.
- Remove: destroy the Cloudinary public ID, then clear Neon metadata.
- Missing-image filter: available in Owner Menu & Images.
- Archive: preserves image references for restoration and historical snapshots.

