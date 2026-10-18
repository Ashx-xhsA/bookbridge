/**
 * The export menu is shared by the reader (icon only) and the project page
 * (labelled "Export"), so owners can find it without opening the reader.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import ExportMenu from '@/app/components/ExportMenu'

const HREFS = [
  '/api/projects/p1/export?format=md&layout=translation',
  '/api/projects/p1/export?format=md&layout=bilingual',
  '/api/projects/p1/export?format=epub&layout=side',
  '/api/projects/p1/export?format=epub&layout=stacked',
]

describe('ExportMenu', () => {
  it('shows a visible "Export" label when labelled', () => {
    render(<ExportMenu projectId="p1" labelled />)
    expect(screen.getByRole('button', { name: 'Export' })).toHaveTextContent(
      'Export'
    )
  })

  it('is icon only by default', () => {
    render(<ExportMenu projectId="p1" />)
    expect(
      screen.getByRole('button', { name: 'Export' })
    ).not.toHaveTextContent('Export')
  })

  it('opens the four downloads for the project', () => {
    render(<ExportMenu projectId="p1" labelled />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(
      screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    ).toEqual(HREFS)
  })
})
