Speed is a feeling before it is a measurement — a 400ms action that feels instant beats an 80ms action that feels slow.

## The core

Latency perception is not linear. Psychophysics research (Jakob Nielsen's response time thresholds, updated by Google's research on mobile) gives us three zones: under 100ms feels instant, 100ms–1s feels immediate with feedback, 1–10s requires a progress indicator, over 10s requires a completion notification. But these numbers assume the UI is static while the user waits. The techniques that matter most — skeletons and optimistic UI — work by moving the perception of activity earlier, not by making the network faster.

**Skeletons** replace the blank/spinner state with a low-fidelity structural preview. The brain, seeing the layout already rendered, perceives the content fill as an update rather than a load. This is not a trick — it is accurate communication that says "this content exists; I'm fetching it." The skeleton should match the actual content shape: a skeleton showing three lines for a component that renders a card with an image and a button misleads the user and creates a jarring shift when content lands.

**Optimistic UI** goes further: it assumes the server request will succeed and reflects the final state immediately. The write happens in the background; errors are caught and rolled back with a clear, non-alarming notification.

```tsx
// Optimistic mutation with rollback
function useTodoToggle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.toggleTodo(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      const previous = queryClient.getQueryData(['todos'])

      // Apply the optimistic change immediately
      queryClient.setQueryData(['todos'], (old: Todo[]) =>
        old.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
      )

      return { previous }
    },

    onError: (_err, _id, context) => {
      // Revert on failure — tell the user clearly
      queryClient.setQueryData(['todos'], context?.previous)
      toast.error('Could not save — your change was reverted.')
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}
```

## In your project

CUBE's component library and the ToDoApp both benefit from these patterns at different levels. CUBE tables and grids show skeletons during initial data fetch; the skeleton cell widths are randomized within a narrow range to mimic real content variance and avoid the rigid grid feel. The ToDoApp uses optimistic toggles and deletes — the interaction is instant by default, with rollback only on the rare error path.

## Tradeoffs & pitfalls

Fake optimism is the critical failure mode. Optimistic UI works for idempotent, low-risk actions — toggling a checkbox, liking a post, reordering a list. It must not be applied to irreversible or high-stakes actions: deleting an account, submitting a payment, sending a message to a large group. Applying optimistic UI to a destructive action and then rolling it back is a severe trust violation. The rule: if the failure case would genuinely distress the user, do not apply optimism.

Skeleton timing matters too. A skeleton that appears for 50ms before real content arrives creates a flash of unstyled content — worse than no skeleton. Gate skeletons behind a short delay (150–200ms): if content loads before the threshold, show nothing; if not, show the skeleton.

## Top-1% insight

The most underrated perceived-performance technique is neither skeletons nor optimistic UI — it is prefetching on intent signals. When a user hovers a list item for 100ms, there is a high probability they will click it. Starting the data fetch at that hover event means content may be ready by the time the click completes, collapsing the perceived latency to zero. Combined with a stale-while-revalidate cache policy, the result is a product that feels like it anticipates the user — which, precisely, it does.
