terraform {
  required_version = ">= 1.5.0"
}

locals {
  name        = "${var.name}"
  description = "Hello, ${var.name}"
  ports       = list(80, 443)
  tags        = map("Environment", var.environment, "Team", "platform")
  nested      = "${list("a", "b")}"
}
