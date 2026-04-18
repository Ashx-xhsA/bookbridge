/**
 * Failing (red) tests for issue #47:
 * "fix: PDF upload dropzone click produces no response"
 *
 * Bug: <input type="file"> has conflicting Tailwind class `absolute inset-0`
 * and inline style `position: relative`, which collapses the element to zero
 * size so clicking the dropzone never opens the file picker.
 *
 * These tests are written against the BROKEN component and must all fail
 * until the implementation fix is applied.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// next/navigation must be mocked — useRouter() is called at module level
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

// lucide-react icons cannot render in jsdom without this stub
vi.mock('lucide-react', () => ({
  Upload: () => <svg data-testid="upload-icon" />,
  Loader2: () => <svg data-testid="loader-icon" />,
}))

import NewProjectPage from '@/app/dashboard/new/page'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePdfFile(name = 'book.pdf'): File {
  return new File(['%PDF-1.4 content'], name, { type: 'application/pdf' })
}

function makeNonPdfFile(name = 'photo.png'): File {
  return new File(['PNG data'], name, { type: 'image/png' })
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NewProjectPage — PDF upload dropzone (issue #47)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Test 1 — Dropzone renders a reachable file input
  //
  // The bug: style={{ position: 'relative' }} overrides the Tailwind
  // `absolute inset-0` positioning, collapsing the input.  A correctly fixed
  // component must NOT apply the conflicting inline style, so this assertion
  // checks that the inline style is absent (or at least not "relative").
  // -------------------------------------------------------------------------
  it('renders the file input without a conflicting inline position:relative style', () => {
    render(<NewProjectPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).not.toBeNull()

    // THE FAILING ASSERTION: the buggy component sets position:relative inline.
    // After the fix this must be absent (empty string or not set at all).
    expect(fileInput.style.position).not.toBe('relative')
  })

  // -------------------------------------------------------------------------
  // Test 2 — Clicking the dropzone container triggers the file input click
  //
  // The bug causes the input to be zero-sized so it can never receive the
  // click propagated from the dropzone wrapper.  A correct implementation
  // either removes the conflicting style or wires an onClick on the wrapper
  // that calls inputRef.current.click().
  // -------------------------------------------------------------------------
  it('clicking the dropzone container triggers the file input click handler', () => {
    render(<NewProjectPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).not.toBeNull()

    const clickSpy = vi.spyOn(fileInput, 'click')

    // The dropzone wrapper — the dashed-border div surrounding the input
    const dropzone = document.querySelector('[data-testid="dropzone"]') as HTMLElement

    // THE FAILING ASSERTION: without an onClick wiring the wrapper to the
    // input, this spy will never be called.
    fireEvent.click(dropzone)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Test 3 — Clicking the dropzone then selecting a valid PDF shows the filename
  //
  // A correctly fixed component wires an onClick on the dropzone wrapper to
  // call inputRef.current.click().  This test simulates that full interaction:
  // click the wrapper (which should programmatically click the hidden input),
  // then dispatch the change event on the input.
  //
  // With the BUG: the wrapper has no onClick handler, so no programmatic
  // click is issued and the input.click spy is never called, making the
  // interaction path incomplete.  The assertion below checks the spy WAS
  // called, which fails on the broken component.
  // -------------------------------------------------------------------------
  it('clicking the dropzone then changing the input displays the selected PDF filename', () => {
    render(<NewProjectPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).not.toBeNull()

    const clickSpy = vi.spyOn(fileInput, 'click')

    const dropzone = document.querySelector('[data-testid="dropzone"]') as HTMLElement

    // Step 1 — click the visible dropzone area
    fireEvent.click(dropzone)

    // THE FAILING ASSERTION (step 1): the wrapper must have programmatically
    // clicked the hidden input.  Without the fix, clickSpy is never called.
    expect(clickSpy).toHaveBeenCalledTimes(1)

    // Step 2 — simulate the browser's file-picker response
    const pdf = makePdfFile('my-novel.pdf')
    Object.defineProperty(fileInput, 'files', {
      value: { 0: pdf, length: 1, item: () => pdf },
      writable: false,
    })
    fireEvent.change(fileInput)

    expect(screen.getByText('my-novel.pdf')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Test 4 — Selecting a non-PDF file shows a validation error
  //
  // The <input> has accept=".pdf" but a JS-side type check is also needed.
  // With the bug the input is unreachable, so no change event fires and no
  // validation message is ever shown.
  // -------------------------------------------------------------------------
  it('shows a validation error when a non-PDF file is selected', () => {
    render(<NewProjectPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).not.toBeNull()

    const png = makeNonPdfFile('photo.png')

    Object.defineProperty(fileInput, 'files', {
      value: { 0: png, length: 1, item: () => png },
      writable: false,
    })
    fireEvent.change(fileInput)

    // THE FAILING ASSERTION: a correct implementation rejects non-PDF files
    // and surfaces an error.  The bug prevents any onChange from firing, so
    // the error never appears.
    expect(
      screen.getByText(/only pdf files are supported/i)
    ).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Test 5 — Submitting without selecting a file shows the "Please select"
  //           error (edge case: zero-size input leaves file state null)
  //
  // This test passes on the broken component because it does NOT require the
  // input to be clickable — the user just hits submit with no file.  This
  // confirms the submit-guard path already works and is not regressed by the
  // fix.  Including it here as an anchor so the green run has a known-good
  // baseline.
  // -------------------------------------------------------------------------
  it('shows an error when the form is submitted without a file selected', async () => {
    render(<NewProjectPage />)

    const submitButton = screen.getByRole('button', { name: /create project/i })
    fireEvent.click(submitButton)

    // The component sets error synchronously before any async work when
    // file is null, so no act() wrapping is needed.
    expect(
      await screen.findByText(/please select a pdf file/i)
    ).toBeInTheDocument()
  })
})
