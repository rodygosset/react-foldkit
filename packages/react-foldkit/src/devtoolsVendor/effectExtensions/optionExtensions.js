import { Function, Option, String } from 'effect';
export const fromString = Option.liftPredicate(String.isNonEmpty);
export const when = Function.dual(2, (condition, value) => Option.liftPredicate(value, () => condition));
