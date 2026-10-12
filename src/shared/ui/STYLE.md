# Styling rules

- Colours, spacing, radius and font sizes come from `tokens.css`. Feature code never contains a hex/rgb literal (a unit test enforces it).
- Light/dark: define a token once with `light-dark(light, dark)`. Do not write `@media (prefers-color-scheme)` in components.
- Use the primitives in this folder (`Button`, `Segmented`, `Sheet`, `ThemeToggle`) instead of styling raw controls in a feature.
- Component `<style>` blocks are scoped and may only lay out that component. Anything used twice moves here.
- Marks drawn on the score use the `--on-paper-*` tokens, because the page stays white in both themes.
- Dynamic geometry is passed as CSS variables (`style:--x={...}`), never as computed colours or raw style strings.
