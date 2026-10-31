# Codemods

`evergreen fix` prints deterministic patches for findings whose repair is purely syntactic. It never writes a file, never runs a command, and never uses the network; the output is a unified diff that `git apply` accepts.

```bash
evergreen scan .
evergreen fix . | git apply --check
evergreen fix . | git apply
```

A fixer rewrites only the exact form its rule names. A finding it cannot repair without guessing is left in place and reported as a refusal with the reason, so a patch never hides a change the tool did not understand.

## Terraform legacy syntax

Two Terraform language forms have a one-to-one rewrite:

| Finding | Rewrite |
| --- | --- |
| `terraform.syntax.interpolation-only` | `"${var.name}"` becomes `var.name` |
| `terraform.function.list-map` | `list(a, b)` becomes `tolist([a, b])`; `map(k, v)` becomes `tomap({ k = v })` |

Interpolation-only strings were deprecated in Terraform v0.12.14. Terraform still accepts them, but recommends the bare expression. The `list()` and `map()` functions were removed in Terraform v0.15, so a configuration that still calls them fails to validate on 0.15 and later.

```bash
evergreen scan . --only terraform
evergreen fix . | git apply
terraform init -backend=false && terraform validate
terraform plan
```

### What is detected

- A quoted string whose entire value is one `${ ... }` interpolation, in a value, object key, or block label.
- A value call to `list()` or `map()`, including one inside an interpolation expression.

A string with any literal text around the interpolation, such as `"prefix-${var.name}"`, is not interpolation-only and is not reported. Neither are heredocs, comments, plain string contents, `%{ ... }` directives, escaped strings, or the `list(string)` and `map(object({...}))` type constraints, which remain valid.

### What is rewritten

- An interpolation-only string in a value position loses its quotes. A string used as an object key or a block label is refused: removing its quotes would change the key syntax or produce invalid HCL.
- A `list()` or `map()` call is rewritten only when every argument is on one line and the argument count is valid. `list()` needs at least one argument, `map()` needs an even number of key/value arguments, and each key must be an identifier or a quoted string.
- A call whose arguments span lines, an empty `list()`, an odd `map()` argument count, or an expression map key is refused with the reason rather than guessed.
- Files under `.terraform/`, files whose header says another tool generates them, and files without a trailing newline are refused. Finding a file already in its rewritten form leaves nothing for a second pass.

The `examples/codemods/terraform-legacy` directory contains a before and after pair. The detector and codemod use bounded, pure parsing only; Terraform is never run.
