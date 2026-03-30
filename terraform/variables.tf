# ── AWS ───────────────────────────────────────────────────────────────
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "AWS CLI profile name. Set to empty string in CI."
  type        = string
  default     = "cs"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "incident-agent"
}

variable "namespace" {
  description = "Kubernetes namespace for node-app"
  type        = string
  default     = "buggy-app"
}

# ── Image ─────────────────────────────────────────────────────────────
variable "image_repository" {
  description = "Container image repository"
  type        = string
  default     = "975050086565.dkr.ecr.ap-south-1.amazonaws.com/node-app"
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "latest"
}

variable "image_pull_policy" {
  description = "Image pull policy"
  type        = string
  default     = "Always"
}

variable "replicas" {
  description = "Number of deployment replicas"
  type        = number
  default     = 2
}

# ── Service ───────────────────────────────────────────────────────────
variable "service_type" {
  description = "Kubernetes service type"
  type        = string
  default     = "ClusterIP"
}

variable "service_port" {
  description = "Service port"
  type        = number
  default     = 3000
}

# ── Resources ─────────────────────────────────────────────────────────
variable "resources_requests_cpu" {
  description = "CPU request"
  type        = string
  default     = "100m"
}

variable "resources_requests_memory" {
  description = "Memory request"
  type        = string
  default     = "128Mi"
}

variable "resources_limits_cpu" {
  description = "CPU limit"
  type        = string
  default     = "500m"
}

variable "resources_limits_memory" {
  description = "Memory limit (intentionally low — memory leak will hit this)"
  type        = string
  default     = "256Mi"
}
