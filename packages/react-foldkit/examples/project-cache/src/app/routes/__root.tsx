import * as React from "react"
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { Provider } from "../providers/provider"

export const Route = createRootRoute({ component: View, shellComponent: Document })

function View() {
  return <Provider><Outlet /></Provider>
}

function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  )
}
