self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Pass through all requests to the network
  e.respondWith(fetch(e.request));
});
