Accessibility starts with semantic HTML that carries meaning without ARIA, layered with ARIA only where native semantics are insufficient, anchored by focus management that makes every interaction reachable by keyboard.

## The core

The browser builds an **accessibility tree** parallel to the DOM — a structured representation that assistive technologies (screen readers, switch access, voice control) consume instead of the visual layout. Semantic elements contribute correct roles, names, and states to this tree automatically. `<button>` is focusable, announced as a button, and activated by Enter/Space. `<div onClick={}>` is none of these without manual ARIA.

```tsx
// Wrong: div with click — invisible to screen readers, not keyboard-reachable
<div onClick={handleSubmit} className="btn">Submit</div>

// Correct: button — role, name, keyboard, focus all provided by the element
<button type="button" onClick={handleSubmit}>Submit</button>

// For landmark structure — screen reader users navigate by landmarks
<header role="banner">
  <nav aria-label="Main navigation">...</nav>
</header>
<main>
  <h1>Dashboard</h1>   {/* heading hierarchy: one h1, then h2, h3 */}
</main>
<footer role="contentinfo">...</footer>
```

**ARIA** (Accessible Rich Internet Applications) patches the gap for complex widgets that have no semantic HTML equivalent. The three principles: ARIA never overrides a native HTML role — use the right element first. An ARIA role without the matching keyboard behavior is worse than no ARIA. `aria-hidden="true"` removes an element from the accessibility tree entirely (useful for decorative icons).

```tsx
// Custom combobox — no native element covers this pattern
function SearchCombobox() {
  const [expanded, setExpanded] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const listboxId = React.useId()

  return (
    <div role="combobox"
         aria-expanded={expanded}
         aria-haspopup="listbox"
         aria-controls={listboxId}
         aria-activedescendant={activeIndex >= 0 ? `option-${activeIndex}` : undefined}
    >
      <input
        type="text"
        aria-autocomplete="list"
        onKeyDown={handleKeyDown} // Arrow keys, Enter, Escape
      />
      {expanded && (
        <ul id={listboxId} role="listbox">
          {options.map((opt, i) => (
            <li key={opt.id}
                id={`option-${i}`}
                role="option"
                aria-selected={i === activeIndex}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Focus management** is the most commonly skipped accessibility requirement. When content changes dynamically, focus must move to a logical location. Modal: move focus to the first focusable element inside the modal when it opens; restore focus to the trigger when it closes. Focus trap inside the modal.

```tsx
function Modal({ isOpen, onClose, children }: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      dialogRef.current?.focus()
    } else {
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null
  return (
    <div role="dialog"
         aria-modal="true"
         aria-labelledby="modal-title"
         ref={dialogRef}
         tabIndex={-1}            // programmatically focusable but not in tab order
         onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <h2 id="modal-title">Settings</h2>
      {children}
    </div>
  )
}
```

## In your project

Your Portfolio's interactive spatial canvas requires keyboard navigation for accessibility. Each interactive node needs a `tabIndex`, an `aria-label` describing its purpose, and keyboard handlers for Enter/Space activation and arrow key navigation between nodes. Without these, keyboard-only and screen-reader users cannot interact with the primary UI.

## Tradeoffs & pitfalls

- **aria-label vs aria-labelledby**: `aria-label` provides an inline string name. `aria-labelledby` references visible text by ID — preferred because it stays synchronized with visible content and is translatable.
- **Contrast ratios**: WCAG AA requires 4.5:1 for normal text, 3:1 for large text (18px+ or 14px bold). Low-contrast placeholders are the most common failure. Use the browser's accessibility inspector to audit — it shows the contrast ratio directly.
- **Keyboard trap absence**: pressing Tab inside a modal should not escape to the background page. Implement focus trapping with a `keydown` handler that intercepts Tab and Shift+Tab and keeps focus within the focusable elements inside the modal.

## Top-1% insight

The ARIA spec defines **implicit ARIA semantics** — the roles, states, and properties that native HTML elements contribute without any explicit ARIA attributes. `<a href>` has `role="link"`. `<input type="checkbox">` has `role="checkbox"` and its `checked` attribute maps to `aria-checked`. Adding explicit ARIA that duplicates the implicit semantics (`<a href role="link">`) is harmless but redundant. Adding ARIA that **conflicts** with implicit semantics (`<button role="presentation">`) actively breaks accessibility — the button loses its native role and keyboard behavior. Always consult the "Prohibited ARIA attributes" table in the HTML-AAM spec before adding roles to native elements.
