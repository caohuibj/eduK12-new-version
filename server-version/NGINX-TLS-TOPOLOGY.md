# Nginx / TLS deployment contract

The checked-in `frontend/nginx.conf` intentionally listens on HTTP port 80
only. It carries static-response security headers and forwards the same-origin
API, upload, and Socket.IO traffic to the backend.

Production must use one of these explicit topologies:

1. Terminate TLS at the cloud load balancer or ingress, forward HTTP to the
   frontend container, and set `COOKIE_SECURE=true` in the backend. The edge
   must redirect HTTP to HTTPS, set HSTS, and forward the original scheme in
   `X-Forwarded-Proto`.
2. Terminate TLS at Nginx by supplying certificates outside Git, mounting them
   read-only into the frontend container, and adding a deployment-specific
   `listen 443 ssl` server block. The block must redirect port 80 to HTTPS,
   set HSTS only on HTTPS responses, and preserve the existing `/api/`,
   `/uploads/`, `/ready`, and `/socket.io/` proxy locations.

Certificates and private keys must never be committed to this repository or
placed in `.env`. The default Compose stack remains HTTP-friendly for the
documented local `http://localhost` setup; HTTPS is a deployment overlay, not a
fake certificate embedded in the image.

Before enforcing `Content-Security-Policy`, inspect the report-only violations
from the current Nginx header. The baseline allows the known Bilibili/YouTube
embed hosts, same-origin PDF workers, and externally hosted media/images. Narrow
those sources per deployment after the browser inventory is complete.
