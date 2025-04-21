import { PersonaRegistry, RegistryOptions } from '../src/PersonaRegistry';
import { Persona, StorageDriver, CreatePersonaInput, PersonaStorageState } from '../src/types';
import { jest } from '@jest/globals'; // Import Jest object for mocking

// Mock Storage Driver for testing Registry logic without real I/O
class MockStorageDriver implements StorageDriver {
  private activePersonas: Map<string, Persona> = new Map();
  private archivedPersonas: Map<string, Persona> = new Map();

  // Mock load to return both maps
  public load = jest.fn(async (): Promise<PersonaStorageState> => {
    return {
      active: new Map(this.activePersonas),
      archived: new Map(this.archivedPersonas)
    };
  });
  
  // Mock save to receive both maps
  public save = jest.fn(async (state: PersonaStorageState): Promise<void> => {
    this.activePersonas = new Map(state.active);
    this.archivedPersonas = new Map(state.archived);
  });

  // Helper to manually set initial state for load testing
  setState(initialState: Partial<PersonaStorageState>): void {
     this.activePersonas.clear();
     this.archivedPersonas.clear();
     initialState.active?.forEach((p, id) => this.activePersonas.set(id, p));
     initialState.archived?.forEach((p, id) => this.archivedPersonas.set(id, p));
  }

   // Helper to get the internal maps for assertions
  getActivePersonas(): Map<string, Persona> {
    return new Map(this.activePersonas); 
  }
  getArchivedPersonas(): Map<string, Persona> {
    return new Map(this.archivedPersonas);
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

  test('should be created using the static create method and load initial active/archived data', async () => {
    const initialActive: Persona = { 
      id: 'a1', name: 'ActiveLoader', description: 'Loads active', tags: [], 
      instructions: '', settings: {}, createdAt: 't1', updatedAt: 't1'
    };
     const initialArchived: Persona = { 
      id: 'ar1', name: 'ArchivedLoader', description: 'Loads archived', tags: [], 
      instructions: '', settings: {}, createdAt: 't0', updatedAt: 't0'
    };
    mockDriver.setState({ 
      active: new Map([[initialActive.id, initialActive]]),
      archived: new Map([[initialArchived.id, initialArchived]])
    });

    const newRegistry = await PersonaRegistry.create(mockDriver, baseOptions);
    expect(mockDriver.load).toHaveBeenCalledTimes(1);
    // Check active is loaded
    expect(newRegistry.getPersona('a1')).toEqual(initialActive);
    // Check archived is not accessible via getPersona
    expect(newRegistry.getPersona('ar1')).toBeUndefined(); 
    // Check list only returns active
    expect(newRegistry.listPersonas()).toEqual([initialActive]);
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

  test('createPersona should throw an error if name already exists in active personas', async () => {
    const input1: CreatePersonaInput = { 
      name: 'Duplicate Name Test', description: 'First', tags: [],
      instructions: 'Instructions 1', settings: {} 
    };
    await registry.createPersona(input1); 

    const input2: CreatePersonaInput = { 
      name: 'Duplicate Name Test', 
      description: 'Second', tags: [],
      instructions: 'Instructions 2', settings: {}
    };
    await expect(registry.createPersona(input2)).rejects.toThrow(
      'Persona with name "Duplicate Name Test" already exists.'
    );
    expect(registry.listPersonas()).toHaveLength(1);
  });

   test('listPersonas should return only active personas', async () => {
    const activePersona = await registry.createPersona({ name: 'P1', description: '', tags: [], instructions: '', settings: {} });
    // Manually add an archived one to the mock driver state for the *next* load
    const archivedPersona: Persona = { id: 'arch1', name: 'Archived', description: '', tags: [], instructions: '', settings: {}, createdAt: '', updatedAt: ''};
    mockDriver.setState({ 
        active: new Map([[activePersona.id, activePersona]]),
        archived: new Map([['arch1', archivedPersona]])
    });
    // Create a new registry to trigger load
    const registry2 = await PersonaRegistry.create(mockDriver);

    const list = registry2.listPersonas();
    expect(list).toHaveLength(1); 
    expect(list[0]).toEqual(activePersona);
  });

  test('getPersona should retrieve only active personas by ID', async () => {
    const activePersona = await registry.createPersona({ name: 'Get Me', description: '', tags: [], instructions: '', settings: {} });
     const archivedPersona: Persona = { id: 'arch1', name: 'Archived', description: '', tags: [], instructions: '', settings: {}, createdAt: '', updatedAt: ''};
    mockDriver.setState({ 
        active: new Map([[activePersona.id, activePersona]]),
        archived: new Map([['arch1', archivedPersona]])
    });
    const registry2 = await PersonaRegistry.create(mockDriver);

    const foundActive = registry2.getPersona(activePersona.id);
    expect(foundActive).toEqual(activePersona);
    const foundArchived = registry2.getPersona('arch1');
    expect(foundArchived).toBeUndefined();
  });

  test('getPersona should return undefined for non-existent ID', () => {
    const found = registry.getPersona('non-existent-id');
    expect(found).toBeUndefined();
  });

  test('findByTag should return only active personas containing the tag', async () => {
    const p1 = await registry.createPersona({ name: 'Active Tagged 1', description: '', tags: ['a', 'b'], instructions: '', settings: {} });
    const p2 = await registry.createPersona({ name: 'Active Tagged 2', description: '', tags: ['b', 'c'], instructions: '', settings: {} });
    // Manually add an archived one with tag 'b'
    const archivedPersona: Persona = { id: 'arch1', name: 'Archived B', description: '', tags: ['b'], instructions: '', settings: {}, createdAt: '', updatedAt: ''};
    mockDriver.setState({ 
        active: new Map([[p1.id, p1], [p2.id, p2]]),
        archived: new Map([['arch1', archivedPersona]])
    });
     const registry2 = await PersonaRegistry.create(mockDriver);

    const foundByB = registry2.findByTag('b');
    expect(foundByB).toHaveLength(2); // Should only find p1 and p2
    expect(foundByB).toEqual(expect.arrayContaining([p1, p2]));
  });

  test('flush should call storageDriver.save with current active and archived personas', async () => {
    const createdPersona = await registry.createPersona({ name: 'To Flush', description: '', tags: [], instructions: '', settings: {} });
    // Manually add an archived one
    const archivedPersona: Persona = { id: 'archFlush', name: 'Arch', description: '', tags: [], instructions: '', settings: {}, createdAt: '', updatedAt: ''};
    mockDriver.setState({ active: new Map([[createdPersona.id, createdPersona]]), archived: new Map([['archFlush', archivedPersona]]) });
    const registry2 = await PersonaRegistry.create(mockDriver); // Load state
    mockDriver.save.mockClear(); // Clear save call from create

    await registry2.flush();
    expect(mockDriver.save).toHaveBeenCalledTimes(1);

    // Verify the data passed to save
    const savedState = mockDriver.save.mock.calls[0][0] as PersonaStorageState;
    expect(savedState.active.size).toBe(1);
    expect(savedState.active.get(createdPersona.id)).toEqual(createdPersona);
    expect(savedState.archived.size).toBe(1);
    expect(savedState.archived.get('archFlush')).toEqual(archivedPersona);
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
      const savedState = mockDriver.save.mock.calls[0][0] as PersonaStorageState;
      expect(savedState.active.size).toBe(1);
      expect(savedState.active.get(p1.id)).toEqual(p1);
      expect(savedState.archived.size).toBe(0); // Ensure archived is empty
    });

    test('should coalesce multiple changes within the debounce period', async () => {
      const p1 = await registry.createPersona({ name: 'P1', description: '', tags: [], instructions: '', settings: {} });
      jest.advanceTimersByTime(50);
      const p2 = await registry.createPersona({ name: 'P2', description: '', tags: [], instructions: '', settings: {} });
      expect(mockDriver.save).not.toHaveBeenCalled(); // Should not have saved yet

      jest.advanceTimersByTime(100); // Advance past the debounce period of the *last* call
      await Promise.resolve(); 

      expect(mockDriver.save).toHaveBeenCalledTimes(1); // Only one save should occur
      const savedState = mockDriver.save.mock.calls[0][0] as PersonaStorageState;
      expect(savedState.active.size).toBe(2);
      expect(savedState.active.get(p1.id)).toEqual(p1);
      expect(savedState.active.get(p2.id)).toEqual(p2);
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

  // --- Duplicate Persona Tests --- 
  describe('duplicatePersona', () => {
    let originalPersona: Persona;

    beforeEach(async () => {
      // Create a base persona to duplicate in each test
      const input: CreatePersonaInput = {
        name: 'Original Persona',
        description: 'Base for duplication',
        instructions: 'Do original things',
        tags: ['original', 'test'],
        settings: { temperature: 0.5, model: 'gpt-base' },
      };
      originalPersona = await registry.createPersona(input);
      // Clear save mock calls after setup
      mockDriver.save.mockClear();
    });

    test('should create a new persona with a unique ID', async () => {
      const duplicate = await registry.duplicatePersona(originalPersona.id);
      expect(duplicate).toBeDefined();
      expect(duplicate.id).not.toBe(originalPersona.id);
      expect(typeof duplicate.id).toBe('string'); // Should be a UUID
    });

    test('should modify the name of the duplicated persona (e.g., "Name - Copy")', async () => {
      const duplicate = await registry.duplicatePersona(originalPersona.id);
      expect(duplicate.name).toBe(`${originalPersona.name} - Copy`);
    });

    test('should handle duplicate names when copying multiple times', async () => {
      // Add an archived persona with a conflicting name potential
      const archivedConflict: Persona = { id: 'archC', name: 'Original Persona - Copy - 2', description: '', tags: [], instructions: '', settings: {}, createdAt: '', updatedAt: '' };
      mockDriver.setState({ archived: new Map([['archC', archivedConflict]]) });
      registry = await PersonaRegistry.create(mockDriver, baseOptions); // Recreate registry to load archived

      const originalPersona = await registry.createPersona({ name: 'Original Persona', description: '', tags: [], instructions: '', settings: {} });
      
      const duplicate1 = await registry.duplicatePersona(originalPersona.id);
      expect(duplicate1.name).toBe('Original Persona - Copy');

      // Duplicate the *first* copy - should skip "Copy - 2" because it exists in archive
      const duplicate2 = await registry.duplicatePersona(duplicate1.id);
      expect(duplicate2.name).toBe('Original Persona - Copy - 3'); 
    });

    test('should copy description, instructions, tags, and settings', async () => {
      const duplicate = await registry.duplicatePersona(originalPersona.id);
      expect(duplicate.description).toBe(originalPersona.description);
      expect(duplicate.instructions).toBe(originalPersona.instructions);
      expect(duplicate.tags).toEqual(originalPersona.tags); // Deep equality for array
      expect(duplicate.tags).not.toBe(originalPersona.tags); // Should be a copy, not same reference
      expect(duplicate.settings).toEqual(originalPersona.settings); // Deep equality for object
      expect(duplicate.settings).not.toBe(originalPersona.settings); // Should be a copy
    });

    test('should set new createdAt and updatedAt timestamps', async () => {
      const duplicate = await registry.duplicatePersona(originalPersona.id);
      // Remove brittle checks - too fast execution can cause same timestamp
      // expect(duplicate.createdAt).not.toBe(originalPersona.createdAt);
      // expect(duplicate.updatedAt).not.toBe(originalPersona.updatedAt);
      
      // These checks are sufficient
      expect(Date.parse(duplicate.createdAt)).toBeGreaterThanOrEqual(Date.parse(originalPersona.createdAt));
      expect(Date.parse(duplicate.updatedAt)).toBeGreaterThanOrEqual(Date.parse(originalPersona.updatedAt));
    });

    test('should add the new persona to the registry', async () => {
      const duplicate = await registry.duplicatePersona(originalPersona.id);
      const retrieved = registry.getPersona(duplicate.id);
      expect(retrieved).toEqual(duplicate);
      expect(registry.listPersonas()).toHaveLength(2); // Original + Duplicate
    });

    test('should throw an error if the original persona ID does not exist', async () => {
      await expect(registry.duplicatePersona('non-existent-id')).rejects.toThrow(
        'Persona with ID "non-existent-id" not found.'
      );
    });

     test('should trigger a debounced save', async () => {
      jest.useFakeTimers(); // Need fake timers for debounce check
      registry = await PersonaRegistry.create(mockDriver, { autoSaveEnabled: true, debounceSaveMs: 100 });
      originalPersona = await registry.createPersona({ name: 'Original', description:'', instructions:'', settings:{}, tags:[]});
      mockDriver.save.mockClear();

      await registry.duplicatePersona(originalPersona.id);
      expect(mockDriver.save).not.toHaveBeenCalled(); // Should not save immediately
      jest.advanceTimersByTime(100);
      await Promise.resolve(); // Allow promises to resolve
      expect(mockDriver.save).toHaveBeenCalledTimes(1);
      jest.useRealTimers(); // Restore real timers
    });

    test('should throw an error if the original persona ID is archived', async () => {
         const archivedPersona: Persona = { id: 'archDup', name: 'ArchivedToDup', description: '', tags: [], instructions: '', settings: {}, createdAt: '', updatedAt: '' };
         mockDriver.setState({ archived: new Map([['archDup', archivedPersona]]) });
         registry = await PersonaRegistry.create(mockDriver, baseOptions); // Recreate
         await expect(registry.duplicatePersona('archDup')).rejects.toThrow(
             'Cannot duplicate Persona with ID "archDup": it is archived.'
         );
    });

  });

  // --- Archive Persona Tests --- 
  describe('archivePersona', () => {
     let personaToArchive: Persona;

    beforeEach(async () => {
      personaToArchive = await registry.createPersona({ 
        name: 'Archive Me', description: 'Will be archived', 
        tags: ['archive'], instructions: '', settings: {}
      });
      mockDriver.save.mockClear(); // Clear save from create
    });

    test('should move persona from active to archived map', async () => {
      const result = await registry.archivePersona(personaToArchive.id);
      expect(result).toBe(true);
      expect(registry.getPersona(personaToArchive.id)).toBeUndefined(); // Not in active
      expect(registry.listPersonas()).toHaveLength(0);
      
      // Check mock driver state (after save potentially completes)
      // We need to check the *intended* state passed to save, as save is debounced
      await registry.flush(); // Force save for checking
      expect(mockDriver.getActivePersonas().has(personaToArchive.id)).toBe(false);
      expect(mockDriver.getArchivedPersonas().has(personaToArchive.id)).toBe(true);
      expect(mockDriver.getArchivedPersonas().get(personaToArchive.id)).toEqual(personaToArchive);
    });

    test('should return false if persona ID does not exist', async () => {
      const result = await registry.archivePersona('non-existent-id');
      expect(result).toBe(false);
    });

    test('should trigger a debounced save', async () => {
      jest.useFakeTimers();
      registry = await PersonaRegistry.create(mockDriver, { autoSaveEnabled: true, debounceSaveMs: 100 });
      personaToArchive = await registry.createPersona({ name: 'Archive Me Debounce', description: '', tags: [], instructions: '', settings: {} });
      mockDriver.save.mockClear();

      await registry.archivePersona(personaToArchive.id);
      expect(mockDriver.save).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(mockDriver.save).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  // --- Update Persona Tests --- 
  describe('updatePersona', () => {
    let personaToUpdate: Persona;

    beforeEach(async () => {
      // Create a base persona to update
      personaToUpdate = await registry.createPersona({
        name: 'UpdateMe', description: 'Initial Desc', instructions: 'Initial Inst',
        tags: ['initial', 'update'], settings: { temp: 0.5, keep: true }
      });
      mockDriver.save.mockClear(); // Clear save from create
    });

    test('should update specified fields and return the updated persona', async () => {
      const updates: Partial<Persona> = {
        name: 'UpdateMe - Updated',
        description: 'Updated Desc',
        tags: ['updated'], // Overwrite tags
        settings: { temp: 0.8, new_field: 'added' } // Overwrite settings
      };
      const updatedPersona = await registry.updatePersona(personaToUpdate.id, updates);

      expect(updatedPersona).toBeDefined();
      expect(updatedPersona.id).toBe(personaToUpdate.id);
      expect(updatedPersona.name).toBe('UpdateMe - Updated');
      expect(updatedPersona.description).toBe('Updated Desc');
      expect(updatedPersona.instructions).toBe('Initial Inst'); // Should remain unchanged
      expect(updatedPersona.tags).toEqual(['updated']);
      expect(updatedPersona.settings).toEqual({ temp: 0.8, new_field: 'added' });
      expect(updatedPersona.createdAt).toBe(personaToUpdate.createdAt); // Should not change
      // Check updatedAt is greater than or equal, allowing for very fast execution
      expect(Date.parse(updatedPersona.updatedAt)).toBeGreaterThanOrEqual(Date.parse(personaToUpdate.updatedAt)); 
      // Also check it's not the exact same object reference if the time hasn't changed
      if (Date.parse(updatedPersona.updatedAt) === Date.parse(personaToUpdate.updatedAt)) {
           expect(updatedPersona.updatedAt).toBe(personaToUpdate.updatedAt); // Should be same if time is identical
      } else {
           expect(updatedPersona.updatedAt).not.toBe(personaToUpdate.updatedAt); // Should be different otherwise
      }

      // Verify internal state reflects the update
      const retrieved = registry.getPersona(personaToUpdate.id);
      expect(retrieved).toEqual(updatedPersona);
    });

    test('should only update fields provided in the partial update object', async () => {
      const updates: Partial<Persona> = { description: 'Only Desc Updated' };
      const updatedPersona = await registry.updatePersona(personaToUpdate.id, updates);

      expect(updatedPersona.name).toBe('UpdateMe'); // Unchanged
      expect(updatedPersona.description).toBe('Only Desc Updated');
      expect(updatedPersona.tags).toEqual(['initial', 'update']); // Unchanged
      expect(updatedPersona.settings).toEqual({ temp: 0.5, keep: true }); // Unchanged
    });

    test('should throw an error if trying to update name to one that already exists', async () => {
      // Create another persona
      await registry.createPersona({ name: 'Existing Name', description: '', instructions: '', tags: [], settings: {} });
      
      const updates: Partial<Persona> = { name: 'Existing Name' };
      await expect(registry.updatePersona(personaToUpdate.id, updates)).rejects.toThrow(
        'Persona with name "Existing Name" already exists.'
      );
      // Ensure original persona was not modified
      const retrieved = registry.getPersona(personaToUpdate.id);
      expect(retrieved?.name).toBe(personaToUpdate.name); 
    });

    test('should allow updating name to its current value (no change)', async () => {
      const updates: Partial<Persona> = { name: personaToUpdate.name };
      const originalUpdatedAt = personaToUpdate.updatedAt;
      await expect(registry.updatePersona(personaToUpdate.id, updates)).resolves.toBeDefined();
      const retrieved = registry.getPersona(personaToUpdate.id);
      // Even though name didn't change, updatedAt should still update
      expect(Date.parse(retrieved!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(originalUpdatedAt)); 
    });

    test('should throw an error if persona ID does not exist', async () => {
      await expect(registry.updatePersona('non-existent-id', { name: 'WontWork' })).rejects.toThrow(
        'Persona with ID "non-existent-id" not found for update.'
      );
    });

    test('should throw an error if trying to update an archived persona', async () => {
       // Set up an archived persona directly in the mock driver for this test
       const archivedId = 'archived-update-test';
       const archivedPersona: Persona = { 
           id: archivedId, name: 'ArchivedToUpdate', description: '', tags: [], 
           instructions: '', settings: {}, createdAt: 't0', updatedAt: 't0'
       };
       mockDriver.setState({ archived: new Map([[archivedId, archivedPersona]]) });
       registry = await PersonaRegistry.create(mockDriver, baseOptions); // Recreate registry to load state

       await expect(registry.updatePersona(archivedId, { name: 'WontWorkArchived' })).rejects.toThrow(
         `Persona with ID "${archivedId}" is archived and cannot be updated.`
       );
    });

    test('should trigger a debounced save when autoSave is enabled', async () => {
      jest.useFakeTimers();
      // Need to recreate registry with autoSave enabled for this test
      registry = await PersonaRegistry.create(mockDriver, { autoSaveEnabled: true, debounceSaveMs: 100 });
      personaToUpdate = await registry.createPersona({ name: 'Update Debounce', description: '', instructions: '', tags: [], settings: {} });
      mockDriver.save.mockClear(); // Clear save from this create call

      await registry.updatePersona(personaToUpdate.id, { description: 'Updated Desc Debounce' });
      expect(mockDriver.save).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      await Promise.resolve(); // Allow promises to resolve
      expect(mockDriver.save).toHaveBeenCalledTimes(1);
      jest.useRealTimers(); // Restore real timers
    });

     test('should not allow updating id, createdAt directly via updates object', async () => {
         const originalId = personaToUpdate.id;
         const originalCreatedAt = personaToUpdate.createdAt;
         const originalUpdatedAt = personaToUpdate.updatedAt;
         // Cast to any to bypass TS check, simulating bad input
         const updates: any = { 
             id: 'new-id', 
             createdAt: new Date(0).toISOString(), // Attempt to change
             updatedAt: new Date(0).toISOString(), // Attempt to change this too (should be ignored)
             name: 'NameChanged', // Include a valid change
         };
         const updatedPersona = await registry.updatePersona(originalId, updates);

         expect(updatedPersona.id).toBe(originalId); // ID must not change
         expect(updatedPersona.createdAt).toBe(originalCreatedAt); // createdAt must not change
         expect(updatedPersona.name).toBe('NameChanged'); // Name should change
         // updatedAt should update, but not to the value we tried to force
         expect(updatedPersona.updatedAt).not.toBe(updates.updatedAt);
         expect(Date.parse(updatedPersona.updatedAt)).toBeGreaterThanOrEqual(Date.parse(originalUpdatedAt));
    });

  });

}); 