import fs from 'fs/promises'; // Use promises API
import path from 'path';
import os from 'os';
import { JsonStorageDriver } from '../src/drivers/JsonStorageDriver';
import { Persona } from '../src/types';
import { v4 as uuidv4 } from 'uuid'; // Import uuid for creating test data

describe('JsonStorageDriver', () => {
  let tempDir: string;
  let testFilePath: string;
  let driver: JsonStorageDriver;

  // Helper function to create a valid Persona object for tests
  const createTestPersona = (name: string, tags: string[] = []): Persona => ({
    id: uuidv4(),
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
      } catch (err) {
        // Ignore errors during cleanup, e.g., if dir was already removed
        console.warn(`Minor error during cleanup: ${err}`);
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

  test('save should write an array of personas to the JSON file', async () => {
    const persona1 = createTestPersona('P1', ['tag1']);
    const persona2 = createTestPersona('P2', ['tag2']);
    const personasMap = new Map<string, Persona>();
    personasMap.set(persona1.id, persona1);
    personasMap.set(persona2.id, persona2);

    await driver.save(personasMap);

    // Verify file content
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    const savedData = JSON.parse(fileContent);

    expect(Array.isArray(savedData)).toBe(true);
    expect(savedData).toHaveLength(2);
    // Check content using arrayContaining for order independence
    expect(savedData).toEqual(expect.arrayContaining([persona1, persona2]));
  });

  test('save should create the directory if it does not exist', async () => {
    const deepDirPath = path.join(tempDir, 'some', 'nested', 'dir');
    const deepFilePath = path.join(deepDirPath, 'deep-test.json');
    const deepDriver = new JsonStorageDriver(deepFilePath);
    const persona = createTestPersona('Deep');
    const map = new Map([[persona.id, persona]]);

    await deepDriver.save(map);

    // Check if file exists (implicitly checks if dir was created)
    await expect(fs.access(deepFilePath)).resolves.toBeUndefined(); 
    const fileContent = await fs.readFile(deepFilePath, 'utf-8');
    const savedData = JSON.parse(fileContent);
    expect(savedData).toEqual([persona]);
  });

  test('load should read an array of personas and return a Map keyed by ID', async () => {
    const persona1 = createTestPersona('L1', ['load1']);
    const persona2 = createTestPersona('L2', ['load2']);
    const personasArray = [persona1, persona2];
    await fs.writeFile(testFilePath, JSON.stringify(personasArray, null, 2), 'utf-8');

    const loadedMap = await driver.load();

    expect(loadedMap).toBeInstanceOf(Map);
    expect(loadedMap.size).toBe(2);
    expect(loadedMap.get(persona1.id)).toEqual(persona1);
    expect(loadedMap.get(persona2.id)).toEqual(persona2);
  });

  test('load should return an empty Map if the file does not exist', async () => {
    // Don't create the file
    const loadedMap = await driver.load();
    expect(loadedMap).toBeInstanceOf(Map);
    expect(loadedMap.size).toBe(0);
  });

  test('load should return an empty Map for an empty file', async () => {
    await fs.writeFile(testFilePath, '', 'utf-8'); // Create empty file
    const loadedMap = await driver.load();
    expect(loadedMap).toBeInstanceOf(Map);
    expect(loadedMap.size).toBe(0);
  });

  test('load should handle invalid JSON content gracefully and return an empty Map', async () => {
    await fs.writeFile(testFilePath, 'this is not json', 'utf-8');
    // Suppress console.warn for this specific test
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    const loadedMap = await driver.load();
    
    expect(loadedMap).toBeInstanceOf(Map);
    expect(loadedMap.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON found'));
    warnSpy.mockRestore();
  });

   test('load should handle non-array JSON content gracefully and return an empty Map', async () => {
    await fs.writeFile(testFilePath, '{"not": "an array"}', 'utf-8');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const loadedMap = await driver.load();

    expect(loadedMap).toBeInstanceOf(Map);
    expect(loadedMap.size).toBe(0);
     expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid data format loaded'));
    warnSpy.mockRestore();
  });

   test('load should skip persona objects without an ID during loading', async () => {
     const persona1 = createTestPersona('Good');
     const badPersona = { name: 'Bad', description: 'No ID' }; // Missing ID
     const personasArray = [persona1, badPersona];
     await fs.writeFile(testFilePath, JSON.stringify(personasArray, null, 2), 'utf-8');
     const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

     const loadedMap = await driver.load();

     expect(loadedMap).toBeInstanceOf(Map);
     expect(loadedMap.size).toBe(1);
     expect(loadedMap.has(persona1.id)).toBe(true);
     expect(loadedMap.get(persona1.id)).toEqual(persona1);
     expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid persona object'), badPersona);
     warnSpy.mockRestore();
  });

  // Add test for save throwing error if write fails?
  // test('save should throw an error if writing fails', async () => { ... });
}); 