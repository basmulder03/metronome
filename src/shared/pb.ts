import PocketBase from 'pocketbase';

/** One client for the app. Same origin: Vite proxies /api in dev, PocketBase serves the app itself in production. */
export const pb = new PocketBase(location.origin);
pb.autoCancellation(false); // parallel sync requests must not cancel each other
