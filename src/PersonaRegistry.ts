import fs from 'fs';
import path from 'path';
import debounce from 'lodash/debounce'; // Import lodash debounce
import { DebouncedFunc } from 'lodash'; // Import DebouncedFunc type from main lodash types
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import { Persona, StorageDriver, CreatePersonaInput } from "./types"; // Import new types

export interface RegistryOptions {
  debounceSaveMs?: number;
  autoSaveEnabled?: boolean;
}

export class PersonaRegistry {
  private storageDriver: StorageDriver;
  // Use ID as the key now
  private personas: Map<string, Persona> = new Map(); // In-memory cache, keyed by ID
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
    // Driver now returns map keyed by ID
    this.personas = await this.storageDriver.load(); 
    this.isDirty = false; // Ensure clean state after initial load
  }

  // Use CreatePersonaInput, generate ID/timestamps, return full Persona
  async createPersona(input: CreatePersonaInput): Promise<Persona> {
    // TODO: Add check for duplicate persona name later (requires iterating values)
    const now = new Date().toISOString();
    const newPersona: Persona = {
      ...input,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    // Update cache first using ID
    this.personas.set(newPersona.id, newPersona);
    this.isDirty = true; // Mark as dirty

    // Trigger debounced save 
    this._debouncedSave();

    return newPersona; // Return the created persona object
  }

  listPersonas(): Persona[] {
    return Array.from(this.personas.values());
  }

  // Get by ID now
  getPersona(id: string): Persona | undefined {
    return this.personas.get(id);
  }

  // No change needed here, already iterates values
  findByTag(tag: string): Persona[] {
    const allPersonas = Array.from(this.personas.values());
    return allPersonas.filter(persona => persona.tags.includes(tag));
  }

  // No change needed here, saves the map (keyed by ID)
  async flush(): Promise<void> {
    await this.storageDriver.save(this.personas);
    this.isDirty = false; // Reset dirty flag after successful save
  }

  // Internal method that actually performs the save if conditions met
  private async _saveIfDirty(): Promise<void> {
    if (this.options.autoSaveEnabled && this.isDirty) {
      try {
        await this.storageDriver.save(this.personas);
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