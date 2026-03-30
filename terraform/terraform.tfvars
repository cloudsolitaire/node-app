aws_region   = "ap-south-1"
cluster_name = "incident-agent"
namespace    = "buggy-app"

# Image
image_repository = "975050086565.dkr.ecr.ap-south-1.amazonaws.com/node-app"
image_tag        = "latest"
replicas         = 2

# Service
service_type = "ClusterIP"
service_port = 3000

# Resources (intentionally tight for testing)
resources_requests_cpu    = "100m"
resources_requests_memory = "128Mi"
resources_limits_cpu      = "500m"
resources_limits_memory   = "256Mi"
