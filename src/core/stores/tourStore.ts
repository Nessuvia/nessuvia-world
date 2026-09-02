import { create } from 'zustand'

/**
 * Whether the onboarding tour is running. Which tour runs is not stored: TourHost reads the route
 * and looks it up, so navigating is not a state to keep in sync.
 *
 * Nothing persists here. Every run starts at step 1; resume after a refresh is not a feature.
 */
export const useTour = create<{ running: boolean; start(): void; stop(): void }>((set) => ({
  running: false,
  start: () => set({ running: true }),
  stop: () => set({ running: false }),
}))
