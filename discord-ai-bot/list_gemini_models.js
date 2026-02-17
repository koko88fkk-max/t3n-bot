const https = require('https');

const API_KEY = "AIzaSyD6EgaYZvghnNG1ipL5EmjySyIgSesHY2k";
const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models?key=${API_KEY}`,
    method: 'GET'
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const parsedData = JSON.parse(data);
            if (parsedData.models) {
                console.log("Available Models:");
                parsedData.models.forEach(model => {
                    console.log(model.name);
                });
            } else {
                console.log("No models found or error:", parsedData);
            }
        } catch (e) {
            console.error("Error parsing JSON:", e);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
