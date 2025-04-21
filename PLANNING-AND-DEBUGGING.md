# 📝 Persona Registry - Planning & Debugging Log

This document tracks the Test-Driven Development (TDD) process, planning decisions, and debugging notes for building the `CustomGPT Persona Registry`.

We follow an incremental approach: **Test -> Code -> Refactor**.

---

## ✅ Initial Setup & Plan [Completed]

1.  **Project Structure:** Set up basic directories (`src`, `tests`) and configuration files (`package.json`, `tsconfig.json`, testing framework config). - **Done**

---

## 🧪 Phase 1: Core Registry Instantiation

1.  **Write Test:** Create `tests/PersonaRegistry.test.ts`. Define a test case to ensure `PersonaRegistry` can be instantiated (e.g., `new PersonaRegistry(mockDriver)`). - **Done**
2.  **Run Test & Expect Failure:** Run `npm test`. 
    *   Initial run failed (`jest: command not found`) -> Ran `npm install`. - **Done**
    *   Second run failed (`SyntaxError`) -> Added `ts-jest` config to `package.json`. - **Done**
    *   Third run failed (`EJSONPARSE`) -> Fixed JSON escaping in `package.json` Jest config. - **Done**
    *   Fourth run failed (`Cannot find module .../src/PersonaRegistry`) - **Success! (Red Phase Complete)** ✅🟥
3.  **Implement:** Create `src/types.ts` and `src/PersonaRegistry.ts` with the minimal structure to make the test pass. - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test` again. - **Success! (Green Phase Complete)** ✅🟢
5.  **Refactor:** Minimal code added. Considered removing `console.log` in constructor. - **Done** ✅🔵

---

## 🧪 Phase 2: Create Persona

1.  **Write Test:** Add a test to `tests/PersonaRegistry.test.ts` for the `createPersona` method. Should check if a persona is added to internal storage (via mock driver). Handle potential duplicate name errors later. *(Updated Persona type to include `prompt: string`)*. - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Should fail (method not implemented). - **Success! (`TypeError`) (Red Phase Complete)** ✅🟥
3.  **Implement:** Add `createPersona` method to `src/PersonaRegistry.ts`. - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test`. - **Success! (Green Phase Complete)** ✅🟢
5.  **Refactor:** Reviewed basic load/save implementation. Deferred caching/duplicate checks to later tests/cycles. - **Done** ✅🔵

---

## 🧪 Phase 3: List Personas

1.  **Write Test:** Add a test for `listPersonas`. Should probably create a couple of personas first, then call `listPersonas` and check if the returned array matches the created personas. (Need to consider if `listPersonas` reads from driver or internal cache - let's assume internal cache for now). - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Should fail (method not implemented). - **Success! (`TypeError`) (Red Phase Complete)** ✅🟥
3.  **Implement:** Add internal cache (`Map`) to `PersonaRegistry`. Modify constructor to load into cache (`async static create` pattern). Implement `listPersonas` to return values from cache. Updated tests to use `create()`. - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test`. - **Success! (Green Phase Complete)** ✅🟢
5.  **Refactor:** Removed temporary `console.log` from `loadInitialPersonas`. Acknowledged `createPersona` save inefficiency for later cycle. - **Done** ✅🔵

---

## 🧪 Phase 4: Get Persona By Name

1.  **Write Test:** Add test for `getPersona(name)`. Create a persona, call `getPersona` with its name, assert the returned persona matches. Also test case for non-existent name (expect `undefined`). - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Should fail (method not implemented). - **Success! (`TypeError`) (Red Phase Complete)** ✅🟥
3.  **Implement:** Add `getPersona(name)` method to return persona from the cache (`this.personas.get(name)`). - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test`. - **Success! (Green Phase Complete)** ✅🟢
5.  **Refactor:** Method `getPersona` is minimal (`map.get`), no changes needed. - **Done** ✅🔵

---

## 🧪 Phase 5: Find by Tag

1.  **Write Test:** Add test(s) for `findByTag(tag)`. Create multiple personas with various tags. Call `findByTag` with a specific tag and assert the correct subset of personas is returned. Test tag not found (empty array). Test case sensitivity? (Assume case-sensitive for now). - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Should fail (method not implemented). - **Success! (`TypeError`) (Red Phase Complete)** ✅🟥
3.  **Implement:** Add `findByTag(tag)` method. Iterate through `this.personas.values()` and filter based on `persona.tags.includes(tag)`. - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test`. - **Success! (Green Phase Complete)** ✅🟢
5.  **Refactor:** Method `findByTag` is minimal (filter), no changes needed. - **Done** ✅🔵

---

## 🧪 Phase 6: Manual Flush

1.  **Write Test:** Add test for `flush()`. How to test? Modify `MockStorageDriver` to track if `save` was called. Create registry, maybe add a persona (modifying cache), call `flush()`, assert that `mockDriver.save` was indeed called. - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Should fail (method not implemented or doesn't call save). - **Success! (`TypeError`) (Red Phase Complete)** ✅🟥
3.  **Implement:** Add `flush()` method. It should simply call `this.storageDriver.save(this.personas)`. - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test`. - **Success! (Green Phase Complete)** ✅🟢
5.  **Refactor:** Method `flush` is minimal (calls driver save), no changes needed. - **Done** ✅🔵

---

## 🧪 Phase 7: JSON Storage Driver

1.  **Write Test:** Create `tests/JsonStorageDriver.test.ts`. Test the `save` method: create driver, save a map of personas, check if the target JSON file exists and contains the correct JSON string. Use Node.js `fs` module (or mocks) for file checks. Test the `load` method: create a JSON file with known content, create driver pointing to it, call `load`, assert the returned map matches the file content. Test file not found on load (expect empty map?). - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Should fail (class/methods not implemented). - **Success! (`Cannot find module`) (Red Phase Complete for Save)** ✅🟥 | **Success! (`load` test failed) (Red Phase Complete for Load)** ✅🟥
3.  **Implement:** Create `src/drivers/JsonStorageDriver.ts`. Implement `save` using `fs.writeFileSync` and `JSON.stringify`. Implement `load` using `fs.readFileSync` and `JSON.parse`. Handle potential errors (e.g., file not found during load, return empty map). - **Done (Save), Done (Load)** ✅✅
4.  **Run Test & Expect Success:** Run `npm test`. - **Success! (Green Phase Complete for Save)** ✅🟢 | **Success! (Green Phase Complete for Load)** ✅🟢
5.  **Refactor:** `save` method clear, uses `writeFileSync` (sync ok for now). No changes needed. | `load` method handles errors, uses `readFileSync` (sync ok for now). No changes needed. - **Done (Save)** ✅🔵 | **Done (Load)** ✅🔵

---

## ✅ Phase 7: JSON Storage Driver [Completed]

---

## 🧪 Phase 8: Dirty State Tracking

1.  **Write Test:** Modify `PersonaRegistry` tests (`createPersona`, `flush`, potentially constructor/`create`). Add assertions to check an internal `isDirty` state. 
    *   Test `isDirty` is `false` after `create()`.
    *   Test `isDirty` becomes `true` after `createPersona()`.
    *   Test `isDirty` becomes `false` after `flush()`.
    *   (May need a temporary getter `_isDirty()` for testing). - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Should fail (flag/logic not implemented). - **Success! (Assertions failed) (Red Phase Complete)** ✅🟥
3.  **Implement:** Add `private isDirty: boolean = false` to `PersonaRegistry`. Set to `true` in `createPersona`. Set to `false` after successful save in `flush`. Ensure initial state is `false` after load in `create()`/`loadInitialPersonas()`. - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test`. - **Success! (Green Phase Complete)** ✅🟢
5.  **Refactor:** Removed temporary `_isDirty` getter. Logic seems clean. - **Done** ✅🔵

---

## ✅ Phase 8: Dirty State Tracking [Completed]

---

## 🧪 Phase 9: Debounced Auto-Save

1.  **Write Test:** Need to test the debouncing behavior. Use `jest.useFakeTimers()`. Tests added for immediate save, delayed save, coalescing, and disabling. Updated `create` to accept options. Removed `_isDirty` checks. - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Should fail (debouncing logic not implemented). - **Success! (Save counts incorrect) (Red Phase Complete)** ✅🟥
3.  **Implement:** Add `debounceSaveMs` and `autoSaveEnabled` options to constructor/`create`. Add `debounce` function (e.g., from lodash or a simple custom one). Modify `createPersona` (and other future mutating methods) to call the debounced save function instead of saving directly. Ensure `this.isDirty` is checked by the debounced function. - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test`. - **Success! (Green Phase Complete)** ✅🟢
5.  **Refactor:** Added cancel capability to debounce utility and registry. Test structure prevents easy call in `afterEach`. **Jest open handle warning persists.** - **Done (Code)** ✅🔵 | **Warning Active** ⚠️
4.  **Alternative:** Revert timer change. Attempt test structure refactor to call `cancelPendingSave()` in `afterEach`. - **Done** ✅ -> **Failed (Warning Persisted)** ❌
5.  **Run Test & Verify (Attempt 2):** Run `npm test`. Check if tests pass and warning is gone. - **Failed (Warning Persisted)** ❌
6.  **(If Not Fixed) Further Options:** Consider Lodash debounce, deeper investigation. - **Trying Lodash**
7.  **Install Lodash:** Run `npm install lodash @types/lodash`. - **Done** ✅
8.  **Refactor Code:** Use `lodash/debounce` in `PersonaRegistry`. - **Done** ✅
9.  **Run Test & Verify (Attempt 3):** Run `npm test`. Check warning. - **Failed (Warning Persisted)** ❌
10. **Decision:** Ignore warning or investigate further (`--detectOpenHandles`)? - **Decided: Ignore for now.** Functionality passes tests.

---

## ✅ Phase 9: Debounced Auto-Save [Completed - Warning Ignored]

---

## 🧪 Phase 10: Address Jest Timer Warning

1.  **Attempt Fix:** Modify `Debounced Auto-Save` tests in `tests/PersonaRegistry.test.ts` to use Modern Fake Timers (`jest.useFakeTimers('modern');`). - **Done (Used `{ legacyFakeTimers: false }`)** ✅ -> **Failed (Warning Persisted)** ❌
2.  **Run Test & Verify:** Run `npm test`. Check if all tests pass AND the 'did not exit' warning is gone. - **Failed (Warning Persisted)** ❌
3.  ~~**(If Fixed) Refactor:** Minimal change, likely none needed.~~
4.  **Alternative:** Revert timer change. Attempt test structure refactor to call `cancelPendingSave()` in `afterEach`. - **Done** ✅ -> **Failed (Warning Persisted)** ❌
5.  **Run Test & Verify (Attempt 2):** Run `npm test`. Check if tests pass and warning is gone. - **Failed (Warning Persisted)** ❌
6.  ~~**(If Fixed) Refactor:** Minimal change, likely none needed.~~
7.  **(If Not Fixed) Further Options:** Consider Lodash debounce, deeper investigation. - **Trying Lodash**
8.  **Install Lodash:** Run `npm install lodash @types/lodash`.
9.  **Refactor Code:** Use `lodash/debounce` in `PersonaRegistry`.
10. **Run Test & Verify (Attempt 3):** Run `npm test`. Check warning.
11. **Decision:** Ignore warning or investigate further (`--detectOpenHandles`)? - **Decided: Ignore for now.** Functionality passes tests.

---

## ✅ Phase 10: Address Jest Timer Warning [Completed - Warning Ignored]

---

## 🧪 Phase 11: Integration Testing (Registry + JSON Driver)

1.  **Write Test:** Create `tests/PersonaRegistry.integration.test.ts`. Use real `JsonStorageDriver` with temp files (like in Phase 7 tests).
    *   Test create -> load sequence: Create registry, `createPersona`, check file content. Create *new* registry instance pointing to same file, call `load` (implicitly via `create`), call `getPersona`, verify loaded data. - **Done** ✅
    *   Test `flush`: Create, `createPersona`, call `flush`, check file content. - **(Covered by above test)**
    *   Test `findByTag` / `listPersonas` after loading from file. - **Done** ✅
2.  **Run Test & Expect Failure:** Run `npm test`. Initial run failed (`TypeError: registry.load is not a function`) due to incorrect instantiation. - **Done** ✅🟥
3.  **Implement/Fix:** Corrected test setup to use static `PersonaRegistry.create()`. - **Done** ✅
4.  **Run Test & Expect Success:** Run `npm test`. Revealed linter/type errors (missing fields `id`, `instructions`, `settings`; incorrect `createPersona` return). - **Done** ✅🟥
5.  **Refactor:** (Major Refactor for ID-based system and Type Alignment)
    *   Installed `uuid`. - **Done** ✅
    *   Updated `src/types.ts` (`Persona` fields, `CreatePersonaInput`). - **Done** ✅
    *   Updated `src/PersonaRegistry.ts` (use `id` key, generate id/timestamps, return `Persona`). - **Done** ✅
    *   Updated `src/drivers/JsonStorageDriver.ts` (save/load array, use `fs/promises`). - **Done** ✅
    *   Updated `tests/PersonaRegistry.test.ts` & `MockStorageDriver`. - **Done** ✅
    *   Updated `tests/JsonStorageDriver.test.ts`. - **Done** ✅
    *   Updated `tests/PersonaRegistry.integration.test.ts`. - **Done** ✅
6.  **Run Test & Expect Success:** Run `npm test`. - **Success! All tests passed.** ✅🟢
7.  **Refactor:** Code clean after major refactor. Jest warning also resolved. - **Done** ✅🔵

--- 

## ✅ Phase 11: Integration Testing (Registry + JSON Driver) [Completed]

---

## ❓ Next Steps / Planning

*   **Error Handling:** Improve error handling (e.g., `createPersona` for duplicate *names* - requires adding a check). Add specific tests for these cases.
*   **API Completeness:** Add any missing methods from `PROJECT-OVERVIEW.md` API table (double-check if any were missed - seems complete for now).
*   **Code Cleanup:** Review TODOs, potentially add more robust validation.
*   **Documentation Update:** Add future plans (Versioning, History, Duplication) to `PROJECT-OVERVIEW.md`.

*(Choose next step...)* 