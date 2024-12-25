let cachedAccessToken = null;
let tokenExpirationTime = null;

const getAccessToken = async () => {
    const now = new Date();

    // Check if cached token is still valid
    if (cachedAccessToken && now < tokenExpirationTime) {
        return cachedAccessToken;
    }

    // Define your actual refresh token, client ID, and client secret here
    const refreshToken = 'env.refreshToken';
    const clientId = 'env.clientId';
    const clientSecret = 'env.clientSecret';

    const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
    const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
    });

    try {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to get access token: ${response.status} - ${response.statusText}. Response: ${errorText}`);
        }

        const data = await response.json();
        cachedAccessToken = data.access_token;
        // Set the expiration time for 50 minutes
        tokenExpirationTime = new Date(now.getTime() + 50 * 60 * 1000); 

        return cachedAccessToken;
    } catch (error) {
        throw new Error(`Error in getAccessToken: ${error.message}`);
    }
};

const fetchEstimates = async (accessToken, page = 1, limit = 5) => {
    const baseUrl = `https://www.zohoapis.com/invoice/v3/estimates?status=sent&page=${page}&per_page=${limit}`;
    
    try {
        const response = await fetch(baseUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'X-com-zoho-invoice-organizationid': 'env.X-com-zoho-invoice-organizationid' // Include your Organization ID here
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to get estimates: ${response.status} - ${response.statusText}. Response: ${errorText}`);
        }

        const data = await response.json();
        return data.estimates || [];
    } catch (error) {
        throw new Error(`Error in fetchEstimates: ${error.message}`);
    }
};

const fetchContactDetails = async (accessToken, customerId) => {
    const contactUrl = `https://www.zohoapis.com/invoice/v3/contacts/${customerId}`;

    try {
        const response = await fetch(contactUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'X-com-zoho-invoice-organizationid': 'env.X-com-zoho-invoice-organizationid' // Include your Organization ID here
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to get contact details: ${response.status} - ${response.statusText}. Response: ${errorText}`);
        }

        const data = await response.json();
        return data.contact;
    } catch (error) {
        throw new Error(`Error in fetchContactDetails: ${error.message}`);
    }
};


const sendToZapierWebhook = async (email, estimateUrl, customerName) => {
    const zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/xyz';

    const payload = {
        email: email,
        estimate_url: estimateUrl,
        customer_name: customerName
    };

    try {
        const response = await fetch(zapierWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to send data to Zapier: ${response.status} - ${response.statusText}. Response: ${errorText}`);
        }

        return { status: 'success', message: `Successfully sent data to Zapier for estimate URL: ${estimateUrl}` };
    } catch (error) {
        return { status: 'error', message: error.message };
    }
};


const processEstimatesAndSendEmails = async (page = 1) => {
    let output = [];

    try {
        // Step 1: Get Access Token
        const accessToken = await getAccessToken();

        // Step 2: Fetch Estimates
        const estimates = await fetchEstimates(accessToken, page);

        if (estimates.length === 0) {
            return { status: 'info', message: 'No more estimates found.' };
        }

        // Step 3: Loop through each estimate and fetch contact details
        for (let estimate of estimates) {
            const contactDetails = await fetchContactDetails(accessToken, estimate.customer_id);
            const estimateUrl = `https://invoice.zoho.com/app#/quotes/${estimate.estimate_id}`;

            // Step 4: Send data to the webhook for email dispatching
            if (contactDetails && contactDetails.email) {
                const result = await sendToZapierWebhook(contactDetails.email, estimateUrl, contactDetails.contact_name);
                output.push(result);
            } else {
                output.push({ status: 'error', message: `No email found for contact ID: ${estimate.customer_id}` });
            }
        }

        return { status: 'success', data: output };
    } catch (error) {
        return { status: 'error', message: error.message };
    }
};
