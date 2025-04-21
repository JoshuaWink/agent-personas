import fs from 'fs/promises'; // Use promises API
import path from 'path';
import os from 'os';
import { JsonStorageDriver } from '../src/drivers/JsonStorageDriver';
import { Persona, PersonaStorageState } from '../src/types'; // Import state type
import { v4 as uuidv4 } from 'uuid'; // Import uuid for creating test data

// Structure expected in the JSON file
interface JsonFileStructure {
  active: Persona[];
  archived: Persona[];
}

describe('JsonStorageDriver', () => {
  let tempDir: string;
  let testFilePath: string;
  let driver: JsonStorageDriver;

  // Helper function to create a valid Persona object for tests
  const createTestPersona = (name: string, tags: string[] = [], idSuffix: string = ''): Persona => ({
    id: uuidv4() + idSuffix,
    name,
    description: `Description for ${name}`,
    instructions: `Instructions for ${name}`,
    tags,
    settings: { temperature: Math.random() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  beforeEach(async () => {
    // Create a unique temporary directory for each test to ensure isolation
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'json-driver-tests-'));
    testFilePath = path.join(tempDir, 'test-personas.json');
    driver = new JsonStorageDriver(testFilePath);
  });

  afterEach(async () => {
    // Clean up the temporary directory and file after each test
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err: any) { // Add type annotation
        console.warn(`Minor error during cleanup: ${err.message}`);
      }
    }
  });

  test('constructor should throw if no file path is provided', () => {
    expect(() => new JsonStorageDriver('')).toThrow('JsonStorageDriver requires a file path.');
    // @ts-expect-error - Testing invalid input
    expect(() => new JsonStorageDriver(null)).toThrow();
     // @ts-expect-error - Testing invalid input
    expect(() => new JsonStorageDriver(undefined)).toThrow();
  });

  test('save should write active and archived arrays to the JSON file', async () => {
    const personaA1 = createTestPersona('Active1');
    const personaA2 = createTestPersona('Active2');
    const personaR1 = createTestPersona('Archived1');
    
    const state: PersonaStorageState = {
        active: new Map([[personaA1.id, personaA1], [personaA2.id, personaA2]]),
        archived: new Map([[personaR1.id, personaR1]])
    };

    await driver.save(state);

    // Verify file content
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    const savedData = JSON.parse(fileContent) as JsonFileStructure;

    expect(savedData).toHaveProperty('active');
    expect(savedData).toHaveProperty('archived');
    expect(Array.isArray(savedData.active)).toBe(true);
    expect(Array.isArray(savedData.archived)).toBe(true);
    expect(savedData.active).toHaveLength(2);
    expect(savedData.archived).toHaveLength(1);
    expect(savedData.active).toEqual(expect.arrayContaining([personaA1, personaA2]));
    expect(savedData.archived).toEqual([personaR1]);
  });

  test('save should handle empty active or archived maps', async () => {
    const personaA1 = createTestPersona('ActiveOnly');
    let state: PersonaStorageState = {
        active: new Map([[personaA1.id, personaA1]]),
        archived: new Map()
    };
    await driver.save(state);
    let savedData = JSON.parse(await fs.readFile(testFilePath, 'utf-8')) as JsonFileStructure;
    expect(savedData.active).toHaveLength(1);
    expect(savedData.archived).toHaveLength(0);

    const personaR1 = createTestPersona('ArchivedOnly');
    state = {
        active: new Map(),
        archived: new Map([[personaR1.id, personaR1]])
    };
    await driver.save(state);
    savedData = JSON.parse(await fs.readFile(testFilePath, 'utf-8')) as JsonFileStructure;
    expect(savedData.active).toHaveLength(0);
    expect(savedData.archived).toHaveLength(1);
  });

  test('save should create the directory if it does not exist', async () => {
    const deepDirPath = path.join(tempDir, 'some', 'nested', 'dir');
    const deepFilePath = path.join(deepDirPath, 'deep-test.json');
    const deepDriver = new JsonStorageDriver(deepFilePath);
    const persona = createTestPersona('Deep');
    const stateToSave: PersonaStorageState = {
        active: new Map([[persona.id, persona]]),
        archived: new Map()
    };

    await deepDriver.save(stateToSave);

    // Check if file exists (implicitly checks if dir was created)
    await expect(fs.access(deepFilePath)).resolves.toBeUndefined(); 
    const fileContent = await fs.readFile(deepFilePath, 'utf-8');
    const savedData = JSON.parse(fileContent);
    expect(savedData.active).toEqual([persona]);
    expect(savedData.archived).toEqual([]);
  });

  test('load should read active and archived arrays and return PersonaStorageState', async () => {
    const personaA1 = createTestPersona('LoadActive1');
    const personaR1 = createTestPersona('LoadArchived1');
    const fileData: JsonFileStructure = {
      active: [personaA1],
      archived: [personaR1]
    };
    await fs.writeFile(testFilePath, JSON.stringify(fileData, null, 2), 'utf-8');

    const loadedState = await driver.load();

    expect(loadedState).toHaveProperty('active');
    expect(loadedState).toHaveProperty('archived');
    expect(loadedState.active).toBeInstanceOf(Map);
    expect(loadedState.archived).toBeInstanceOf(Map);
    expect(loadedState.active.size).toBe(1);
    expect(loadedState.archived.size).toBe(1);
    expect(loadedState.active.get(personaA1.id)).toEqual(personaA1);
    expect(loadedState.archived.get(personaR1.id)).toEqual(personaR1);
  });

  test('load should return empty maps if the file does not exist', async () => {
    const loadedState = await driver.load();
    expect(loadedState.active.size).toBe(0);
    expect(loadedState.archived.size).toBe(0);
  });

  test('load should return empty maps for an empty file', async () => {
    await fs.writeFile(testFilePath, '', 'utf-8'); 
    const loadedState = await driver.load();
    expect(loadedState.active.size).toBe(0);
    expect(loadedState.archived.size).toBe(0);
  });

  test('load should handle invalid JSON content gracefully and return empty maps', async () => {
    await fs.writeFile(testFilePath, 'this is not json', 'utf-8');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const loadedState = await driver.load();
    expect(loadedState.active.size).toBe(0);
    expect(loadedState.archived.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON found'));
    warnSpy.mockRestore();
  });

   test('load should handle JSON that is not the expected object structure', async () => {
    await fs.writeFile(testFilePath, '[{"id": "a", "name": "wrong"}] ', 'utf-8'); // Save an array instead of object
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const loadedState = await driver.load();
    expect(loadedState.active.size).toBe(0);
    expect(loadedState.archived.size).toBe(0);
    // No warning expected here, just default state
    // expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid data format loaded'));
    warnSpy.mockRestore();
  });

   test('load should handle object structure missing active/archived keys', async () => {
    await fs.writeFile(testFilePath, '{"other": []}', 'utf-8'); 
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const loadedState = await driver.load();
    // _arrayToMap will get undefined, return empty map, which is correct default
    expect(loadedState.active.size).toBe(0);
    expect(loadedState.archived.size).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled(); // No warning needed if keys missing, just default
    warnSpy.mockRestore();
  });

   test('load should skip persona objects without an ID during loading in both arrays', async () => {
     const personaA1 = createTestPersona('GoodActive');
     const badPersonaA = { name: 'BadActive' };
     const personaR1 = createTestPersona('GoodArchived');
     const badPersonaR = { name: 'BadArchived' };
     const fileData: JsonFileStructure = {
         active: [personaA1, badPersonaA as any],
         archived: [personaR1, badPersonaR as any]
     };
     await fs.writeFile(testFilePath, JSON.stringify(fileData, null, 2), 'utf-8');
     const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

     const loadedState = await driver.load();

     expect(loadedState.active.size).toBe(1);
     expect(loadedState.active.has(personaA1.id)).toBe(true);
     expect(loadedState.archived.size).toBe(1);
     expect(loadedState.archived.has(personaR1.id)).toBe(true);
     expect(warnSpy).toHaveBeenCalledTimes(2); // One for each bad persona
     expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid persona object'), badPersonaA);
     expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid persona object'), badPersonaR);
     warnSpy.mockRestore();
  });

  // Add test for save throwing error if write fails?
  // test('save should throw an error if writing fails', async () => { ... });
}); 