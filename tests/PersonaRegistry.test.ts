import { PersonaRegistry, RegistryOptions } from '../src/PersonaRegistry';
import { Persona, StorageDriver, CreatePersonaInput } from '../src/types';
import { jest } from '@jest/globals'; // Import Jest object for mocking

// Mock Storage Driver for testing Registry logic without real I/O
class MockStorageDriver implements StorageDriver {
  private personas: Map<string, Persona> = new Map(); // Store by ID now
  public load = jest.fn(async (): Promise<Map<string, Persona>> => {
    // Return a copy to avoid modifying the internal state directly from tests
    return new Map(this.personas);
  });
  public save = jest.fn(async (personasToSave: Map<string, Persona>): Promise<void> => {
    // Simulate saving by updating the internal map
    this.personas = new Map(personasToSave);
  });

  // Helper to manually set personas for load testing
  setPersonas(personas: Persona[]): void {
    this.personas.clear();
    personas.forEach(p => this.personas.set(p.id, p));
  }

   // Helper to get the internal map for assertions
  getSavedPersonas(): Map<string, Persona> {
    return new Map(this.personas); // Return a copy
  }
}

describe('PersonaRegistry', () => {
  let mockDriver: MockStorageDriver;
  let registry: PersonaRegistry;
  const baseOptions: RegistryOptions = { autoSaveEnabled: false }; // Disable auto-save for most tests

  beforeEach(async () => {
    mockDriver = new MockStorageDriver();
    // Use the static create method for registry instantiation
    registry = await PersonaRegistry.create(mockDriver, baseOptions);
    // Clear mock function calls between tests
    mockDriver.load.mockClear();
    mockDriver.save.mockClear();
  });

  test('should be created using the static create method and load initial data', async () => {
    const initialPersona: Persona = { 
      id: '1', name: 'Loader', description: 'Loads data', tags: [], 
      instructions: '', settings: {}, createdAt: 't1', updatedAt: 't1'
    };
    mockDriver.setPersonas([initialPersona]);

    const newRegistry = await PersonaRegistry.create(mockDriver, baseOptions);
    expect(mockDriver.load).toHaveBeenCalledTimes(1);
    expect(newRegistry.getPersona('1')).toEqual(initialPersona);
  });

  test('createPersona should add a new persona, return it, and mark dirty', async () => {
    const input: CreatePersonaInput = { 
      name: 'Test Persona', description: 'A test persona', tags: ['test'],
      instructions: 'Test instructions', settings: { temp: 1 } 
    };

    const createdPersona = await registry.createPersona(input);

    // Check returned persona has generated fields
    expect(createdPersona.id).toBeDefined();
    expect(createdPersona.createdAt).toBeDefined();
    expect(createdPersona.updatedAt).toBeDefined();
    expect(createdPersona.name).toBe(input.name);
    expect(createdPersona.instructions).toBe(input.instructions);

    // Check internal state
    const retrievedPersona = registry.getPersona(createdPersona.id);
    expect(retrievedPersona).toEqual(createdPersona); // Should exist in registry
    // TODO: Add test for isDirty flag if we re-introduce it or need explicit check

    // Check if save was *not* called immediately (due to autoSave: false)
    expect(mockDriver.save).not.toHaveBeenCalled();
  });

   test('listPersonas should return all personas from the cache', async () => {
    const input1: CreatePersonaInput = { name: 'P1', description: '', tags: [], instructions: '', settings: {} };
    const input2: CreatePersonaInput = { name: 'P2', description: '', tags: [], instructions: '', settings: {} };
    const persona1 = await registry.createPersona(input1);
    const persona2 = await registry.createPersona(input2);

    const list = registry.listPersonas();
    expect(list).toHaveLength(2);
    expect(list).toEqual(expect.arrayContaining([persona1, persona2]));
  });

  test('getPersona should retrieve a persona by ID', async () => {
    const input: CreatePersonaInput = { name: 'Get Me', description: '', tags: [], instructions: '', settings: {} };
    const createdPersona = await registry.createPersona(input);

    const found = registry.getPersona(createdPersona.id);
    expect(found).toEqual(createdPersona);
  });

  test('getPersona should return undefined for non-existent ID', () => {
    const found = registry.getPersona('non-existent-id');
    expect(found).toBeUndefined();
  });

  test('findByTag should return personas containing the specified tag', async () => {
    const p1 = await registry.createPersona({ name: 'Tagged 1', description: '', tags: ['a', 'b'], instructions: '', settings: {} });
    const p2 = await registry.createPersona({ name: 'Tagged 2', description: '', tags: ['b', 'c'], instructions: '', settings: {} });
    await registry.createPersona({ name: 'Untagged', description: '', tags: ['d'], instructions: '', settings: {} });

    const foundByB = registry.findByTag('b');
    expect(foundByB).toHaveLength(2);
    expect(foundByB).toEqual(expect.arrayContaining([p1, p2]));

    const foundByA = registry.findByTag('a');
    expect(foundByA).toHaveLength(1);
    expect(foundByA[0]).toEqual(p1);

    const foundByZ = registry.findByTag('z');
    expect(foundByZ).toHaveLength(0);
  });

  test('flush should call storageDriver.save with current personas', async () => {
    const input: CreatePersonaInput = { name: 'To Flush', description: '', tags: [], instructions: '', settings: {} };
    const createdPersona = await registry.createPersona(input);

    expect(mockDriver.save).not.toHaveBeenCalled(); // Should not have saved yet
    await registry.flush();
    expect(mockDriver.save).toHaveBeenCalledTimes(1);

    // Verify the data passed to save
    const savedMap = mockDriver.save.mock.calls[0][0] as Map<string, Persona>; // Get the arg passed to save
    expect(savedMap.size).toBe(1);
    expect(savedMap.get(createdPersona.id)).toEqual(createdPersona);
    
    // Check internal map state too
    const internalMap = mockDriver.getSavedPersonas();
    expect(internalMap.size).toBe(1);
    expect(internalMap.get(createdPersona.id)).toEqual(createdPersona);
  });

  // --- Debounced Auto-Save Tests --- 
  describe('Debounced Auto-Save', () => {
    jest.useFakeTimers(); // Use Jest fake timers for debounce tests

    beforeEach(async () => {
       // Re-create registry for each debounce test with autoSave enabled
       mockDriver = new MockStorageDriver(); 
       registry = await PersonaRegistry.create(mockDriver, { 
         autoSaveEnabled: true, 
         debounceSaveMs: 100 // Use short delay for testing
       });
       mockDriver.load.mockClear();
       mockDriver.save.mockClear();
    });

    afterEach(() => {
       registry.cancelPendingSave(); // Ensure timer is cancelled after test
       jest.clearAllTimers(); // Clear any pending timers
    });

    test('should not save immediately when autoSave is enabled', async () => {
       await registry.createPersona({ name: 'P1', description: '', tags: [], instructions: '', settings: {} });
       expect(mockDriver.save).not.toHaveBeenCalled();
    });

    test('should save after the debounce delay', async () => {
      const p1 = await registry.createPersona({ name: 'P1', description: '', tags: [], instructions: '', settings: {} });
      expect(mockDriver.save).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100); // Advance time past the debounce threshold
      // Need to yield control for the async save operation to complete
      await Promise.resolve(); 

      expect(mockDriver.save).toHaveBeenCalledTimes(1);
      const savedMap = mockDriver.save.mock.calls[0][0] as Map<string, Persona>; 
      expect(savedMap.size).toBe(1);
      expect(savedMap.get(p1.id)).toEqual(p1);
    });

    test('should coalesce multiple changes within the debounce period', async () => {
      const p1 = await registry.createPersona({ name: 'P1', description: '', tags: [], instructions: '', settings: {} });
      jest.advanceTimersByTime(50);
      const p2 = await registry.createPersona({ name: 'P2', description: '', tags: [], instructions: '', settings: {} });
      expect(mockDriver.save).not.toHaveBeenCalled(); // Should not have saved yet

      jest.advanceTimersByTime(100); // Advance past the debounce period of the *last* call
      await Promise.resolve(); 

      expect(mockDriver.save).toHaveBeenCalledTimes(1); // Only one save should occur
      const savedMap = mockDriver.save.mock.calls[0][0] as Map<string, Persona>; 
      expect(savedMap.size).toBe(2);
      expect(savedMap.get(p1.id)).toEqual(p1);
      expect(savedMap.get(p2.id)).toEqual(p2);
    });

    test('should not save if autoSaveEnabled is false', async () => {
       registry = await PersonaRegistry.create(mockDriver, { 
         autoSaveEnabled: false, 
         debounceSaveMs: 100 
       });
       await registry.createPersona({ name: 'P1', description: '', tags: [], instructions: '', settings: {} });
       
       jest.advanceTimersByTime(100);
       await Promise.resolve();

       expect(mockDriver.save).not.toHaveBeenCalled();
    });

     test('flush should save immediately even if autoSave is enabled', async () => {
      await registry.createPersona({ name: 'P1', description: '', tags: [], instructions: '', settings: {} });
      expect(mockDriver.save).not.toHaveBeenCalled(); // Not saved yet

      await registry.flush(); // Explicit save
      expect(mockDriver.save).toHaveBeenCalledTimes(1);

      // Should cancel any pending debounced save
      jest.advanceTimersByTime(100);
      await Promise.resolve(); 
      expect(mockDriver.save).toHaveBeenCalledTimes(1); // Still only called once
    });

    test('cancelPendingSave should prevent a scheduled save', async () => {
      await registry.createPersona({ name: 'P1', description: '', tags: [], instructions: '', settings: {} });
      expect(mockDriver.save).not.toHaveBeenCalled();

      registry.cancelPendingSave(); // Cancel before timer fires

      jest.advanceTimersByTime(100); // Advance time
      await Promise.resolve(); 

      expect(mockDriver.save).not.toHaveBeenCalled(); // Save should have been cancelled
    });
  });
}); 