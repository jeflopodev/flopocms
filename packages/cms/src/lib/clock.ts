/**
 * The Clock.
 *
 * One shape for reading the time, so a module that has to decide whether a Concurrency
 * Lock has expired can be exercised at a moment of the test's choosing. It used to be
 * three: a `Clock` object nothing but Post Lifecycle consumed, a raw `() => number` the
 * in-memory lock took, and `Date.now()` written out inside the D1 lock — which is what
 * made the substitute more testable than the thing it substitutes for.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
