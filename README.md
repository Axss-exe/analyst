# Missing UI Components Patch

Your project is missing two shadcn/ui components that the v4 progress modal and evidence form need.

## Files

| File | Destination | Action |
|------|-------------|--------|
| `components/ui/alert.tsx` | `components/ui/alert.tsx` | **Create** |
| `components/ui/progress.tsx` | `components/ui/progress.tsx` | **Create** |

## Note

`progress.tsx` requires `@radix-ui/react-progress`. If you don't have it installed:

```bash
npm install @radix-ui/react-progress
```

If you prefer not to install it, replace the Progress component in `components/ai-progress-modal.tsx` with a simple div-based progress bar.
