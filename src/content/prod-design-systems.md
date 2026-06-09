A design system is not a component library — it is a shared contract between design and engineering, enforced by tokens, expressed through components, and proven in documentation.

## The core

The failure mode of most component libraries is that they solve the wrong problem. A library of React components solves copy-paste; it does not solve consistency. The moment a designer applies a color not in the library, or an engineer hardcodes a `16px` margin, the system fractures. The fracture compounds — every exception creates local knowledge that onboarders cannot find.

Design tokens fix this at the root. A token is a named design decision:

```ts
// tokens.ts — the single source of truth
export const tokens = {
  color: {
    brand: {
      primary:   '#5EEAD4',
      primaryHover: '#2DD4BF',
    },
    text: {
      primary:   '#111827',
      secondary: '#6B7280',
      disabled:  '#9CA3AF',
    },
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '40px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    full: '9999px',
  },
} as const
```

Tokens at this level — before they become CSS variables or MUI theme overrides — are platform-agnostic. The same object seeds both your web CSS variables and a React Native StyleSheet. When a brand color changes, you change one value in `tokens.ts` and the entire product updates.

Storybook's role is documentation-as-truth. A component without a story is invisible to designers, invisible to other engineers, and untested against its own edge cases. 150+ stories means you have a living specification — hover states, disabled states, error states, dark mode — all renderable without running the full app.

## In your project

CUBE is a custom Material UI component library with 150+ Storybook stories. At that scale, token discipline is what keeps the system coherent. An ad-hoc margin here, an inline color there, and after six months you have a library that no one trusts because it does not match the actual product. The MUI theme override layer should be the only place raw values appear; every component consumes tokens.

## Tradeoffs & pitfalls

Token sprawl is the most common failure: `color-brand-primary`, `color-brand-primary-hover`, `color-brand-primary-hover-dark`, `color-brand-primary-hover-dark-disabled` — at some point the system is harder to use than hardcoding. The discipline is fewer tokens at higher semantic levels: `color.interactive.default`, `color.interactive.hover`, `color.interactive.disabled`. Values below that level are implementation details.

The second failure is documentation drift. Storybook stories that do not match the actual component behavior are worse than no documentation — they create false confidence. Stories must be co-located with components and run in CI.

## Top-1% insight

The jump from a component library to a real design system happens when the tokens are owned by design tooling, not just code. When Figma variables map 1:1 to `tokens.ts`, a designer can make a decision in Figma and an engineer can implement it without a translation meeting. The handoff friction drops to near zero. This requires the design and engineering token structures to be deliberately aligned from the start — retrofitting it after the fact is painful and rarely complete.
