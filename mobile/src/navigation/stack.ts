import { directionOf, routeKey, type Direction, type Route } from './routes.ts';

/** The navigation state machine. Home is always at the bottom of the stack. */
export type NavState = { stack: Route[]; previous: Route | null; direction: Direction; serial: number };
export type NavAction = { type: 'push'; route: Route } | { type: 'back' } | { type: 'reset'; route: Route } | { type: 'home' };

export const START: NavState = { stack: [{ name: 'home' }], previous: null, direction: 'forward', serial: 0 };

export function reduce(state: NavState, action: NavAction): NavState {
  const top = state.stack[state.stack.length - 1];
  switch (action.type) {
    case 'push': {
      if (routeKey(action.route) === routeKey(top)) return state;
      if (action.route.name === 'home') return reduce(state, { type: 'home' });
      return { stack: [...state.stack, action.route], previous: top, direction: directionOf(top, action.route), serial: state.serial + 1 };
    }
    case 'back': {
      if (state.stack.length <= 1) return state;
      const stack = state.stack.slice(0, -1);
      return { stack, previous: top, direction: 'back', serial: state.serial + 1 };
    }
    case 'home':
      if (state.stack.length === 1) return state;
      return { stack: [state.stack[0]], previous: top, direction: 'back', serial: state.serial + 1 };
    case 'reset':
      return {
        stack: action.route.name === 'home' ? [state.stack[0]] : [state.stack[0], action.route],
        previous: top,
        direction: directionOf(top, action.route),
        serial: state.serial + 1,
      };
  }
}
