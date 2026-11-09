import type { ActorContext } from '@quiz/contracts/identity';

export function createTestActorContextResolver(
  actorContext: ActorContext,
): (request: unknown) => ActorContext {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test ActorContext injection is only available when NODE_ENV=test.');
  }

  return (_request: unknown) => actorContext;
}
