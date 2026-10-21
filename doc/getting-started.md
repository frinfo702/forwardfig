---
title: Getting started
group: Start
order: 2
description: Install forwardfig, draw a first figure, and put it on a page or in a file.
---

# Getting started

You need a bundler or a browser that loads ES modules. Node works too, for SVG output.

## Install

```bash
npm install forwardfig
# or
bun add forwardfig
```

## A first figure

A figure starts from `fig.input()`. Each layer you call on a tensor draws a block and an edge into it.

```ts figure
import { Figure, linear, act, softmax, text } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
let x = fig.input('$\\mathbf{x}$')
x = act()(linear()(x))
text('$\\hat{y}$')(softmax()(linear('Linear')(x)))
```

## Put it on a page

```ts
fig.mount('#figure')        // render into an element (or a CSS selector)
const svg = fig.svg()       // or take the SVG string
```

`svg()` needs no DOM, so the same code runs in Node, in a build step, or on a server.

## Write it to a file

```ts
await fig.download('figure.png')                 // browser: the format follows the extension
await Bun.write('figure.svg', fig.svg())         // Node / Bun: SVG
```

See [Export](export.md) for raster options.

## Run the repository

```bash
bun install && bun test && bun run build
bun run docs:dev          # these docs at http://localhost:4321
python3 -m http.server    # then open demo/ for the gallery and playground
```
