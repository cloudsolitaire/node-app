output "namespace" {
  description = "Namespace where node-app is deployed"
  value       = kubernetes_namespace.buggy_app.metadata[0].name
}

output "service_endpoint" {
  description = "Node-app service endpoint"
  value       = "${kubernetes_service.buggy_node_app.metadata[0].name}.${var.namespace}.svc.cluster.local:${var.service_port}"
}

output "deployment_name" {
  description = "Deployment name"
  value       = kubernetes_deployment.buggy_node_app.metadata[0].name
}
