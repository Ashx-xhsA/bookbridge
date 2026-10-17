/**
 * Every column in schema.prisma must be created by a migration.
 *
 * Production databases are built with `prisma migrate deploy`, so a field
 * that was only ever applied with `prisma db push` is missing on a fresh
 * database and every query touching that table fails. This replays the
 * migration SQL (CREATE TABLE / ADD COLUMN / DROP COLUMN) and compares the
 * resulting columns with the schema's scalar fields, table by table.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const PRISMA_DIR = path.resolve(__dirname, '..', 'prisma')
const SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes'])

function schemaColumns(): Map<string, Set<string>> {
  const schema = readFileSync(path.join(PRISMA_DIR, 'schema.prisma'), 'utf8')
  const enums = new Set([...schema.matchAll(/^enum\s+(\w+)/gm)].map((m) => m[1]))
  const tables = new Map<string, Set<string>>()
  for (const [, name, body] of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const cols = new Set<string>()
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(\w+)\s+(\w+)(\[\])?\??/)
      if (!m || line.trim().startsWith('@@')) continue
      const [, field, type, list] = m
      if (SCALARS.has(type) || enums.has(type) || (list && SCALARS.has(type))) cols.add(field)
    }
    tables.set(name, cols)
  }
  return tables
}

function migratedColumns(): Map<string, Set<string>> {
  const dir = path.join(PRISMA_DIR, 'migrations')
  const sql = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => readFileSync(path.join(dir, name, 'migration.sql'), 'utf8'))
    .join('\n')
    .replace(/--.*$/gm, '')

  const tables = new Map<string, Set<string>>()
  for (const statement of sql.split(';')) {
    const create = statement.match(/CREATE TABLE\s+"(\w+)"\s*\(([\s\S]*)\)/)
    if (create) {
      const cols = [...create[2].matchAll(/^\s*"(\w+)"\s/gm)].map((m) => m[1])
      tables.set(create[1], new Set(cols))
      continue
    }
    const alter = statement.match(/ALTER TABLE\s+"(\w+)"([\s\S]*)/)
    if (!alter) continue
    const cols = tables.get(alter[1])
    if (!cols) continue
    for (const m of alter[2].matchAll(/(ADD|DROP) COLUMN\s+(?:IF (?:NOT )?EXISTS\s+)?"(\w+)"/g)) {
      if (m[1] === 'ADD') cols.add(m[2])
      else cols.delete(m[2])
    }
  }
  return tables
}

describe('prisma migrations', () => {
  const schema = schemaColumns()
  const migrated = migratedColumns()

  it('create every model as a table', () => {
    expect([...migrated.keys()].sort()).toEqual([...schema.keys()].sort())
  })

  for (const [table, cols] of schema) {
    it(`create exactly the columns of ${table}`, () => {
      expect([...(migrated.get(table) ?? [])].sort()).toEqual([...cols].sort())
    })
  }
})
