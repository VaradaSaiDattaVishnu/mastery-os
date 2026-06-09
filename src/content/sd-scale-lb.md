A load balancer is a traffic distributor that sits in front of a server pool, forwarding each incoming request to one server according to a configured algorithm — its real job is to make a cluster appear as one reliable endpoint.

## The core

Layer 4 (transport) load balancers forward TCP/UDP packets based on IP+port without inspecting content; they are fast but cannot route on URL path or headers. Layer 7 (application) balancers terminate the HTTP connection, read the request, and can route by hostname, path, cookie, or header — enabling canary deploys and A/B tests.

```
Client
  │
  ▼
┌─────────────────────────────┐
│      L7 Load Balancer       │  ← health-checks every 5 s
│  /api/*  →  backend pool    │
│  /static →  CDN / origin    │
└─────────────────────────────┘
       │           │           │
   Server A    Server B    Server C
```

**Algorithms:**
- Round-robin — simple, stateless, good when requests are uniform-cost.
- Least-connections — routes to the server with the fewest active connections; better when request cost varies.
- Consistent hashing — hashes a request attribute (user-id, IP) to the same server; useful when local state or a cache lives on the server.
- Weighted round-robin — proportional routing for heterogeneous hardware.

**Health checks** are the load balancer's contract with the pool. A passive check observes error rates on real traffic; an active check probes a `/health` endpoint periodically. A server is only removed from rotation after `unhealthy_threshold` consecutive failures to avoid flapping.

**Sticky sessions** bind a client to one server via a cookie. This solves stateful backends but defeats horizontal scaling — avoid it by externalising state to Redis.

```nginx
upstream backend {
  least_conn;
  server 10.0.0.1:3000 weight=3;
  server 10.0.0.2:3000 weight=1;
  keepalive 64;
}
server {
  location /api/ {
    proxy_pass http://backend;
    proxy_next_upstream error timeout http_500;
  }
}
```

## In your project

In scale-quest, every load-balancing level teaches a concrete failure mode: round-robin drops sessions on server restart, consistent hashing survives rolling deploys. When you add a server to a round-robin pool you should test that the health-check endpoint responds before traffic is shifted — a misconfigured `/health` handler has killed real releases.

## Tradeoffs & pitfalls

- **Thundering herd on restart**: all backends restart simultaneously, health checks pass immediately, then all fail under cold-cache load. Stagger restarts.
- **L4 vs L7 cost**: L7 terminates TLS twice (client→LB and LB→backend); adds latency and CPU. Use L4 pass-through when you don't need HTTP features.
- **Single point of failure**: a single LB is itself the SPOF. Use active-passive or ECMP with anycast for HA.
- **Keepalive misconfiguration**: not reusing upstream connections turns every request into a new TCP handshake — a common throughput killer.

## Top-1% insight

The `proxy_next_upstream` directive (NGINX) or its equivalent retries a failed request on the next server — but only if it is safe to do so. For non-idempotent writes (POST, PATCH) retrying on the next server can result in a double write. Production configs must explicitly gate retries on idempotent methods or responses that confirm the origin never processed the request (connection refused, not a 500 after partial write).
