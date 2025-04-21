import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PersonaRegistry } from '../src/PersonaRegistry';
import { JsonStorageDriver } from '../src/drivers/JsonStorageDriver';
import { Persona, CreatePersonaInput } from '../src/types';

describe('PersonaRegistry Integration Test with JsonStorageDriver', () => {
  let tempDir: string;
  let storagePath: string;
  let registry: PersonaRegistry;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persona-registry-tests-'));
    storagePath = path.join(tempDir, `test-personas.json`);
    // console.log(`Using temp storage: ${storagePath}`); // Optional: for debugging

    // Initialize registry with JsonStorageDriver pointing to the temp file
    const storageDriver = new JsonStorageDriver(storagePath);
    registry = await PersonaRegistry.create(storageDriver, { autoSaveEnabled: false }); // Disable autoSave for predictable flush
  });

  afterEach(async () => {
    // Clean up the temporary directory and file after each test
    registry?.cancelPendingSave(); // Use optional chaining in case creation failed

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      // console.log(`Cleaned up temp storage: ${tempDir}`); // Optional: for debugging
    }
  });

  test('should create, save, load, get, and list personas using JsonStorageDriver', async () => {
    // 1. Create a persona in the first registry instance
    const personaInput1: CreatePersonaInput = {
      name: 'Integration Tester',
      description: 'Tests integration',
      instructions: 'Test thoroughly',
      tags: ['integration', 'test'],
      settings: { temperature: 0.5 },
    };
    const createdPersona1 = await registry.createPersona(personaInput1);
    expect(createdPersona1.id).toBeDefined();
    expect(createdPersona1.name).toBe(personaInput1.name);
    expect(createdPersona1.instructions).toBe(personaInput1.instructions);
    expect(createdPersona1.settings).toEqual(personaInput1.settings);

    // 2. Flush data to disk
    await registry.flush();

    // 3. Verify file content (should be an array)
    const fileContent = await fs.readFile(storagePath, 'utf-8');
    const parsedContent = JSON.parse(fileContent);
    expect(Array.isArray(parsedContent)).toBe(true);
    expect(parsedContent).toHaveLength(1);
    // Find the persona in the array (order not guaranteed, though likely stable)
    const savedPersonaData = parsedContent.find((p: Persona) => p.id === createdPersona1.id);
    expect(savedPersonaData).toBeDefined();
    // Compare the saved data with the created persona object
    expect(savedPersonaData).toEqual(createdPersona1);

    // 4. Create a new registry instance pointing to the same file
    const storageDriver2 = new JsonStorageDriver(storagePath);
    const registry2 = await PersonaRegistry.create(storageDriver2);

    // 5. Verify data in the second registry instance
    const loadedPersona = registry2.getPersona(createdPersona1.id);
    expect(loadedPersona).toBeDefined();
    expect(loadedPersona).toEqual(createdPersona1); // Check full object equality

    const allPersonas = registry2.listPersonas();
    expect(allPersonas).toHaveLength(1);
    expect(allPersonas[0]).toEqual(createdPersona1);
  });

  test('should find personas by tag using JsonStorageDriver', async () => {
    // 1. Create multiple personas with different tags
    const personaInput1: CreatePersonaInput = {
      name: 'Tester Alpha',
      description: 'Alpha test',
      instructions: 'Test A',
      tags: ['integration', 'alpha'],
      settings: {},
    };
     const personaInput2: CreatePersonaInput = {
      name: 'Tester Beta',
      description: 'Beta test',
      instructions: 'Test B',
      tags: ['integration', 'beta'],
      settings: {},
    };
     const personaInput3: CreatePersonaInput = {
      name: 'Tester Gamma',
      description: 'Gamma test',
      instructions: 'Test G',
      tags: ['gamma', 'test'], // Does not have 'integration' tag
      settings: {},
    };

    // Create personas and store returned objects
    const createdPersona1 = await registry.createPersona(personaInput1);
    const createdPersona2 = await registry.createPersona(personaInput2);
    const createdPersona3 = await registry.createPersona(personaInput3);

    // 2. Flush data to disk
    await registry.flush();

    // 3. Create a new registry instance and load data
    const storageDriver2 = new JsonStorageDriver(storagePath);
    const registry2 = await PersonaRegistry.create(storageDriver2);

    // 4. Find personas by tag 'integration'
    const integrationPersonas = registry2.findByTag('integration');
    expect(integrationPersonas).toHaveLength(2);
    // Use arrayContaining because order isn't guaranteed
    expect(integrationPersonas).toEqual(expect.arrayContaining([createdPersona1, createdPersona2]));
    // Ensure the third persona isn't included
    expect(integrationPersonas).not.toEqual(expect.arrayContaining([createdPersona3]));

     // 5. Find personas by tag 'beta'
    const betaPersonas = registry2.findByTag('beta');
    expect(betaPersonas).toHaveLength(1);
    expect(betaPersonas[0]).toEqual(createdPersona2);

     // 6. Find personas by a non-existent tag
    const nonExistentTagPersonas = registry2.findByTag('nonexistent');
    expect(nonExistentTagPersonas).toHaveLength(0);
  });

});