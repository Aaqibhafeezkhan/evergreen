locals {
  name  = "${var.name}"
  ports = list(80, 443)
  tags  = map("Environment", var.environment)
}
