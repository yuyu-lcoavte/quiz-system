import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export interface DatabaseConfig {
  readonly sqlitePath: string;
  readonly timeoutMs?: number;
}

export class DatabaseManager {
  private connection: Database.Database | null = null;

  constructor(private readonly config: DatabaseConfig) {}

  open(): Database.Database {
    if (this.connection?.open) return this.connection;

    if (this.config.sqlitePath !== ':memory:') {
      mkdirSync(dirname(this.config.sqlitePath), { recursive: true });
    }

    const connection = new Database(this.config.sqlitePath, {
      timeout: this.config.timeoutMs ?? 5000,
    });
    connection.pragma('foreign_keys = ON');
    const foreignKeysEnabled = connection.pragma('foreign_keys', { simple: true });

    if (foreignKeysEnabled !== 1) {
      connection.close();
      throw new Error('SQLite foreign key enforcement could not be enabled.');
    }

    this.connection = connection;
    return connection;
  }

  close(): void {
    if (this.connection?.open) this.connection.close();
    this.connection = null;
  }
}
