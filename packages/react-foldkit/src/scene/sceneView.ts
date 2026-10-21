import type { Html, HtmlBuilder } from "foldkit/html"

/** A Foldkit-shaped view function that stands for a bound React component. Scene calls nothing on it. */
export type SceneView<Model, Message> = (model: Model, html: HtmlBuilder<Message>) => Html
