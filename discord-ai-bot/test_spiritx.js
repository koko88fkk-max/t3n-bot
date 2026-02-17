async function testApi() {
    try {
        const res = await fetch('https://customer.spiritx.wtf/api/v1/ping');
        console.log('API Response:', res.status);
    } catch (err) {
        console.log('API Error:', err.message);
    }
}

testApi();
