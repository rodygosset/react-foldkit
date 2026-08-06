# Third-Party Notices

This package incorporates source from [Foldkit](https://github.com/foldkit/foldkit)
(vendored under `repos/foldkit/` in the monorepo, currently pinned to Foldkit
`0.138.0`). Those modules are compiled into the published `dist/` output via
`tsup`. Application code should import `react-foldkit/*` only — not
`foldkit` directly.

Vendored Foldkit surfaces include, in whole or in part:

- `asyncData`
- `command` (including interrupt-registry internals used by the store)
- `message`
- `schema`
- `struct`
- `subscription` (`make` / `entry`)
- `update`

The original Foldkit license follows.

## Foldkit

The MIT License (MIT)

Copyright (c) 2025 Devin Jameson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
