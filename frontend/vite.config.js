import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5174,
    open: false,
  },
  // No React plugin — pure vanilla HTML/JS/CSS
});
