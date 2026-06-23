# Caseboard Complete UI Redesign

This plan covers the complete visual and interaction overhaul of the Caseboard game, transitioning from the current "hacker green" aesthetic to the new "Modern Elegant Dark" theme specified in the redesign document.

## User Review Required

> [!WARNING]
> **React `ClueCard.tsx` vs. Native Phaser Components**
> The design spec suggests creating a new React component (`src/client/components/ClueCard.tsx`) for the cards. However, since the string connections are drawn directly onto the Phaser canvas, using React for the cards (DOM overlays) introduces significant complexity. It would require syncing drag coordinates between React and Phaser in real-time, often resulting in visual lag and z-index issues where strings appear on top of cards inappropriately.
> 
> **Recommendation:** I strongly propose we implement the *exact visual design* specified (160x90 size, rounded corners, drop shadows, top-right icons) **entirely within Phaser's `BoardScene.ts`**. This guarantees perfectly smooth dragging, correct z-ordering (strings stay behind cards), and no performance penalties. Please confirm if this approach is acceptable.

## Proposed Changes

### Configuration & Global Styles

#### [MODIFY] [game.html](file:///c:/Users/Shaurya/Desktop/Reddit%20Game/caseboard/src/client/game.html)
- Add Google Fonts imports for `Inter`.
- Update the hardcoded `bg-[#0a0e27]` class to the new primary dark color `bg-[#0f1419]`.

#### [MODIFY] [index.css](file:///c:/Users/Shaurya/Desktop/Reddit%20Game/caseboard/src/client/index.css)
- Implement standard CSS variables for the new design system palette (`--primary-dark`, `--accent-primary`, etc.) to make Tailwind usage cleaner and consistent.

---

### React Components (UI Overlays)

#### [MODIFY] [App.tsx](file:///c:/Users/Shaurya/Desktop/Reddit%20Game/caseboard/src/client/components/App.tsx)
- Update background colors from `#0a0e27` to `#0f1419`.
- Switch typography to `Inter`.
- Restyle the header area ("CASE #X", backstory button) using the new indigo (`#6366f1`) and almost white (`#f0f4f8`) colors.
- Update the Phaser canvas border to match the new design system.

#### [MODIFY] [TheoryPanel.tsx](file:///c:/Users/Shaurya/Desktop/Reddit%20Game/caseboard/src/client/components/TheoryPanel.tsx)
- Transform into the fixed 60px bottom footer layout specified.
- Restyle the connections counter and theory textarea with the new dark palette and indigo borders.
- Update the "Submit Theory" button to the new Indigo/Rose hover states.
- Inject the fixed instruction text: "DRAG FROM PINK PEG TO CONNECT | RIGHT-CLICK STRING TO DELETE".

#### [MODIFY] [ResultPanel.tsx](file:///c:/Users/Shaurya/Desktop/Reddit%20Game/caseboard/src/client/components/ResultPanel.tsx) & [LeaderboardPanel.tsx](file:///c:/Users/Shaurya/Desktop/Reddit%20Game/caseboard/src/client/components/LeaderboardPanel.tsx)
- Broadly update these components to align with the new color palette (replacing the green/dark blue with indigo/dark grey) and the `Inter` font.

---

### Phaser Game Engine (The Board)

#### [MODIFY] [BoardScene.ts](file:///c:/Users/Shaurya/Desktop/Reddit%20Game/caseboard/src/client/game/scenes/BoardScene.ts)
- **Layout**: Update center coordinates and expand the circular radius from 180px to 200px.
- **Card Aesthetics**: 
  - Resize cards to 160x90.
  - Implement rounded corners using Phaser Graphics geometry.
  - Add drop shadows beneath the cards.
  - Reposition the clue type icon to the top right and color it rose (`#ec4899`).
  - Update title text to bold, 14px, colored `#f0f4f8`.
- **Interactions**:
  - Add card drag feedback (scale to 1.02x, border turns gold).
  - Enhance peg hover (scale to 1.3x, glowing shadow effect).
  - Fix tooltips so they spawn globally fixed above the card, rather than tracking with it, and utilize fade-in/fade-out tweens.
- **String Connections**:
  - Update the dashed preview line and drawn lines to use the indigo/gold palette.
  - Add small endpoint indicator circles to the connections.

## Verification Plan

### Automated Tests
- `npm run type-check` to ensure no React/Phaser type mismatches occur from the refactor.
- `npm run build` to verify Vite bundled everything correctly without CSS syntax errors.

### Manual Verification
- Will launch the dev server and verify:
  1. The new Inter font and Indigo/Rose color scheme are applied cleanly.
  2. Cards can be dragged without the tooltip awkwardly following them.
  3. The footer instructions are visible and not cut off.
  4. The layout feels significantly less cluttered with the expanded 160x90 cards and 200px radius.
