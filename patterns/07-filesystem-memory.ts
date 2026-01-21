/**
 * Pattern 4.1: Filesystem Memory
 *
 * Long-term memory goes in files, not context. Context is expensive
 * and limited. Disk is cheap and unlimited.
 *
 * Derived from: Huntley/Loom architecture, Claude Code patterns
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

import { promises as fs } from 'fs';
import * as path from 'path';

interface MemoryEntry {
  key: string;
  value: string;
  timestamp: number;
  tags?: string[];
}

class FilesystemMemory {
  private basePath: string;

  constructor(basePath: string = './.agent-memory') {
    this.basePath = basePath;
  }

  private keyToPath(key: string): string {
    // Sanitize key for filesystem
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.basePath, `${safeKey}.json`);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async store(key: string, value: string, tags?: string[]): Promise<void> {
    const entry: MemoryEntry = {
      key,
      value,
      timestamp: Date.now(),
      tags
    };
    const filePath = this.keyToPath(key);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  async retrieve(key: string): Promise<string | null> {
    try {
      const filePath = this.keyToPath(key);
      const content = await fs.readFile(filePath, 'utf-8');
      const entry: MemoryEntry = JSON.parse(content);
      return entry.value;
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const queryLower = query.toLowerCase();

    try {
      const files = await fs.readdir(this.basePath);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const content = await fs.readFile(
          path.join(this.basePath, file),
          'utf-8'
        );
        const entry: MemoryEntry = JSON.parse(content);

        // Simple text search in key, value, and tags
        if (
          entry.key.toLowerCase().includes(queryLower) ||
          entry.value.toLowerCase().includes(queryLower) ||
          entry.tags?.some(t => t.toLowerCase().includes(queryLower))
        ) {
          results.push(entry);
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await fs.unlink(this.keyToPath(key));
      return true;
    } catch {
      return false;
    }
  }
}

// Example usage in agent loop
async function agentWithMemory(
  task: string,
  memory: FilesystemMemory
): Promise<void> {
  // Check memory for relevant context
  const relevant = await memory.search(task);

  if (relevant.length > 0) {
    console.log('Found relevant memories:', relevant.map(r => r.key));
  }

  // Store new learnings
  await memory.store(
    `task-${Date.now()}`,
    `Completed: ${task}`,
    ['completed', 'task']
  );
}

export { FilesystemMemory, MemoryEntry, agentWithMemory };
