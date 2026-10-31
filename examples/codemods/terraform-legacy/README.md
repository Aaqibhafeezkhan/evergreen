# Terraform legacy syntax codemod

The `before.tf` file uses two forms Terraform deprecated or removed:

- `"${var.name}"` is an interpolation-only string, deprecated in Terraform v0.12.14.
- `list(...)` and `map(...)` are the functions removed in Terraform v0.15.

`evergreen fix` rewrites both to `after.tf`: the interpolation loses its quotes, and the calls become `tolist([...])` and `tomap({...})`.

```bash
cp examples/codemods/terraform-legacy/before.tf main.tf
evergreen scan . --only terraform
evergreen fix . | git apply --check
evergreen fix . | git apply
terraform init -backend=false && terraform validate
```

A call whose arguments span lines, an empty `list()`, an odd `map()` argument count, an expression map key, and a string used as an object key or block label are refused with the reason. `docs/CODEMODS.md` describes the full set of rewrites and refusals.
