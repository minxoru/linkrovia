import { uuidV7 } from '../auth/crypto';
import { parseUtmValues, type UtmValues } from './index';

export type UtmTemplateInput = {
  name: string;
  description: string | null;
  values: UtmValues;
};
type UtmTemplate = UtmTemplateInput & {
  id: string;
  createdAt: number;
  updatedAt: number;
};
type TemplateRow = Omit<UtmTemplate, 'description' | 'values'> & {
  valuesJson: string;
};

const fields =
  'id, name, values_json AS valuesJson, created_at AS createdAt, updated_at AS updatedAt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    value.isWellFormed() &&
    !/\p{Cc}/u.test(value)
  );
}

export function parseUtmTemplateInput(value: unknown): UtmTemplateInput | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['name', 'description', 'values'].includes(key),
    )
  )
    return null;

  const { name, description = null, values: rawValues } = value;
  const values = parseUtmValues(rawValues);
  if (
    !validText(name, 80) ||
    !name.trim() ||
    (description !== null && !validText(description, 256)) ||
    !values ||
    Object.keys(values).length === 0
  ) {
    return null;
  }

  return {
    name: name.trim(),
    description: description?.trim() || null,
    values,
  };
}

export function parseUtmTemplateRow({
  id,
  name,
  valuesJson,
  createdAt,
  updatedAt,
}: TemplateRow): UtmTemplate | null {
  try {
    const value: unknown = JSON.parse(valuesJson);
    if (!isRecord(value)) return null;
    // Older flat values can still be loaded into a new snapshot.
    const input = parseUtmTemplateInput(
      Object.hasOwn(value, 'values')
        ? { ...value, name }
        : { name, values: value },
    );
    return input ? { id, ...input, createdAt, updatedAt } : null;
  } catch {
    return null;
  }
}

export async function listUtmTemplates(db: D1Database): Promise<UtmTemplate[]>;
export async function listUtmTemplates(
  db: D1Database,
  page: { limit: number; offset: number },
): Promise<{ data: UtmTemplate[]; nextOffset: number | null }>;
export async function listUtmTemplates(
  db: D1Database,
  page?: { limit: number; offset: number },
) {
  const statement = db.prepare(
    `SELECT ${fields} FROM utm_templates ORDER BY name COLLATE NOCASE, id
     ${page ? 'LIMIT ? OFFSET ?' : ''}`,
  );
  const { results } = await (
    page ? statement.bind(page.limit + 1, page.offset) : statement
  ).all<TemplateRow>();
  const templates = (page ? results.slice(0, page.limit) : results).flatMap(
    (row) => {
      const template = parseUtmTemplateRow(row);
      return template ? [template] : [];
    },
  );
  return page
    ? {
        data: templates,
        nextOffset:
          results.length > page.limit ? page.offset + page.limit : null,
      }
    : templates;
}

export async function getUtmTemplate(
  db: D1Database,
  id: string,
): Promise<UtmTemplate | null> {
  const row = await db
    .prepare(`SELECT ${fields} FROM utm_templates WHERE id = ?`)
    .bind(id)
    .first<TemplateRow>();
  return row ? parseUtmTemplateRow(row) : null;
}

type TemplateMutation =
  | { template: UtmTemplate }
  | {
      code:
        'name_conflict' | 'stale_template' | 'not_found' | 'invalid_template';
    };

export async function createUtmTemplate(
  db: D1Database,
  actorId: string,
  raw: unknown,
): Promise<TemplateMutation> {
  const input = parseUtmTemplateInput(raw);
  if (!input) return { code: 'invalid_template' };
  const row = await db
    .prepare(
      `INSERT INTO utm_templates (id, name, values_json, created_by)
     VALUES (?, ?, ?, ?) ON CONFLICT(name) DO NOTHING RETURNING ${fields}`,
    )
    .bind(
      uuidV7(),
      input.name,
      JSON.stringify({ description: input.description, values: input.values }),
      actorId,
    )
    .first<TemplateRow>();
  if (!row) return { code: 'name_conflict' };
  const template = parseUtmTemplateRow(row);
  return template ? { template } : { code: 'invalid_template' };
}

export async function updateUtmTemplate(
  db: D1Database,
  id: string,
  expected: number,
  raw: unknown,
): Promise<TemplateMutation> {
  const input = parseUtmTemplateInput(raw);
  if (!input || !Number.isSafeInteger(expected) || expected < 0)
    return { code: 'invalid_template' };

  const row = await db
    .prepare(
      `UPDATE utm_templates SET name = ?, values_json = ?, updated_at = MAX(unixepoch(), updated_at + 1)
     WHERE id = ? AND updated_at = ?
       AND NOT EXISTS (SELECT 1 FROM utm_templates WHERE name = ? AND id <> ?)
     RETURNING ${fields}`,
    )
    .bind(
      input.name,
      JSON.stringify({ description: input.description, values: input.values }),
      id,
      expected,
      input.name,
      id,
    )
    .first<TemplateRow>();
  if (row) {
    const template = parseUtmTemplateRow(row);
    return template ? { template } : { code: 'invalid_template' };
  }

  const existing = await db
    .prepare('SELECT updated_at FROM utm_templates WHERE id = ?')
    .bind(id)
    .first<number>('updated_at');
  if (existing === null) return { code: 'not_found' };
  return { code: existing === expected ? 'name_conflict' : 'stale_template' };
}

export async function deleteUtmTemplate(
  db: D1Database,
  id: string,
  expected: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(expected) || expected < 0) return false;
  const { meta } = await db
    .prepare('DELETE FROM utm_templates WHERE id = ? AND updated_at = ?')
    .bind(id, expected)
    .run();
  return meta.changes > 0;
}
