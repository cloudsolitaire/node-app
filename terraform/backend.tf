terraform {
  backend "s3" {
    bucket  = "terraform-state-incident-agent-infra"
    key     = "node-app"
    region  = "ap-south-1"
    profile = "cs"
  }
}
