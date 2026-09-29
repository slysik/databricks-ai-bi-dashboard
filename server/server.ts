import { analytics, createApp, genie, server } from '@databricks/appkit';

createApp({
  plugins: [
    analytics(),
    genie(),
    server(),
  ],
}).catch(console.error);
