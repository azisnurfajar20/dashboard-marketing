import { createApp } from '../server/app.mjs';

let appPromise;

export default async function handler(req, res) {
  try {
    if (!appPromise) {
      appPromise = createApp({
        serverless: true,
      });
    }

    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error('API initialization failed:', error);
    return res.status(500).json({
      error: 'Backend gagal dijalankan.',
    });
  }
}