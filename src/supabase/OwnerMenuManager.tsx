import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  loadOwnerMenu,
  OwnerMenuItem,
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
                  event.currentTarget.src = "/assets/joy-corner-mark.png";
                }}
                src={item.image_url || "/assets/joy-corner-mark.png"}
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
            key={selected.id}
            onChanged={async () => refresh(selected.id)}
          />
        ) : (
          <div className="owner-menu-empty">
            <img alt="" src="/assets/joy-corner-mark.png" />
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
        active: form.get("active") === "on",
        available: form.get("available") === "on",
        description: String(form.get("description") || ""),
        id: item.id,
        loyaltyEligible: form.get("loyaltyEligible") === "on",
        name: String(form.get("name") || ""),
        preparationStation: String(form.get("preparationStation")) as
          | "barista"
          | "kitchen",
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
          src={item.image_url || "/assets/joy-corner-mark.png"}
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
