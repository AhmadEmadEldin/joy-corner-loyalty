import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createOwnerMenuItem,
  loadOwnerMenu,
  OwnerMenuItem,
  removeOwnerMenuImage,
  updateOwnerMenuItem,
  updateOwnerMenuSize,
  uploadOwnerMenuImage,
} from "./repository";
import { ProductImage } from "./ProductImage";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function OwnerMenuManager() {
  const [items, setItems] = useState<OwnerMenuItem[]>([]);
  const [selected, setSelected] = useState<OwnerMenuItem | null>(null);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("Loading owner menu…");

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

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    items.forEach((item) => {
      if (!seen.has(item.category)) seen.set(item.category, item.category_id);
    });
    return Array.from(seen.entries()).map(([name, id]) => ({ id, name }));
  }, [items]);
  const imageCoverage = useMemo(
    () =>
      categories.map((category) => {
        const categoryItems = items.filter(
          (item) => item.category_id === category.id,
        );
        return {
          ...category,
          missing: categoryItems.filter((item) => !item.image_url).length,
          total: categoryItems.length,
        };
      }),
    [categories, items],
  );
  const missingImageCount = items.filter((item) => !item.image_url).length;

  return (
    <section className="portal-section owner-menu-manager">
      <header className="owner-menu-header">
        <div>
          <p className="eyebrow">Owner catalog tools</p>
          <h2>Menu and product images</h2>
          <p className="muted">
            {items.length} products · {missingImageCount} missing images
          </p>
          {missingImageCount ? (
            <details className="owner-image-coverage">
              <summary>Review image coverage by category</summary>
              <ul>
                {imageCoverage.map((category) => (
                  <li key={category.id}>
                    <span>{category.name}</span>
                    <strong>
                      {category.missing} of {category.total} needed
                    </strong>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
        <div className="owner-menu-filters">
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
          <button onClick={() => setShowCreate(!showCreate)} type="button">
            {showCreate ? "Cancel" : "Add product"}
          </button>
        </div>
      </header>
      {message ? (
        <p aria-live="polite" className="portal-message">
          {message}
        </p>
      ) : null}
      <div className="owner-menu-layout">
        {showCreate ? (
          <OwnerMenuCreator
            categories={categories}
            onCancel={() => setShowCreate(false)}
            onCreated={async (id) => {
              setShowCreate(false);
              await refresh(id);
            }}
          />
        ) : null}
        <div aria-label="Menu products" className="owner-menu-list">
          {filtered.map((item) => (
            <button
              aria-current={selected?.id === item.id ? "true" : undefined}
              className={selected?.id === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSelected(item)}
              type="button"
            >
              <ProductImage alt={item.name} size="sm" src={item.image_url} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.category}</small>
                {item.availability_state !== "available" ? (
                  <small
                    className={`availability-badge availability-badge--${item.availability_state}`}
                  >
                    {item.availability_state === "sold_out"
                      ? "Sold out"
                      : item.availability_state === "temporarily_unavailable"
                        ? "Paused"
                        : "Archived"}
                  </small>
                ) : null}
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
            key={selected.id}
            onChanged={async () => refresh(selected.id)}
          />
        ) : (
          <div className="owner-menu-empty">
            <img alt="" src="/assets/joy-corner-emblem-v2.png" />
            <p>Select a product to manage its details and image.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function OwnerMenuEditor({
  item,
  onChanged,
}: {
  item: OwnerMenuItem;
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
        availabilityState: String(
          form.get("availabilityState") || "available",
        ) as "available" | "temporarily_unavailable" | "sold_out" | "archived",
        description: String(form.get("description") || ""),
        id: item.id,
        loyaltyEligible: form.get("loyaltyEligible") === "on",
        name: String(form.get("name") || ""),
        preparationStation: String(form.get("preparationStation")) as
          | "barista"
          | "kitchen",
        sortOrder: Number(form.get("sortOrder") ?? 0),
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
        <ProductImage
          alt={item.image_url ? item.name : `${item.name} image missing`}
          size="lg"
          src={item.image_url}
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
        <legend>Availability and display</legend>
        <label>
          Availability
          <select
            defaultValue={item.availability_state}
            name="availabilityState"
          >
            <option value="available">Available</option>
            <option value="temporarily_unavailable">
              Temporarily unavailable
            </option>
            <option value="sold_out">Sold out</option>
            <option value="archived">Archived</option>
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
          <input
            defaultChecked={item.loyalty_eligible}
            name="loyaltyEligible"
            type="checkbox"
          />{" "}
          Loyalty eligible
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

function OwnerMenuCreator({
  categories,
  onCancel,
  onCreated,
}: {
  categories: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const result = await createOwnerMenuItem({
        categoryId: String(form.get("categoryId") || ""),
        description: String(form.get("description") || ""),
        loyaltyEligible: form.get("loyaltyEligible") === "on",
        name: String(form.get("name") || ""),
        preparationStation: String(form.get("preparationStation")) as
          | "barista"
          | "kitchen",
      });
      onCreated(result.id);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="owner-menu-editor" onSubmit={submit}>
      <h3>New product</h3>
      <label>
        Product name
        <input maxLength={120} name="name" required />
      </label>
      <label>
        Category
        <select name="categoryId" required>
          <option value="">Select category…</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Description
        <textarea maxLength={500} name="description" rows={3} />
      </label>
      <label>
        Preparation station
        <select defaultValue="barista" name="preparationStation">
          <option value="barista">Barista</option>
          <option value="kitchen">Kitchen</option>
        </select>
      </label>
      <label>
        <input defaultChecked name="loyaltyEligible" type="checkbox" /> Loyalty
        eligible
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={busy} type="submit">
          {busy ? "Creating…" : "Create product"}
        </button>
        <button disabled={busy} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
      {message ? (
        <p aria-live="polite" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
