/** Les styles communs à l'atelier et au mode photo : panneaux vitrés, boutons, pastilles de papier. */
export const UI_STYLES = `
  .panel {
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 1rem;
    background: rgb(14 10 53 / 0.78);
    box-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.6);
    backdrop-filter: blur(10px);
  }
  svg.stroke path,
  .icon-btn svg path,
  .btn svg path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .swatch {
    flex-shrink: 0;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 99px;
    background-size: cover;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.25);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }
  .swatch:hover {
    transform: scale(1.08);
  }
  .swatch.on {
    box-shadow:
      0 0 0 2px #0e0a35,
      0 0 0 4px var(--color-sakura);
  }
  .icon-btn {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 99px;
    color: rgb(255 255 255 / 0.8);
  }
  .icon-btn:hover,
  .icon-btn.on {
    background: rgb(255 255 255 / 0.12);
    color: #fff;
  }
  .btn {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.4rem;
    border-radius: 0.65rem;
    padding: 0.45rem 0.8rem;
    font-size: 0.85rem;
    font-weight: 700;
    transition:
      background-color 0.15s,
      opacity 0.15s;
  }
  .btn:disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  .btn.ghost {
    background: rgb(255 255 255 / 0.08);
    color: #fff;
  }
  .btn.ghost:hover {
    background: rgb(255 255 255 / 0.16);
  }
  .btn.primary {
    background: var(--color-sakura);
    color: #1b1240;
  }
  .btn.primary:hover {
    background: #ffd9f0;
  }
`;
