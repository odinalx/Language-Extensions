import { defineRunnerConfig } from 'wxt';

// Tell WXT which Chrome/Chromium binary to launch in `npm run dev`.
// Arch's `chromium` package installs to /usr/bin/chromium.
export default defineRunnerConfig({
  binaries: {
    chrome: '/usr/bin/chromium',
  },
});
