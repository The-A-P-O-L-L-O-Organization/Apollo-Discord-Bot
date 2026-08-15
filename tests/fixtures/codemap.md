# tests/fixtures/

## Responsibility
Provides static test data and mock objects for unit and integration tests across the codebase.

## Design
Uses the fixture pattern: plain JavaScript/TypeScript objects and JSON files representing expected inputs, outputs, and state snapshots. No behavioral logic; purely data structures.

## Flow
Test suites import fixtures via relative paths. Data is read-only and consumed directly by test assertions or passed to functions under test. No internal state transitions; fixtures are loaded once per test file.

## Integration
Consumed by test files in `src/**/*.test.{js,ts}` and `tests/**/*.{js,ts}`. No production code depends on this directory. Interacts with testing frameworks (Jest/Mocha) through import statements.