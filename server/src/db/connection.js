import Database from 'better-sqlite3';
import { config } from '../config.js';

const dbPath = config.databaseUrl.replace('sqlite:', '');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
