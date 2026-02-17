const { generateCertificate } = require('./generateCertificate');
const fs = require('fs');

async function test() {
    try {
        console.log('Generating certificate...');
        const buf = await generateCertificate({
            customerName: 'Ahmed_Pro',
            customerId: '123456789012345678',
            productName: 'T3N Spoofer',
            ticketName: 'ticket-ahmed',
            certificateNumber: '000347',
        });
        fs.writeFileSync('test-cert.png', buf);
        console.log('✅ Certificate generated! Size:', buf.length, 'bytes');
    } catch (e) {
        console.error('❌ Error:', e.message);
        console.error(e.stack);
    }
}

test();
