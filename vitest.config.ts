import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        // Imports ESM sans extension : Node ne les résout pas, Vite oui.
        inline: ['@material/material-color-utilities'],
      },
    },
  },
});
