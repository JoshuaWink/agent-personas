import { v4 as uuidv4 } from 'uuid'; // Import uuid

// Represents the data structure for a persona
export type Persona = {
  id: string;                   // Unique identifier (UUID)
  name: string;                 // Unique, human-readable name
  description: string;          // Short summary
  instructions: string;         // Core instructions/prompt for the persona (renamed from prompt)
  tags: string[];               // Searchable tags
  settings: Record<string, any>; // Flexible settings object (e.g., { temperature: 0.7 })
  createdAt: string;            // ISO 8601 timestamp of creation
  updatedAt: string;            // ISO 8601 timestamp of last update
};

// Input type for creating a new persona (omit system-generated fields)
export type CreatePersonaInput = Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>;

// Defines the interface for storage drivers
export interface StorageDriver {
  // Loads personas from storage, returning a Map keyed by persona ID
  load(): Promise<Map<string, Persona>>;
  // Saves the complete set of personas (provided as a Map) to storage
  save(personas: Map<string, Persona>): Promise<void>;
} 