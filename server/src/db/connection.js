import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const dbPath = config.databaseUrl.replace('sqlite:', '');
const dbDir = path.dirname(dbPath);

if (dbDir && dbDir !== '.') {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
