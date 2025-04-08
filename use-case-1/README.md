# nginx-keycloak-auth
## NGINX Integration with Keycloak for Legacy Client Authentication

## Overview
This project demonstrates how to integrate NGINX with Keycloak for validating legacy clients' Basic Authentication credentials and forwarding relevant token attributes to a backend. This solution leverages NGINX JavaScript (NJS) for parsing JSON responses, enabling dynamic processing of access tokens and related attributes.


## Problem Statement
Legacy clients require access to APIs through NGINX, using Basic Authentication (Base64-encoded client-name:client-secret) for authorization. 

To validate these credentials:
- NGINX must make a sideband request to Keycloak’s token endpoint.
- Retrieve the JWT token and validate its content
- Forward the access_token and other relevant attributes as headers to the backend service.

Since JSON parsing is beyond the native capability of NGINX directives, NGINX JavaScript (NJS) is used for this purpose.

## Requirements

Software:
- NGINX (with NGINX JavaScript module ngx_http_js_module)
- Keycloak (configured with realms and clients for validation)
- Postman (for API testing)

Setup Components:
- Keycloak Realm and Client Configuration
- NGINX with JavaScript module enabled
- Backend server (for validating forwarded headers)


## Step-by-Step Guide

1. Keycloak Configuration
```
    Access Keycloak Admin Console:
    Navigate to the Keycloak admin console at https://keycloak.example.com (Internal Keycloak lab setup, forced to resolve to keycloak.example.com)
   
    Create a Realm:
        Go to the Master Realm dropdown and select Add Realm.
        Name the realm (e.g., celcomdigi-realm).

    Set Up a Client:
        Navigate to Clients > Create Client.
        Configure the client:
            Client ID: nginx-client
            Access Type: Confidential
            Authorization Enabled: Yes
            Redirect URIs: Add http://nginx.example.com/*.

    Generate Client Credentials:
        Go to the Credentials tab.
        Note the Client ID and Client Secret for later use.

    Test Keycloak Token Endpoint (Postman):
        URL: https://keycloak.example.com/realms/celcomdigi-realm/protocol/openid-connect/token
        Headers:
            Content-Type: application/x-www-form-urlencoded
            Authorization: Basic <Base64-encoded-clientID:clientSecret>
        Body:
             grant_type=client_credentials
```

Expected Response:

```
        {
            "access_token": "eyJhbGciOi...",
            "expires_in": 1800,
            "token_type": "Bearer"
        }
```        
![keycloak-configuration](https://github.com/user-attachments/assets/fa559443-de15-4074-a4aa-a341ec2046dd)


2. NGINX Configuration
```
A. Load JavaScript Module

Ensure the ngx_http_js_module is loaded. Add this to nginx.conf:

load_module modules/ngx_http_js_module.so;

B. Add the NJS Script
```

Save the following script as oauth_token.js under /etc/nginx/conf.d/:
```
function introspectAccessToken(r) {
    r.log("Starting introspection subrequest...");
    r.subrequest('/_oauth2_send_request', function(reply) {
        r.log(`Subrequest response status: ${reply.status}`);
        r.log(`Subrequest response body: ${reply.responseText}`);

        if (reply.status === 200) {
            try {
                var response = JSON.parse(reply.responseText);
                for (var key in response) {
                    if (response.hasOwnProperty(key)) {
                        var headerName = `Token-${key}`;
                        var headerValue = response[key];

                        if (Array.isArray(headerValue)) {
                            headerValue = headerValue.join(',');
                        }

                        r.headersOut[headerName] = headerValue;
                        r.log(`Added header: ${headerName} = ${headerValue}`);
                    }
                }
                r.return(204);
            } catch (err) {
                r.log(`Error parsing JSON: ${err.message}`);
                r.return(500, "Failed to parse response");
            }
        } else {
            r.return(reply.status);
        }
    });
}

export default { introspectAccessToken };
```


C. Configure NGINX


Save the following as celcom-digi-basic.conf under /etc/nginx/conf.d/:

```
upstream backend_service {
    server 127.0.0.1:8069;
}

resolver 127.0.0.1;

js_import /etc/nginx/conf.d/oauth_token.js;

server {
    listen 80;
    server_name nginx.example.com;

    # Main API endpoint
    location /api {
        auth_request /_oauth2_token_introspection;
        auth_request_set $access_token $sent_http_token_access_token;
        proxy_set_header Authorization "Bearer $access_token";
        proxy_pass http://backend_service;
    }

    # Token introspection with NJS
    location = /_oauth2_token_introspection {
        internal;
        js_content oauth_token.introspectAccessToken;
    }

    # Subrequest to Keycloak
    location /_oauth2_send_request {
        internal;
        proxy_method POST;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Content-Type "application/x-www-form-urlencoded";
        proxy_set_body "grant_type=client_credentials";
        proxy_ssl_server_name on;
        proxy_pass https://keycloak.example.com/realms/celcomdigi-realm/protocol/openid-connect/token;
    }
}
```

3. Validation and Testing

    Start NGINX:
```
    sudo nginx -t && sudo nginx -s reload
```

Send a Request to the /api Endpoint: Use the client’s Basic Authorization header.
    
![postman-token-response](https://github.com/user-attachments/assets/a20055f3-0087-4ac0-86a6-e5f88d10be4f)

    
    Expected behavior:
        Request triggers a sideband call to Keycloak.
        Validated access_token and attributes are forwarded to the backend as headers prefixed with Token-.

    Inspect Logs: Debug logs are stored in /var/log/nginx/error_jwt.log.
    
![Debug_logs](https://github.com/user-attachments/assets/245c095e-b862-4887-a2df-538217363ebd)


Next Steps

If deploying on Kubernetes Ingress, the configuration can be adapted for the ingress controller.
