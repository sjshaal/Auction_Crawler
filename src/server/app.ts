import express from 'express';
import path from 'path';
import listingsRouter  from './routes/listings.js';
import searchesRouter  from './routes/searches.js';
import crawlRouter     from './routes/crawl.js';
import semanticRouter  from './routes/semantic.js';

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/listings', listingsRouter);
app.use('/api/searches', searchesRouter);
app.use('/api/crawl',    crawlRouter);
app.use('/api/semantic', semanticRouter);

// Serve the SPA for any unmatched route
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

export default app;
