import 'reflect-metadata';
import path from 'path';
import fs from 'fs';

// Load .env before NestJS bootstrap
const dotenv_path = process.cwd() + '/.env';
try {
  fs.accessSync(dotenv_path);
  const lines = fs.readFileSync(dotenv_path, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // no .env file, continue with environment
}

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { config, log_config_summary } from './config';
import { init_knowledge_tables, index_docs_from_dir } from '@notion/knowledge/knowledge-index';
import { start_socket_app } from '@slack/socket-app';
import { mask } from './util/log';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve React dashboard static assets
  const public_dir = path.join(process.cwd(), 'public');
  if (fs.existsSync(public_dir)) {
    app.useStaticAssets(public_dir);
  }

  // Initialize DB tables and knowledge index
  init_knowledge_tables();
  const docs_dir = path.join(process.cwd(), 'docs/contracts');
  const indexed = index_docs_from_dir(docs_dir, 'api_doc');
  if (indexed > 0) console.log(mask(`[knowledge] indexed ${indexed} docs from ${docs_dir}`));

  await app.listen(config.port);
  log_config_summary();
  console.log(`[app] cs-ops-core listening on port ${config.port}`);

  // Start Slack Socket Mode (non-blocking)
  start_socket_app().catch(err => console.error('[socket] Failed:', err.message));
}

bootstrap();
