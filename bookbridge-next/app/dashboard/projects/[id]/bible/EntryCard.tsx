'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { BibleEntry, TermPatch } from './BibleReview'

export type AliasRow = { id: string; english: string; translation: string | null }

const input =
  'rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950'

// Saves on blur, and only when the value actually changed.
function BlurInput({
  value,
  onSave,
  label,
  className = '',
}: {
  value: string
  onSave: (v: string) => void
  label: string
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() && draft !== value && onSave(draft.trim())}
      className={`${input} ${className}`}
    />
  )
}

export default function EntryCard({
  entry,
  person,
  onPatch,
  onDeleteAlias,
  onAddAlias,
}: {
  entry: BibleEntry
  person: boolean
  onPatch: (termId: string, patch: TermPatch) => void
  onDeleteAlias: (aliasId: string) => void
  onAddAlias: (english: string, translation: string) => void
}) {
  const [voice, setVoice] = useState(entry.voice ?? '')
  const [newAlias, setNewAlias] = useState('')
  const [newAliasTr, setNewAliasTr] = useState('')

  function submitAlias() {
    if (!newAlias.trim() || !newAliasTr.trim()) return
    onAddAlias(newAlias.trim(), newAliasTr.trim())
    setNewAlias('')
    setNewAliasTr('')
  }

  return (
    <article className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-ink">{entry.english}</h3>
        <span className="text-ink-muted">→</span>
        <BlurInput
          label={`Translation of ${entry.english}`}
          value={entry.translation ?? ''}
          onSave={(translation) => onPatch(entry.id, { translation })}
          className="w-40"
        />
        <span className="ml-auto text-xs text-ink-muted" title="Paragraphs that mention this name or an alias">
          {entry.mentions} mentions{entry.userEdited || entry.approved ? ' · edited' : ''}
        </span>
      </header>

      {person && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Gender
            <select
              value={entry.gender ?? ''}
              onChange={(e) => onPatch(entry.id, { gender: e.target.value || null })}
              className={input}
            >
              <option value="">—</option>
              <option value="male">male</option>
              <option value="female">female</option>
              <option value="unknown">unknown</option>
            </select>
          </label>
          <textarea
            aria-label={`Voice of ${entry.english}`}
            placeholder="How they speak: register, tone, how they address others"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            onBlur={() => voice !== (entry.voice ?? '') && onPatch(entry.id, { voice: voice || null })}
            maxLength={1000}
            rows={2}
            className={`${input} w-full`}
          />
        </div>
      )}

      <div className="mt-3">
        <p className="text-xs font-medium text-ink-muted">
          Aliases — each keeps its own translation
        </p>
        <ul className="mt-1 space-y-1">
          {entry.aliases.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{a.english}</span>
              <span className="text-ink-muted">→</span>
              <BlurInput
                label={`Translation of alias ${a.english}`}
                value={a.translation ?? ''}
                onSave={(translation) => onPatch(a.id, { translation })}
                className="w-36"
              />
              <button
                type="button"
                onClick={() => onDeleteAlias(a.id)}
                aria-label={`Delete alias ${a.english}`}
                className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <input
            aria-label={`New alias for ${entry.english}`}
            placeholder="Alias in the source"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            className={`${input} min-w-0 flex-1`}
          />
          <input
            aria-label={`Translation of new alias for ${entry.english}`}
            placeholder="Its translation"
            value={newAliasTr}
            onChange={(e) => setNewAliasTr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAlias()}
            className={`${input} w-36`}
          />
          <button
            type="button"
            onClick={submitAlias}
            disabled={!newAlias.trim() || !newAliasTr.trim()}
            aria-label={`Add alias for ${entry.english}`}
            className="rounded p-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-900"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  )
}
