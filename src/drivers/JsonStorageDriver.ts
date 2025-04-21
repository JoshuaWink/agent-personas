import fs from 'fs/promises'; // Use promises API
import path from 'path';
import { Persona, StorageDriver, PersonaStorageState } from '../types';

// Structure expected in the JSON file
interface JsonFileStructure {
  active: Persona[];
  archived: Persona[];
}

export class JsonStorageDriver implements StorageDriver {
  private filePath: string;

  constructor(filePath: string) {
    if (!filePath) {
      throw new Error('JsonStorageDriver requires a file path.');
    }
    this.filePath = filePath;
  }

  // Helper to convert array to Map, skipping invalid entries
  private _arrayToMap(personasArray: Persona[] | undefined): Map<string, Persona> {
    const map = new Map<string, Persona>();
    if (!Array.isArray(personasArray)) {
        return map; // Return empty map if input is not an array
    }
    personasArray.forEach(persona => {
      if (persona && typeof persona.id === 'string') {
        map.set(persona.id, persona);
      } else {
        console.warn(`Skipping invalid persona object during load from ${this.filePath}:`, persona);
      }
    });
    return map;
  }

  async load(): Promise<PersonaStorageState> {
     const defaultState: PersonaStorageState = { 
        active: new Map<string, Persona>(), 
        archived: new Map<string, Persona>() 
    };
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.filePath, 'utf-8');
      // Handle empty file case explicitly before parsing
      if (data.trim() === '') {
        return defaultState;
      }

      const fileData = JSON.parse(data) as JsonFileStructure;

      // Basic validation of the loaded structure
      if (typeof fileData !== 'object' || fileData === null) {
         console.warn(`Invalid data format loaded from ${this.filePath}. Expected an object with 'active' and 'archived' arrays.`);
         return defaultState;
      }

      const activeMap = this._arrayToMap(fileData.active);
      const archivedMap = this._arrayToMap(fileData.archived);

      return { active: activeMap, archived: archivedMap };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return defaultState; // File not found is okay, return default empty state
      }
      if (error instanceof SyntaxError) {
        console.warn(`Invalid JSON found in ${this.filePath}: ${error.message}`);
      } else {
        console.error(`Error loading personas from ${this.filePath}:`, error);
      }
      return defaultState; // Return default empty state on error
    }
  }

  async save(state: PersonaStorageState): Promise<void> {
    try {
      // Convert maps to arrays for storage
      const activeArray = Array.from(state.active.values());
      const archivedArray = Array.from(state.archived.values());
      
      const fileData: JsonFileStructure = { 
        active: activeArray, 
        archived: archivedArray 
      };
      
      const dataString = JSON.stringify(fileData, null, 2); // Pretty print JSON

      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(this.filePath, dataString, 'utf-8');
    } catch (error) {
      console.error(`Error saving personas state to ${this.filePath}:`, error);
      throw error;
    }
  }
} 