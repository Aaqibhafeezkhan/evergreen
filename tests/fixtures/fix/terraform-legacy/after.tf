terraform {
  required_version = ">= 1.5.0"
}

locals {
  name        = var.name
  description = "Hello, ${var.name}"
  ports       = tolist([80, 443])
  tags        = tomap({"Environment" = var.environment, "Team" = "platform"})
  nested      = tolist(["a", "b"])
}
