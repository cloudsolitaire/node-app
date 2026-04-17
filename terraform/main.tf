# ── Namespace ────────────────────────────────────────────────────────
resource "kubernetes_namespace" "buggy_app" {
  metadata {
    name = var.namespace

    labels = {
      "app.kubernetes.io/name"       = "buggy-node-app"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
}

# ── Deployment ───────────────────────────────────────────────────────
resource "kubernetes_deployment" "buggy_node_app" {
  metadata {
    name      = "buggy-node-app"
    namespace = kubernetes_namespace.buggy_app.metadata[0].name

    labels = {
      app = "buggy-node-app"
    }
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app = "buggy-node-app"
      }
    }

    template {
      metadata {
        labels = {
          app = "buggy-node-app"
        }

        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "3000"
          "prometheus.io/path"   = "/metrics"
        }
      }

      spec {
        container {
          name              = "app"
          image             = "${var.image_repository}:${var.image_tag}"
          image_pull_policy = var.image_pull_policy

          port {
            container_port = 3000
          }

          env {
            name  = "NODE_ENV"
            value = "production"
          }

          env {
            name  = "PORT"
            value = "3000"
          }

          resources {
            requests = {
              cpu    = var.resources_requests_cpu
              memory = var.resources_requests_memory
            }
            limits = {
              cpu    = var.resources_limits_cpu
              memory = var.resources_limits_memory
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 3000
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 3000
            }
            initial_delay_seconds = 3
            period_seconds        = 5
          }
        }
      }
    }
  }
}

# ── Service ──────────────────────────────────────────────────────────
resource "kubernetes_service" "buggy_node_app" {
  metadata {
    name      = "buggy-node-app"
    namespace = kubernetes_namespace.buggy_app.metadata[0].name

    labels = {
      app = "buggy-node-app"
    }
  }

  spec {
    selector = {
      app = "buggy-node-app"
    }

    port {
      name        = "http"
      port        = var.service_port
      target_port = 3000
      protocol    = "TCP"
    }

    type = var.service_type
  }
}

# ── ServiceMonitor (Prometheus scraping) ─────────────────────────────
resource "kubernetes_manifest" "service_monitor" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "ServiceMonitor"
    metadata = {
      name      = "buggy-node-app"
      namespace = var.namespace
      labels = {
        app     = "buggy-node-app"
        release = "prometheus"
      }
    }
    spec = {
      selector = {
        matchLabels = {
          app = "buggy-node-app"
        }
      }
      endpoints = [{
        port     = "http"
        path     = "/metrics"
        interval = "15s"
      }]
      namespaceSelector = {
        matchNames = [var.namespace]
      }
    }
  }

  depends_on = [kubernetes_namespace.buggy_app]
}

# ── PrometheusRule (alerting rules) ──────────────────────────────────
resource "kubernetes_manifest" "prometheus_rules" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "PrometheusRule"
    metadata = {
      name      = "buggy-node-app-alerts"
      namespace = var.namespace
      labels = {
        app     = "buggy-node-app"
        release = "prometheus"
      }
    }
    spec = {
      groups = [
        {
          name = "buggy-node-app.errors"
          rules = [{
            alert = "BuggyAppHighErrorRate"
            expr  = "sum(rate(app_errors_total{job=\"buggy-node-app\"}[5m])) > 0.1"
            for   = "2m"
            labels = {
              severity  = "critical"
              namespace = var.namespace
              service   = "buggy-node-app"
            }
            annotations = {
              summary     = "High error rate on buggy-node-app"
              description = "Error rate is {{ $value }} errors/sec over the last 5 minutes."
            }
          }]
        },
        {
          name = "buggy-node-app.http"
          rules = [{
            alert = "BuggyAppHigh5xxRate"
            expr  = "sum(rate(http_requests_total{job=\"buggy-node-app\", status=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"buggy-node-app\"}[5m])) > 0.05"
            for   = "2m"
            labels = {
              severity  = "critical"
              namespace = var.namespace
              service   = "buggy-node-app"
            }
            annotations = {
              summary     = "High 5xx rate on buggy-node-app"
              description = "{{ $value | humanizePercentage }} of requests are returning 5xx."
            }
          }]
        },
        {
          name = "buggy-node-app.latency"
          rules = [{
            alert = "BuggyAppHighLatency"
            expr  = "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=\"buggy-node-app\"}[5m])) by (le)) > 2"
            for   = "2m"
            labels = {
              severity  = "warning"
              namespace = var.namespace
              service   = "buggy-node-app"
            }
            annotations = {
              summary     = "P95 latency above 2s on buggy-node-app"
              description = "P95 response time is {{ $value }}s."
            }
          }]
        },
        {
          name = "buggy-node-app.memory"
          rules = [{
            alert = "BuggyAppMemoryLeak"
            expr  = "app_memory_leak_bytes{job=\"buggy-node-app\"} > 50000000"
            for   = "1m"
            labels = {
              severity  = "critical"
              namespace = var.namespace
              service   = "buggy-node-app"
            }
            annotations = {
              summary     = "Memory leak detected in buggy-node-app"
              description = "Leak array is {{ $value | humanize1024 }}B and growing."
            }
          }]
        },
        {
          name = "buggy-node-app.restarts"
          rules = [{
            alert = "BuggyAppFrequentRestarts"
            expr  = "increase(kube_pod_container_status_restarts_total{namespace=\"${var.namespace}\", container=\"app\"}[15m]) > 3"
            for   = "1m"
            labels = {
              severity  = "critical"
              namespace = var.namespace
              service   = "buggy-node-app"
            }
            annotations = {
              summary     = "buggy-node-app is restarting frequently"
              description = "Pod has restarted {{ $value }} times in the last 15 minutes."
            }
          }]
        },
      ]
    }
  }

  depends_on = [kubernetes_namespace.buggy_app]
}
