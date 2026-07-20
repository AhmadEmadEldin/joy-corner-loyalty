export type SheetRowUpdate = {
  endColumn: number;
  rowNumber: number;
  startColumn: number;
  values: unknown[];
};

export function buildSheetWritePlan(
  headers: string[],
  idHeader: string,
  records: Array<Record<string, unknown>>,
  existingRows: Map<string, number>,
) {
  if (!headers.includes(idHeader)) {
    throw new Error(`Missing identifier column ${idHeader}.`);
  }

  const managedHeaders = [...new Set(records.flatMap(Object.keys))];
  const missingHeaders = managedHeaders.filter(
    (header) => !headers.includes(header),
  );
  if (missingHeaders.length) {
    throw new Error(`Missing managed columns: ${missingHeaders.join(", ")}.`);
  }

  const groups = contiguousGroups(
    managedHeaders
      .map((header) => headers.indexOf(header))
      .sort((left, right) => left - right),
  );
  const deduplicated = new Map(
    records.map((record) => [String(record[idHeader] || ""), record]),
  );
  const updates: SheetRowUpdate[] = [];
  const appends: unknown[][] = [];

  for (const [id, record] of deduplicated) {
    if (!id) throw new Error(`Reporting row has no ${idHeader}.`);
    const rowNumber = existingRows.get(id);
    if (rowNumber) {
      for (const [startColumn, endColumn] of groups) {
        updates.push({
          endColumn,
          rowNumber,
          startColumn,
          values: headers
            .slice(startColumn, endColumn + 1)
            .map((header) => safeSheetValue(record[header])),
        });
      }
    } else {
      appends.push(
        headers.map((header) =>
          Object.prototype.hasOwnProperty.call(record, header)
            ? safeSheetValue(record[header])
            : "",
        ),
      );
    }
  }

  return { appends, updates };
}

function contiguousGroups(indices: number[]): Array<[number, number]> {
  const groups: Array<[number, number]> = [];
  for (const index of indices) {
    const previous = groups.at(-1);
    if (previous && index === previous[1] + 1) previous[1] = index;
    else groups.push([index, index]);
  }
  return groups;
}

function safeSheetValue(value: unknown) {
  return value == null ? "" : value;
}
