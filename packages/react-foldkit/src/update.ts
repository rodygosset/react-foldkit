export {
	type foldChildInit,
	type foldChildInits,
	type Commands,
	type Return,
	type ReturnWithOutMessage,
	type Step,
	type StepWithOutMessage,
	type Refreshable,
	type ChildFold,
	type ChildFoldWithDerivedParentOutMessage,
	type ChildFoldWithOutMessage,
	type ChildFoldWithParentOutMessage,
	type ChildStepFold,
	type ChildStepFoldWithDerivedParentOutMessage,
	type ChildStepFoldWithOutMessage,
	type ChildStepFoldWithParentOutMessage,
	type FoldContext,
	type Fold,
	type FoldWithOutMessage,
} from "foldkit/update"
export { combine, foldChild, foldChildStep, refresh, withOutMessage } from "foldkit/update"
import type { Return } from "foldkit/update"

/**
 * Returns the same Model with no Commands or OutMessage.
 *
 * @category constructors
 * @since 0.1.0
 */
export const identity = <Model>(model: Model): Return<Model, never> => ({ model })
