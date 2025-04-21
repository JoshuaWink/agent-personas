import debounce from 'lodash/debounce'; // Import lodash debounce
import { DebouncedFunc } from 'lodash'; // Import DebouncedFunc type from main lodash types
import { v4 as uuidv4 } from 'uuid'; // Import uuid
// Import ALL necessary types from types.ts now
import { Persona, StorageDriver, CreatePersonaInput, PersonaStorageState, ChangelogEntry } from "./types"; 

export interface RegistryOptions {
  debounceSaveMs?: number;
  autoSaveEnabled?: boolean;
}

export class PersonaRegistry {
  private storageDriver: StorageDriver;
  // Active personas
  private personas: Map<string, Persona> = new Map(); // In-memory cache, keyed by ID
  // Archived personas
  private archivedPersonas: Map<string, Persona> = new Map(); // In-memory cache, keyed by ID
  private isDirty: boolean = false; // Internal flag
  private options: Required<RegistryOptions>; // Store resolved options
  // Store the debounced function (lodash debounce returns the function with methods)
  private _debouncedSave: DebouncedFunc<() => Promise<void>>;

  // Default options
  private static defaultOptions: Required<RegistryOptions> = {
    debounceSaveMs: 5000, // Default 5 seconds
    autoSaveEnabled: true,
  };

  // NOTE: Constructor is now private to enforce async initialization via static method
  private constructor(driver: StorageDriver, options?: RegistryOptions) {
    this.storageDriver = driver;
    // Merge provided options with defaults
    this.options = { ...PersonaRegistry.defaultOptions, ...options };

    // Create the debounced save function using lodash
    // Need to ensure the debounced function type matches expectations
    // Lodash debounce returns the debounced function directly, with a cancel method.
    this._debouncedSave = debounce(
      this._saveIfDirty.bind(this),
      this.options.debounceSaveMs,
      { leading: false, trailing: true } // Common debounce options
    );
  }

  // Static async factory method for initialization
  static async create(
    driver: StorageDriver,
    options?: RegistryOptions // Accept optional config
  ): Promise<PersonaRegistry> {
    const registry = new PersonaRegistry(driver, options);
    await registry.loadInitialPersonas(); // Load personas into cache
    return registry;
  }

  // Helper method to load personas into cache (keyed by ID)
  private async loadInitialPersonas(): Promise<void> {
    // Driver now returns both active and archived
    const state = await this.storageDriver.load(); 
    // Ensure loaded data conforms to the Persona type (maps already hold Persona type)
    this.personas = state.active; 
    this.archivedPersonas = state.archived;
    this.isDirty = false; // Ensure clean state after initial load
  }

  // Use CreatePersonaInput, generate ID/timestamps, return full Persona
  async createPersona(input: CreatePersonaInput, originalIdForDuplication?: string): Promise<Persona> {
    // Check for duplicate name before creating
    const existingNames = Array.from(this.personas.values()).map(p => p.name);
    if (existingNames.includes(input.name)) {
      throw new Error(`Persona with name "${input.name}" already exists.`);
    }

    const now = new Date().toISOString();
    
    // Initialize changelog
    const initialChangelog: ChangelogEntry[] = [
      { timestamp: now, action: 'created' }
    ];
    
    // Add duplication entry if applicable
    if (originalIdForDuplication) {
        initialChangelog.push({ timestamp: now, action: 'duplicated_from', details: `Source ID: ${originalIdForDuplication}` })
    }

    // Construct the new Persona object, ensuring all required fields are present
    const newPersona: Persona = {
      id: uuidv4(),
      name: input.name,
      description: input.description, // Optional from input
      instructions: input.instructions, // Optional from input
      tags: input.tags, // Optional from input
      settings: input.settings, // Optional from input
      createdAt: now,
      updatedAt: now,
      changelog: initialChangelog, // Add initial changelog
    };

    // Update cache first using ID
    this.personas.set(newPersona.id, newPersona);
    this.isDirty = true; // Mark as dirty

    // Trigger debounced save 
    this._debouncedSave();

    return newPersona; // Return the created persona object
  }

  listPersonas(): Persona[] {
    // Only list active personas
    return Array.from(this.personas.values());
  }

  // Get by ID now
  getPersona(id: string): Persona | undefined {
    // Only get active personas
    return this.personas.get(id);
  }

  // No change needed here, already iterates values
  findByTag(tag: string): Persona[] {
    // Only search active personas
    const activePersonas = Array.from(this.personas.values());
    // Filter safely: check if tags exist before calling includes
    return activePersonas.filter(persona => persona.tags?.includes(tag));
  }

  // Find an available name for a copy (e.g., "Name - Copy", "Name - Copy - 2", etc.)
  private _findAvailableCopyName(baseName: string): string {
    // Consider both active and archived names when finding available copy name
    const activeNames = Array.from(this.personas.values()).map(p => p.name);
    const archivedNames = Array.from(this.archivedPersonas.values()).map(p => p.name);
    const existingNames = new Set([...activeNames, ...archivedNames]);
    
    // Regex to find base name and potential copy number
    const copyRegex = /^(.*) - Copy(?: - (\d+))?$/;
    const baseMatch = baseName.match(copyRegex);
    const actualBaseName = baseMatch ? baseMatch[1] : baseName;

    let counter = 1;
    let copyName = '';

    while (true) {
      if (counter === 1) {
        copyName = `${actualBaseName} - Copy`;
      } else {
        copyName = `${actualBaseName} - Copy - ${counter}`;
      }

      if (!existingNames.has(copyName)) {
        return copyName;
      }

      counter++;
      // Safety break
      if (counter > 1000) { 
          throw new Error(`Could not find an available copy name for "${actualBaseName}" after 1000 attempts.`);
      }
    }
  }

  // Duplicate an existing persona by ID
  async duplicatePersona(originalId: string): Promise<Persona> {
    const originalPersona = this.getPersona(originalId);
    if (!originalPersona) {
      // Check archive too?
      const archived = this.archivedPersonas.get(originalId);
      if (archived) {
           throw new Error(`Cannot duplicate Persona with ID "${originalId}": it is archived.`);
      } else {
           throw new Error(`Persona with ID "${originalId}" not found.`);
      }
    }

    // Find an available name for the copy
    const newName = this._findAvailableCopyName(originalPersona.name);

    // Prepare input for the new persona
    const duplicateInput: CreatePersonaInput = {
      name: newName,
      description: originalPersona.description,
      instructions: originalPersona.instructions,
      tags: originalPersona.tags ? [...originalPersona.tags] : undefined, 
      settings: originalPersona.settings ? { ...originalPersona.settings } : undefined, 
    };

    // Pass the original ID to createPersona for the changelog
    const newPersona = await this.createPersona(duplicateInput, originalId);
    return newPersona;
  }

  // Update method uses Omit which correctly handles optional fields from Persona
  async updatePersona(id: string, updates: Partial<Omit<Persona, 'id' | 'createdAt' | 'updatedAt' | 'changelog'>>): Promise<Persona> {
    const persona = this.personas.get(id);

    if (!persona) {
      // Check if it's archived before declaring not found
      if (this.archivedPersonas.has(id)) {
          throw new Error(`Persona with ID "${id}" is archived and cannot be updated.`);
      } else {
          throw new Error(`Persona with ID "${id}" not found for update.`);
      }
    }

    // Check for name collision if name is being updated
    if (updates.name && updates.name !== persona.name) {
       const existingNames = Array.from(this.personas.values()).map(p => p.name);
       if (existingNames.includes(updates.name)) {
         throw new Error(`Persona with name "${updates.name}" already exists.`);
       }
    }

    // --- Changelog Generation --- 
    const changedFields: string[] = [];
    // Compare provided updates with existing values
    (Object.keys(updates) as Array<keyof typeof updates>).forEach(key => {
        // Simple comparison for primitive types & basic check for objects/arrays
        // A more robust deep comparison might be needed for detailed settings/tags logging
        if (persona[key] !== updates[key]) { 
             // Basic check for tags/settings arrays/objects - are they different references or values?
             // For now, just log if the key was in updates and potentially different.
             // We need a more robust check for deep equality if necessary.
            if (key === 'tags' || key === 'settings') {
                 // Quick JSON stringify comparison for structured data
                 if (JSON.stringify(persona[key]) !== JSON.stringify(updates[key])) {
                    changedFields.push(key);
                 }
            } else if (persona[key] !== updates[key]) {
                 changedFields.push(key);
            }
        }
    });
    
    const now = new Date().toISOString();
    const newChangelog = [...persona.changelog]; // Copy existing changelog

    if (changedFields.length > 0) {
        newChangelog.push({
            timestamp: now,
            action: 'updated',
            details: `Updated fields: ${changedFields.join(', ')}`
        });
    }
    // --- End Changelog Generation ---

    // Only update timestamp and save if actual changes were made
    if (changedFields.length > 0) {
        const updatedPersona: Persona = {
          ...persona, 
          ...updates, 
          id: persona.id, 
          createdAt: persona.createdAt, 
          updatedAt: now, // Use the timestamp from changelog generation
          changelog: newChangelog, 
        };
        // Update the map
        this.personas.set(id, updatedPersona);
        this.isDirty = true;
        this._debouncedSave();
        return updatedPersona; 
    } else {
        // No changes, return the original persona (no update to timestamp or log)
        return persona;
    }
  }

  // New method to archive a persona
  async archivePersona(id: string): Promise<boolean> {
    const personaToArchive = this.personas.get(id);
    if (!personaToArchive) {
      return false; // Not found in active personas
    }

    // --- Add Changelog Entry --- 
    const now = new Date().toISOString();
    // Explicitly define the new entry type to satisfy the compiler
    const archiveEntry: ChangelogEntry = { timestamp: now, action: 'archived' }; 
    const updatedChangelog = [
        ...personaToArchive.changelog, 
        archiveEntry // Add the correctly typed entry
    ];
    const archivedPersonaWithLog: Persona = {
        ...personaToArchive,
        changelog: updatedChangelog
    };
    // --- End Changelog Entry --- 

    // Add to archived map (with updated log)
    this.archivedPersonas.set(id, archivedPersonaWithLog);
    // Remove from active map
    this.personas.delete(id);
    
    this.isDirty = true;
    this._debouncedSave();

    return true;
  }

  // No change needed here, saves the map (keyed by ID)
  async flush(): Promise<void> {
    const stateToSave: PersonaStorageState = {
        active: this.personas,
        archived: this.archivedPersonas,
    };
    await this.storageDriver.save(stateToSave);
    this.isDirty = false; // Reset dirty flag after successful save
  }

  // Internal method that actually performs the save if conditions met
  private async _saveIfDirty(): Promise<void> {
    if (this.options.autoSaveEnabled && this.isDirty) {
      try {
        const stateToSave: PersonaStorageState = {
            active: this.personas,
            archived: this.archivedPersonas,
        };
        await this.storageDriver.save(stateToSave);
        this.isDirty = false; // Reset dirty flag only on successful auto-save
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }
  }

  // Call this method during cleanup/shutdown if needed
  public cancelPendingSave(): void {
    this._debouncedSave.cancel(); // Use lodash debounce cancel method
  }
} 