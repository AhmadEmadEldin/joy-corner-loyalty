import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  applyOwnerMenuImport,
  createOwnerMenuItem,
  loadOwnerMenu,
  MenuImportPreview,
  OwnerMenuItem,
  previewOwnerMenuImport,
  removeOwnerMenuImage,
  updateOwnerMenuItem,
  updateOwnerMenuSize,
  uploadOwnerMenuImage,
} from "./repository";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function OwnerMenuManager() {
  const [items, setItems] = useState<OwnerMenuItem[]>([]);
  const [selected, setSelected] = useState<OwnerMenuItem | null>(null);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [message, setMessage] = useState("Loading owner menu…");
  const [creating, setCreating] = useState(false);
  const [importPreview, setImportPreview] = useState<MenuImportPreview | null>(
    null,
  );
  const [previewingImport, setPreviewingImport] = useState(false);
  const [applyingImport, setApplyingImport] = useState(false);
  const [importConfirmation, setImportConfirmation] = useState("");
  const [importSource, setImportSource] = useState<unknown>(null);

  async function refresh(preferredId?: string) {
    try {
      const next = await loadOwnerMenu();
      setItems(next);
      setSelected(
        (current) =>
          next.find((item) => item.id === (preferredId || current?.id)) || null,
      );
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (!missingOnly || !item.image_url) &&
        (!normalized ||
          item.name.toLowerCase().includes(normalized) ||
          item.category.toLowerCase().includes(normalized)),
    );
  }, [items, missingOnly, query]);

  async function previewImport(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Menu JSON files must be 2 MB or smaller.");
      return;
    }
    setPreviewingImport(true);
    setImportPreview(null);
    setMessage("Validating menu import…");
    try {
      const source = JSON.parse(await file.text()) as unknown;
      const preview = await previewOwnerMenuImport(source);
      setImportSource(source);
      setImportConfirmation("");
      setImportPreview(preview);
      setMessage(
        preview.errors.length
          ? "Import is blocked. Correct every validation error before writing."
          : "Preview ready. No menu data has been written.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPreviewingImport(false);
    }
  }

  async function applyImport() {
    if (!importPreview || !importSource) return;
    setApplyingImport(true);
    setMessage("Applying the confirmed menu import…");
    try {
      const result = await applyOwnerMenuImport({
        confirmation: importConfirmation,
        digest: importPreview.digest,
        source: importSource,
      });
      setImportPreview(null);
      setImportSource(null);
      setImportConfirmation("");
      await refresh();
      setMessage(
        `Menu import complete: ${result.additions} added, ${result.updates} updated, ${result.archives} archived.`,
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setApplyingImport(false);
    }
  }

  return (
    <section className="portal-section owner-menu-manager">
      <header className="owner-menu-header">
        <div>
          <p className="eyebrow">Owner catalog tools</p>
          <h2>Menu and product images</h2>
          <p className="muted">
            {items.length} products ·{" "}
            {items.filter((item) => !item.image_url).length} missing images
          </p>
        </div>
        <div className="owner-menu-filters">
          <button onClick={() => setCreating((value) => !value)} type="button">
            {creating ? "Close new product" : "Add product"}
          </button>
          <label className="button-like">
            {previewingImport ? "Validating…" : "Preview JSON import"}
            <input
              accept="application/json,.json"
              disabled={previewingImport}
              onChange={(event) =>
                void previewImport(event.target.files?.[0])
              }
              type="file"
            />
          </label>
          <label>
            Search products
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or category"
              type="search"
              value={query}
            />
          </label>
          <label className="owner-menu-checkbox">
            <input
              checked={missingOnly}
              onChange={(event) => setMissingOnly(event.target.checked)}
              type="checkbox"
            />
            Missing images only
          </label>
        </div>
      </header>
      {message ? (
        <p aria-live="polite" className="portal-message">
          {message}
        </p>
      ) : null}
      {creating ? (
        <OwnerNewProduct
          items={items}
          onCreated={async (itemId) => {
            setCreating(false);
            await refresh(itemId);
            setMessage("Product created. Add its image and remaining details.");
          }}
        />
      ) : null}
      {importPreview ? (
        <section
          aria-label="Menu import preview"
          className="owner-import-preview"
        >
          <div>
            <p className="eyebrow">Staging preview only</p>
            <h3>Menu import changes</h3>
            <p className="muted">
              Add {importPreview.additions.length} · update{" "}
              {importPreview.updates.length} · unchanged{" "}
              {importPreview.unchanged.length} · archive{" "}
              {importPreview.archives.length}
            </p>
          </div>
          <dl>
            <div>
              <dt>Validation errors</dt>
              <dd>{importPreview.errors.length}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{importPreview.warnings.length}</dd>
            </div>
            <div>
              <dt>Price changes</dt>
              <dd>{importPreview.priceChanges.length}</dd>
            </div>
          </dl>
          {importPreview.errors.length ? (
            <ol className="owner-import-errors">
              {importPreview.errors.slice(0, 20).map((issue, index) => (
                <li key={`${issue.path}:${issue.code}:${index}`}>
                  <code>{issue.path}</code> {issue.message}
                </li>
              ))}
            </ol>
          ) : (
            <div>
              <p role="status">
                Validation passed. Review every count, then type{" "}
                <strong>APPLY MENU IMPORT</strong> to confirm this exact
                staging-only digest.
              </p>
              <label>
                Owner confirmation
                <input
                  autoComplete="off"
                  onChange={(event) =>
                    setImportConfirmation(event.target.value)
                  }
                  value={importConfirmation}
                />
              </label>
              <button
                disabled={
                  applyingImport ||
                  importConfirmation !== "APPLY MENU IMPORT"
                }
                onClick={() => void applyImport()}
                type="button"
              >
                {applyingImport ? "Applying…" : "Apply confirmed import"}
              </button>
            </div>
          )}
        </section>
      ) : null}
      <div className="owner-menu-layout">
        <div aria-label="Menu products" className="owner-menu-list">
          {filtered.map((item) => (
            <button
              aria-current={selected?.id === item.id ? "true" : undefined}
              className={selected?.id === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSelected(item)}
              type="button"
            >
              <img
                alt=""
                onError={(event) => {
                  event.currentTarget.src = "/assets/coffee-bean-field.jpg";
                }}
                src={item.image_url || "/assets/coffee-bean-field.jpg"}
              />
              <span>
                <strong>{item.name}</strong>
                <small>{item.category}</small>
              </span>
              {!item.image_url ? <em>Image needed</em> : null}
            </button>
          ))}
          {!filtered.length ? (
            <p className="muted">No matching products.</p>
          ) : null}
        </div>
        {selected ? (
          <OwnerMenuEditor
            item={selected}
            items={items}
            key={selected.id}
            onChanged={async () => refresh(selected.id)}
          />
        ) : (
          <div className="owner-menu-empty">
            <img alt="" src="/assets/coffee-bean-field.jpg" />
            <p>Select a product to manage its details and image.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function OwnerMenuEditor({
  item,
  items,
  onChanged,
}: {
  item: OwnerMenuItem;
  items: OwnerMenuItem[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await updateOwnerMenuItem({
        active: form.get("active") === "on",
        available: form.get("available") === "on",
        availabilityStatus: String(form.get("availabilityStatus")) as
          | "available"
          | "temporarily_unavailable"
          | "sold_out"
          | "archived",
        categoryId: String(form.get("categoryId") || item.category_id),
        description: String(form.get("description") || ""),
        id: item.id,
        loyaltyEligible: form.get("loyaltyEligible") === "on",
        name: String(form.get("name") || ""),
        preparationStation: String(form.get("preparationStation")) as
          | "barista"
          | "kitchen",
        sortOrder: Number(form.get("sortOrder") || 0),
      });
      await onChanged();
      setMessage("Product details saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("Uploading image…");
    try {
      await uploadOwnerMenuImage(item.id, file, item.image_url);
      await onChanged();
      setMessage("Product image updated.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    if (!window.confirm(`Remove the image for ${item.name}?`)) return;
    setBusy(true);
    try {
      await removeOwnerMenuImage(item.id, item.image_url);
      await onChanged();
      setMessage("Product image removed.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="owner-menu-editor" onSubmit={save}>
      <div className="owner-menu-image-preview">
        <img
          alt={item.image_url ? item.name : `${item.name} image missing`}
          src={item.image_url || "/assets/coffee-bean-field.jpg"}
        />
        <div>
          <label className="button-like">
            {item.image_url ? "Replace image" : "Upload image"}
            <input
              accept="image/avif,image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => void upload(event.target.files?.[0])}
              type="file"
            />
          </label>
          {item.image_url ? (
            <button
              className="button-danger"
              disabled={busy}
              onClick={() => void removeImage()}
              type="button"
            >
              Remove image
            </button>
          ) : null}
          <small>JPG, PNG, WebP, or AVIF · maximum 5 MB</small>
        </div>
      </div>
      <label>
        Product name
        <input defaultValue={item.name} maxLength={120} name="name" required />
      </label>
      <label>
        Description
        <textarea
          defaultValue={item.description}
          maxLength={500}
          name="description"
          rows={3}
        />
      </label>
      <label>
        Category
        <select defaultValue={item.category_id} name="categoryId">
          {Array.from(
            new Map(
              items.map((candidate) => [
                candidate.category_id,
                candidate.category,
              ]),
            ),
          ).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Display order
        <input
          defaultValue={item.sort_order}
          min="0"
          name="sortOrder"
          step="1"
          type="number"
        />
      </label>
      <label>
        Preparation station
        <select
          defaultValue={item.preparation_station}
          name="preparationStation"
        >
          <option value="barista">Barista</option>
          <option value="kitchen">Kitchen</option>
        </select>
      </label>
      <fieldset className="owner-menu-flags">
        <legend>Visibility and rewards</legend>
        <label>
          <input defaultChecked={item.active} name="active" type="checkbox" />{" "}
          Active
        </label>
        <label>
          <input
            defaultChecked={item.available}
            name="available"
            type="checkbox"
          />{" "}
          Available now
        </label>
        <label>
          <input
            defaultChecked={item.loyalty_eligible}
            name="loyaltyEligible"
            type="checkbox"
          />{" "}
          Loyalty eligible
        </label>
        <label>
          Availability
          <select
            defaultValue={item.availability_status}
            name="availabilityStatus"
          >
            <option value="available">Available</option>
            <option value="temporarily_unavailable">
              Temporarily unavailable
            </option>
            <option value="sold_out">Sold out</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </fieldset>
      <fieldset className="owner-size-editor">
        <legend>Sizes and prices</legend>
        {item.sizes.map((size) => (
          <label key={size.id}>
            <span>{size.size_name}</span>
            <input
              defaultValue={size.price}
              min="0.01"
              onBlur={async (event) => {
                const price = Number(event.target.value);
                if (price === size.price) return;
                try {
                  await updateOwnerMenuSize(size.id, price);
                  await onChanged();
                  setMessage(`${size.size_name} price saved.`);
                } catch (error) {
                  event.target.value = String(size.price);
                  setMessage(errorMessage(error));
                }
              }}
              step="0.01"
              type="number"
            />
            <span>EGP</span>
          </label>
        ))}
      </fieldset>
      <button disabled={busy} type="submit">
        {busy ? "Saving…" : "Save product"}
      </button>
      {message ? (
        <p aria-live="polite" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}

function OwnerNewProduct({
  items,
  onCreated,
}: {
  items: OwnerMenuItem[];
  onCreated: (itemId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const categories = Array.from(
    new Map(items.map((item) => [item.category_id, item.category])),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const itemId = await createOwnerMenuItem({
        categoryId: String(form.get("categoryId") || ""),
        description: String(form.get("description") || ""),
        loyaltyEligible: form.get("loyaltyEligible") === "on",
        name: String(form.get("name") || ""),
        preparationStation: String(form.get("preparationStation")) as
          | "barista"
          | "kitchen",
        price: Number(form.get("price")),
        sizeName: String(form.get("sizeName") || "Regular"),
        sortOrder: Number(form.get("sortOrder") || 0),
      });
      await onCreated(itemId);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="owner-new-product" onSubmit={submit}>
      <div>
        <p className="eyebrow">Catalog creation</p>
        <h3>Add a menu product</h3>
      </div>
      <label>
        Product name
        <input maxLength={120} name="name" required />
      </label>
      <label>
        Category
        <select name="categoryId" required>
          {categories.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Description
        <input maxLength={500} name="description" />
      </label>
      <label>
        Initial size
        <input defaultValue="Regular" name="sizeName" required />
      </label>
      <label>
        Initial price (EGP)
        <input min="0.01" name="price" required step="0.01" type="number" />
      </label>
      <label>
        Display order
        <input defaultValue="0" min="0" name="sortOrder" step="1" type="number" />
      </label>
      <label>
        Preparation station
        <select defaultValue="barista" name="preparationStation">
          <option value="barista">Barista</option>
          <option value="kitchen">Kitchen</option>
        </select>
      </label>
      <label>
        <input defaultChecked name="loyaltyEligible" type="checkbox" />
        Loyalty eligible
      </label>
      <button disabled={busy} type="submit">
        {busy ? "Creating…" : "Create product"}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </form>
  );
}
