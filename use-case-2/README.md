# NGINX + Keycloak Integration (Basic and Bearer Unified Flow)

This project demonstrates a unified solution to handle both Basic Authentication and Bearer Token introspection using Keycloak with NGINX and NJS (NGINX JavaScript).

## 🔧 Use Case

- Clients send either:
  - `Authorization: Basic <credentials>`
  - `Authorization: Bearer <JWT>`

- NGINX performs:
  - For Basic: a token exchange to Keycloak using client credentials flow.
  - For Bearer: a UMA ticket introspection call with permission checks.

---

## 📂 Project Structure

```
.
├── conf/
│   ├── oauth_token.js                  # NJS Script
│   └── nginx.conf                      # NGINX Server Config (for Bare Metal)
├── k8s/
│   ├── ingress.yaml                    # Kubernetes Ingress Resource
│   └── configmap.yaml                  # NGINX ConfigMap with http-snippets
└── README.md                           # You are here
```

---

## 1️⃣ ConfigMap (configmap.yaml)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ingress-plus-nginx-ingress
  namespace: default
data:
  http-snippets: |
    underscores_in_headers on;
    js_import /etc/nginx/conf.d/oauth_token.js;

    # Store original Authorization header for reuse
    map $http_authorization $original_auth {
        default $http_authorization;
    }
```

---

## 2️⃣ Ingress Resource (ingress.yaml)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: bearer-basic-ingress
  namespace: default
  annotations:
    nginx.org/location-snippets: |
      set $permission "$request_uri#$request_method";

      auth_request /_oauth2_token_introspection;

      proxy_set_header audience "mw-resource-owner";
      proxy_set_header permission_resource_format "uri";
      proxy_set_header permission_resource_matching_uri "true";
      proxy_set_header permission $permission;

      auth_request_set $final_auth $sent_http_token_forward;
      proxy_set_header Authorization $final_auth;
    nginx.org/server-snippets: |
      location = /_oauth2_token_introspection {
          internal;
          js_content oauth_token.introspectAccessToken;
      }

      location = /_oauth2_send_bearer_request {
          internal;
          proxy_method POST;
          proxy_set_header Content-Type "application/x-www-form-urlencoded";
          proxy_set_header Authorization $original_auth;
          proxy_set_body "grant_type=urn:ietf:params:oauth:grant-type:uma-ticket&permission=$permission&audience=mw-resource-owner&permission_resource_format=uri&permission_resource_matching_uri=true";
          proxy_ssl_server_name on;
          proxy_pass https://np-keycloak.dte.celcomdigi.com/realms/mw-dev-realm/protocol/openid-connect/token;
      }

      location = /_basic_send_request {
          internal;
          proxy_method POST;
          proxy_set_header Content-Type "application/x-www-form-urlencoded";
          proxy_set_header Authorization $original_auth;
          proxy_set_body "grant_type=client_credentials";
          proxy_ssl_server_name on;
          proxy_pass https://np-keycloak.dte.celcomdigi.com/realms/mw-dev-realm/protocol/openid-connect/token;
      }
```

---

## 3️⃣ NJS Script (oauth_token.js)

```js
function introspectAccessToken(r) {
    var authHeader = r.headersIn["Authorization"] || "";
    var permission = r.variables.permission || "";

    r.log("Authorization header: " + authHeader);
    r.log("Permission: " + permission);

    if (!permission) {
        r.return(400, "Missing permission");
        return;
    }

    r.subrequest("/_oauth2_send_bearer_request", function(reply) {
        r.log("Bearer introspection response: " + reply.status);
        if (reply.status === 200) {
            r.subrequest("/_basic_send_request", function(basicReply) {
                if (basicReply.status === 200) {
                    try {
                        var response = JSON.parse(basicReply.responseText);
                        if (response.access_token) {
                            var token = "Bearer " + response.access_token;
                            r.variables.token_forward = token;
                            r.headersOut["Token-forward"] = token;
                            r.return(204);
                        } else {
                            r.return(403, "No token in response");
                        }
                    } catch (e) {
                        r.return(500, "JSON parsing error");
                    }
                } else {
                    r.return(basicReply.status);
                }
            });
        } else {
            r.return(reply.status);
        }
    });
}

export default { introspectAccessToken };
```

---

## ✅ Testing & Validation

- Use `curl` or Postman to test with Basic and Bearer tokens.
- NGINX logs (`/var/log/nginx/error.log`) will display debug messages from NJS.
- Confirm forwarded headers are correct via backend inspection.

---

## 💡 Notes

- Works for both legacy (Basic) and modern (Bearer UMA) clients.
- Avoids using `if` or `map` for conditional flows.
- All logic and switching is handled inside NJS for full control.
