import fs from 'fs/promises'; // Use promises API
import path from 'path';
import { Persona, StorageDriver } from '../types';

export class JsonStorageDriver implements StorageDriver {
  private filePath: string;

  constructor(filePath: string) {
    if (!filePath) {
      throw new Error('JsonStorageDriver requires a file path.');
    }
    this.filePath = filePath;
  }

  async save(personas: Map<string, Persona>): Promise<void> {
    try {
      // Convert Map values to an array for storage
      const personasArray = Array.from(personas.values());
      const data = JSON.stringify(personasArray, null, 2); // Pretty print JSON

      // Ensure directory exists before trying to write
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(this.filePath, data, 'utf-8');
    } catch (error) {
      console.error(`Error saving personas to ${this.filePath}:`, error);
      // Re-throw or handle as appropriate for the application
      throw error;
    }
  }

  async load(): Promise<Map<string, Persona>> {
    try {
      // Ensure directory exists before trying to read
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Try reading the file
      const data = await fs.readFile(this.filePath, 'utf-8');
      const personasArray: Persona[] = JSON.parse(data);

      // Convert array back to Map keyed by ID for the registry
      const personasMap = new Map<string, Persona>();
      if (Array.isArray(personasArray)) {
        personasArray.forEach(persona => {
          // Basic validation: ensure persona has an ID
          if (persona && typeof persona.id === 'string') {
             personasMap.set(persona.id, persona);
          } else {
            console.warn(`Skipping invalid persona object during load from ${this.filePath}:`, persona);
          }
        });
      } else {
         console.warn(`Invalid data format loaded from ${this.filePath}. Expected an array.`);
         // Return empty map if format is wrong
         return new Map<string, Persona>();
      }
      return personasMap;
    } catch (error: any) {
      // If file doesn't exist (ENOENT), it's not an error, just return empty map
      if (error.code === 'ENOENT') {
        return new Map<string, Persona>();
      }
      // Handle JSON parsing errors or other read errors
      if (error instanceof SyntaxError) {
        console.warn(`Invalid JSON found in ${this.filePath}: ${error.message}`);
      } else {
        console.error(`Error loading personas from ${this.filePath}:`, error);
      }
      // Return empty map in case of error during load
      return new Map<string, Persona>();
    }
  }
} 