import { parse } from "yaml";
import type { Database, DatabaseSchema, DatabaseRecord, FieldDefinition } from "./types";

/**
 * Parse a YAML string into a Database object
 */
export function parseYamlDatabase(content: string): Database | null {
  try {
    const parsed = parse(content);

    if (!parsed || !parsed.schema || !parsed.records) {
      return null;
    }

    const schema: DatabaseSchema = {
      fields: (parsed.schema.fields || []).map((f: any) => {
        const field: FieldDefinition = {
          name: f.name || "",
          type: f.type || "text",
          label: f.label || f.name || "",
        };
        if (f.options && Array.isArray(f.options)) {
          field.options = f.options;
        }
        return field;
      }),
    };
    if (parsed.schema.icon) {
      schema.icon = parsed.schema.icon;
    }

    const records: DatabaseRecord[] = (parsed.records || []).map((r: any) => {
      const record: DatabaseRecord = {};
      for (const field of schema.fields) {
        record[field.name] = r[field.name] ?? null;
      }
      return record;
    });

    return { schema, records };
  } catch (e) {
    console.error("ArchiveX: Failed to parse YAML database", e);
    return null;
  }
}

/**
 * Filter records based on a simple filter expression
 * Supports: field=value, field!=value, field~=partial
 */
export function filterRecords(records: DatabaseRecord[], filter: string): DatabaseRecord[] {
  if (!filter.trim()) return records;

  const conditions = filter.split("&&").map((c) => c.trim());

  return records.filter((record) => {
    return conditions.every((condition) => {
      // Not equal
      if (condition.includes("!=")) {
        const [field, value] = condition.split("!=").map((s) => s.trim());
        return String(record[field] ?? "") !== value;
      }
      // Contains
      if (condition.includes("~=")) {
        const [field, value] = condition.split("~=").map((s) => s.trim());
        return String(record[field] ?? "").toLowerCase().includes(value.toLowerCase());
      }
      // Equal
      if (condition.includes("=")) {
        const [field, value] = condition.split("=").map((s) => s.trim());
        const recordValue = record[field];
        if (Array.isArray(recordValue)) {
          return recordValue.includes(value);
        }
        return String(recordValue ?? "") === value;
      }
      return true;
    });
  });
}
