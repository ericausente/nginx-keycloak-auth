function introspectAccessToken(r) {
    r.log("Starting introspection subrequest...");
    // Perform subrequest to Keycloak to retrieve the token

    r.subrequest('/_oauth2_send_request', function(reply) {
        r.log(`Subrequest response status: ${reply.status}`);
        r.log(`Subrequest response body: ${reply.responseText}`);

        if (reply.status === 200) {
            try {
                // Parse the JSON response
                var response = JSON.parse(reply.responseText);
                r.log("Parsed JSON response successfully.");

                // Check if the access_token exists
                //if (response.access_token) {
                //    r.log(`Access token found: ${response.access_token}`);
                //    r.headersOut['Authorization'] = `Bearer ${response.access_token}`;
                //    r.return(204); // Token is valid

                for (var key in response) {
                    if (response.hasOwnProperty(key)) {
                        var headerName = `Token-${key}`;
                        var headerValue = response[key];

                        // Convert arrays to comma-separated strings
                        if (Array.isArray(headerValue)) {
                            headerValue = headerValue.join(',');
                        }

                        r.headersOut[headerName] = headerValue;
                        r.log(`Added header: ${headerName} = ${headerValue}`);
                    }
                }

                r.return(204); // Successful validation


            } catch (err) {
                r.log(`Error parsing JSON response: ${err.message}`);
                r.return(500, "Failed to parse Keycloak response");
            }
        } else {
            r.log(`Subrequest failed with status ${reply.status}.`);
            r.return(reply.status, reply.responseText);
        }

    });
}

export default { introspectAccessToken };
