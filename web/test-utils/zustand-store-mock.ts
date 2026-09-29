/**
 * `createStoreMock` is a type-safe helper for mocking Zustand selector hooks in tests.
 *
 * Usage: Provide a function that returns the store state you want for your test.
 * The mock will behave like Zustand's store hook, supporting selectors or defaulting to the whole state.
 *
 * @template T - The type of your store's state (e.g., AppLayoutState)
 * @param getState - A function returning the current state for this test
 * @returns A function that mimics Zustand's store hook: accepts a selector or defaults to the whole state
 *
 * Example:
 *    const getAppLayoutStoreState = () => ({ ... });
 *    vi.mock("~/stores/app-layout-store", () => ({
 *        useAppLayoutStore: createStoreMock(getAppLayoutStoreState)
 *    }))
 *
 *    // In a test:
 *    getAppLayoutStoreState = () => ({ foo: 1, bar: 2 })
 *    // Your component accesses this state via its useAppLayoutStore(selector)
 *    const foo = useAppLayoutState((state) => state.foo) // <- not mocked individually, handled by this mock store helper
 */
export function createStoreMock<T>(getState: () => T) {
	/**
	 * @template U - Return type of the selector (inferred), defaults to T (i.e. full store state)-- the any is intermediary here, it infers to full type
	 * @param selector - Function selecting part of state, defaults to identity (returns all)
	 * @returns Result of the selector (type U)
	 */
	const useStore = <U>(selector: (s: T) => U): U => selector(getState());

	// Attach .getState() to match Zustand's API
	useStore.getState = getState;

	return useStore;
}
