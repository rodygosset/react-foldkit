import { Option } from "effect"
import * as Command from "./command"

/** The Commands half of an update return: every Command the update wants
 *  the runtime to run, in order. `R` is the services the Commands need
 *  and defaults to `never` for applications without resources.
 *
 *  Each update module pins its concrete types once and uses the alias
 *  throughout; the root update and every Submodel define their own:
 *
 *  ```ts
 *  export type Commands = Update.Commands<Message, AppServices>
 *  ``` */
export type Commands<Message, R = never> = ReadonlyArray<Command.Command<Message, never, R>>

/** The pair every update function returns: the next Model and the
 *  Commands to run.
 *
 *  Each update module pins its concrete types once and aliases the
 *  result, the root update and every Submodel alike:
 *
 *  ```ts
 *  export type UpdateReturn = Update.Return<Model, Message>
 *  export const withUpdateReturn = M.withReturnType<UpdateReturn>()
 *  ``` */
export type Return<Model, Message, R = never> = readonly [Model, Commands<Message, R>]

/** The return shape of an update that also surfaces an OutMessage to its
 *  parent. The third element is an `Option`: the update always returns
 *  the channel, and `None` means there is nothing for the parent this
 *  time. Named for the shape, not the caller: a Submodel without an
 *  OutMessage channel returns a plain {@link Return}. */
export type ReturnWithOutMessage<Model, Message, OutMessage, R = never> = readonly [
	Model,
	Commands<Message, R>,
	Option.Option<OutMessage>,
]
