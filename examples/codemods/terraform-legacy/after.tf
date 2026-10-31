locals {
  name  = var.name
  ports = tolist([80, 443])
  tags  = tomap({"Environment" = var.environment})
}
