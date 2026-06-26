import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Webtoon Korean Reader',
    description: 'OCR + dictionary helper for Korean webtoons',
    version: '0.1.1',
    // Tesseract compiles a .wasm core; MV3's default CSP (script-src 'self')
    // blocks WebAssembly.instantiate. 'wasm-unsafe-eval' re-allows it.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    permissions: ['activeTab', 'scripting', 'storage', 'tabs', 'offscreen'],
    host_permissions: [
      'https://translate.googleapis.com/*',
      'https://translate.google.com/*',
      'https://*.apigw.ntruss.com/*',
      'https://ko.dict.naver.com/*',
      'https://dict-dn.pstatic.net/*',
      'http://127.0.0.1:8765/*',
      'http://localhost:8765/*',
    ],
    web_accessible_resources: [
      {
        // Worker + core wasm must be reachable from the extension origin.
        resources: ['tesseract/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
