import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CartLine, MenuItem } from "./repository";
import { createClientId } from "./cartDraft";

const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});

type ProductCustomizerProps = {
  initial?: CartLine;
  item: MenuItem;
  onClose: () => void;
  onSave: (line: CartLine) => void;
};

export function ProductCustomizer({
  initial,
  item,
  onClose,
  onSave,
}: ProductCustomizerProps) {
  const [sizeId, setSizeId] = useState(
    initial?.size.id || item.sizes[0]?.id || "",
  );
  const [modifierIds, setModifierIds] = useState(
    () => new Set(initial?.modifiers.map((modifier) => modifier.id) || []),
  );
  const [quantity, setQuantity] = useState(initial?.quantity || 1);
  const [notes, setNotes] = useState(initial?.notes || "");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const size = item.sizes.find((option) => option.id === sizeId);
  const selectedModifiers = item.modifiers.filter((modifier) =>
    modifierIds.has(modifier.id),
  );
  const total = useMemo(
    () =>
      ((size?.price || 0) +
        selectedModifiers.reduce((sum, modifier) => sum + modifier.price, 0)) *
      quantity,
    [quantity, selectedModifiers, size?.price],
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeys);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item.available || !size) return;
    onSave({
      item,
      lineId: initial?.lineId || createClientId(),
      modifiers: selectedModifiers,
      notes: notes.trim(),
      quantity,
      size,
    });
  }

  return (
    <div className="product-dialog-layer">
      <button
        aria-label="Close product details"
        className="product-dialog-scrim"
        onClick={onClose}
        type="button"
      />
      <section
        aria-describedby="product-dialog-description"
        aria-labelledby="product-dialog-title"
        aria-modal="true"
        className="product-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="Close product details"
          className="dialog-close"
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          ×
        </button>
        <div className="product-dialog-media">
          <img
            alt={item.name}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.src = "/assets/coffee-bean-field.jpg";
            }}
            src={item.image_url || "/assets/coffee-bean-field.jpg"}
          />
        </div>
        <form className="product-customizer" onSubmit={submit}>
          <small>{item.category}</small>
          <h2 id="product-dialog-title">{item.name}</h2>
          <p id="product-dialog-description">
            {item.description || "Prepared fresh by the Joy Corner team."}
          </p>
          <fieldset>
            <legend>Choose a size</legend>
            <div className="option-grid">
              {item.sizes.map((option) => (
                <label
                  className={sizeId === option.id ? "selected" : ""}
                  key={option.id}
                >
                  <input
                    checked={sizeId === option.id}
                    name="size"
                    onChange={() => setSizeId(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  <span>{option.size_name}</span>
                  <strong>{money.format(option.price)}</strong>
                </label>
              ))}
            </div>
          </fieldset>
          {item.modifiers.length ? (
            <fieldset>
              <legend>Make it yours</legend>
              <div className="modifier-list">
                {item.modifiers.map((modifier) => (
                  <label key={modifier.id}>
                    <input
                      checked={modifierIds.has(modifier.id)}
                      onChange={() => {
                        setModifierIds((current) => {
                          const next = new Set(current);
                          if (next.has(modifier.id)) next.delete(modifier.id);
                          else next.add(modifier.id);
                          return next;
                        });
                      }}
                      type="checkbox"
                    />
                    <span>{modifier.name}</span>
                    <strong>+ {money.format(modifier.price)}</strong>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="notes-label">
            Preparation note
            <textarea
              maxLength={300}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="For example: less sugar"
              rows={2}
              value={notes}
            />
          </label>
          <div className="customizer-footer">
            <div aria-label="Quantity" className="quantity-control">
              <button
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                type="button"
              >
                −
              </button>
              <output aria-live="polite">{quantity}</output>
              <button
                aria-label="Increase quantity"
                disabled={quantity >= 99}
                onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                type="button"
              >
                +
              </button>
            </div>
            <button disabled={!item.available || !size} type="submit">
              {initial ? "Update order" : "Add to order"} ·{" "}
              {money.format(total)}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
