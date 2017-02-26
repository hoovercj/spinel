# Spinel

## Introduction
[Spinel](https://en.wikipedia.org/wiki/Spinel) is a natural gemstone that historically has often been confused for rubies.

It is also the name for a toy programming language that I'm working on that is loosely based on Ruby syntax.

```ruby
def square x
    x * x
end

print square 5
```

## Current Progress
To avoid starting from scratch, I have shamelessly borrowed the parser implementation from [esprima](https://github.com/jquery/esprima) as a starting point. I've trimmed the fat to get rid of things I won't support (basically anything that isn't a primitive or a function) and I'm starting to modify the parser and tokenizer to support the grammar that I want.

## Roadmap
- [] Loose grammar definition
- [] Parser + AST generation
- [] Interpreter
- [] Textmate grammar
- [] AST to custom IL generation
- [] Custom VM to run the IL
- [] Support tooling
