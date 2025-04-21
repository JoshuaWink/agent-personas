// Import uuid - Removed as it's used in PersonaRegistry now

// Represents a single entry in a Persona's changelog
export interface ChangelogEntry {
  timestamp: string; // ISO 8601 timestamp of the event
  action: 'created' | 'updated' | 'archived' | 'duplicated_from'; // Type of action performed
  details?: string; // Optional details, e.g., list of updated fields or source ID
}

// Represents the data structure for a persona
export type Persona = {
  id: string;                   // Unique identifier (UUID)
  name: string;                 // Unique, human-readable name
  description?: string;         // Short summary (Optional)
  instructions?: string;        // Core instructions/prompt for the persona (Optional)
  tags?: string[];              // Searchable tags (Optional)
  settings?: Record<string, any>; // Flexible settings object (Optional)
  createdAt: string;            // ISO 8601 timestamp of creation
  updatedAt: string;            // ISO 8601 timestamp of last update
  changelog: ChangelogEntry[];  // Audit trail of changes to this persona
};

// Input type for creating a new persona (omit system-generated fields + internal changelog)
export type CreatePersonaInput = Omit<Persona, 'id' | 'createdAt' | 'updatedAt' | 'changelog'>;

// Type for the combined active and archived state
export interface PersonaStorageState {
  active: Map<string, Persona>;
  archived: Map<string, Persona>;
}

// Defines the interface for storage drivers
export interface StorageDriver {
  // Loads both active and archived personas from storage
  load(): Promise<PersonaStorageState>;
  // Saves the complete state (both active and archived personas) to storage
  save(state: PersonaStorageState): Promise<void>;
} 