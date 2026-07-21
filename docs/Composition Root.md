# Composition Root

`src/app/composition` is the only application bootstrap boundary that selects the active persistence implementation and assembles repository dependencies.

Production uses `createLocalApplicationDependencies()` and mounts one `ApplicationDependencyProvider` above all feature providers in `main.tsx`. The provider creates or accepts one dependency object and retains it for its complete React lifetime.

Feature providers consume repository contracts from the injected dependency object. Services receive the smallest repository subset through parameters. Pure domain functions remain repository-free.

Tests may call `createLocalApplicationDependencies({ repositories: overrides })` or pass a complete dependency object to the provider. This permits deterministic fakes without browser Local Storage access.

The strict `useApplicationDependencies()` hook throws `APPLICATION_DEPENDENCIES_MISSING` outside the root. `useApplicationDependenciesCompatibility()` is a deprecated exception for historical tests and isolated feature-provider mounts; it returns one module-stable local root and must not be used by new features.

Current repository modules retain singleton exports because contexts, tests, synchronization orchestration, deletion guards, and compatibility services still import them. These are explicitly listed in `compatibility.sharedLegacySingletons`. Future adapter work should replace construction only in the composition factory and progressively remove those imports.

Prohibited patterns for new code:

- Constructing repositories inside components or render paths.
- Importing Local Storage implementations into feature UI.
- Reading `window.localStorage` outside the storage adapter layer.
- Passing the entire dependency root to a pure domain function.
- Using the React dependency context as a service locator from domain code.
