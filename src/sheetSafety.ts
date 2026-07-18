const FORMULA_PREFIX = /^[\s]*[=+\-@]/;

export function neutralizeSheetFormula(value: unknown, maxLength = 500) {
  const text = String(value ?? "")
    .trim()
    .slice(0, maxLength);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

export function isFormulaInjectionCandidate(value: unknown) {
  return FORMULA_PREFIX.test(String(value ?? ""));
}
