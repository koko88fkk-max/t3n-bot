const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

// Try to register Arabic font (may fail with variable fonts)
try {
    const fontPath = path.join(__dirname, 'assets', 'Cairo-Bold.ttf');
    if (fs.existsSync(fontPath)) {
        registerFont(fontPath, { family: 'Cairo', weight: 'bold' });
        console.log('✅ Cairo font registered');
    }
} catch (e) {
    console.log('⚠️ Cairo font skipped (using system fonts):', e.message);
}

/**
 * Generate a premium customer certificate image
 * @param {Object} options
 * @param {string} options.customerName - Discord username
 * @param {string} options.customerId - Discord user ID
 * @param {string} options.productName - Product purchased
 * @param {string} options.ticketName - Ticket channel name
 * @param {string} options.certificateNumber - Unique cert number
 * @param {string} [options.logoPath] - Path to store logo
 * @returns {Buffer} PNG image buffer
 */
async function generateCertificate(options) {
    const {
        customerName,
        customerId,
        productName = 'T3N Spoofer',
        ticketName = 'N/A',
        certificateNumber,
        logoPath
    } = options;

    const WIDTH = 900;
    const HEIGHT = 560;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // === BACKGROUND: Dark gradient ===
    const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bgGrad.addColorStop(0, '#0a0a1a');
    bgGrad.addColorStop(0.5, '#0d1117');
    bgGrad.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // === SUBTLE PATTERN (grid) ===
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < WIDTH; i += 30) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, HEIGHT); ctx.stroke();
    }
    for (let i = 0; i < HEIGHT; i += 30) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(WIDTH, i); ctx.stroke();
    }

    // === OUTER GOLD BORDER ===
    const borderGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    borderGrad.addColorStop(0, '#FFD700');
    borderGrad.addColorStop(0.3, '#DAA520');
    borderGrad.addColorStop(0.5, '#FFD700');
    borderGrad.addColorStop(0.7, '#DAA520');
    borderGrad.addColorStop(1, '#FFD700');

    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 4;
    roundRect(ctx, 15, 15, WIDTH - 30, HEIGHT - 30, 12);
    ctx.stroke();

    // === INNER SUBTLE BORDER ===
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, 25, 25, WIDTH - 50, HEIGHT - 50, 8);
    ctx.stroke();

    // === CORNER DECORATIONS ===
    drawCornerDecoration(ctx, 20, 20, 1, 1);
    drawCornerDecoration(ctx, WIDTH - 20, 20, -1, 1);
    drawCornerDecoration(ctx, 20, HEIGHT - 20, 1, -1);
    drawCornerDecoration(ctx, WIDTH - 20, HEIGHT - 20, -1, -1);

    // === TOP ACCENT LINE ===
    const accentGrad = ctx.createLinearGradient(100, 0, WIDTH - 100, 0);
    accentGrad.addColorStop(0, 'transparent');
    accentGrad.addColorStop(0.2, '#4169E1');
    accentGrad.addColorStop(0.5, '#FFD700');
    accentGrad.addColorStop(0.8, '#4169E1');
    accentGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = accentGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, 50);
    ctx.lineTo(WIDTH - 100, 50);
    ctx.stroke();

    // === LOGO (if exists) ===
    let logoY = 60;
    if (logoPath && fs.existsSync(logoPath)) {
        try {
            const logo = await loadImage(logoPath);
            const logoSize = 60;
            const logoX = (WIDTH - logoSize) / 2;
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
            ctx.restore();
            logoY += logoSize + 10;
        } catch (e) {
            logoY += 10;
        }
    } else {
        // Draw "T3N" text as logo
        ctx.font = 'bold 36px Cairo, Arial';
        ctx.textAlign = 'center';
        const t3nGrad = ctx.createLinearGradient(WIDTH / 2 - 40, logoY, WIDTH / 2 + 40, logoY + 40);
        t3nGrad.addColorStop(0, '#4169E1');
        t3nGrad.addColorStop(1, '#6B8DD6');
        ctx.fillStyle = t3nGrad;
        ctx.fillText('T3N', WIDTH / 2, logoY + 35);
        logoY += 50;
    }

    // === TITLE ===
    ctx.font = 'bold 28px Cairo, Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('VERIFIED CUSTOMER CERTIFICATE', WIDTH / 2, logoY + 30);

    // Arabic subtitle
    ctx.font = 'bold 18px Cairo, Arial';
    ctx.fillStyle = 'rgba(255, 215, 0, 0.7)';
    ctx.fillText('\u0634\u0647\u0627\u062f\u0629 \u0639\u0645\u064a\u0644 \u0645\u0639\u062a\u0645\u062f', WIDTH / 2, logoY + 58);

    // === DIVIDER LINE ===
    const divGrad = ctx.createLinearGradient(150, 0, WIDTH - 150, 0);
    divGrad.addColorStop(0, 'transparent');
    divGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.5)');
    divGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(150, logoY + 75);
    ctx.lineTo(WIDTH - 150, logoY + 75);
    ctx.stroke();

    // === CERTIFICATE INFO ===
    const startY = logoY + 105;
    const leftCol = 320;
    const rightCol = WIDTH / 2 + 20;

    ctx.textAlign = 'right';
    ctx.font = 'bold 14px Cairo, Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';

    // Labels (right-aligned)
    const labels = [
        { label: 'CUSTOMER', value: customerName },
        { label: 'DATE', value: new Date().toLocaleDateString('en-GB') },
        { label: 'PRODUCT', value: productName },
        { label: 'TICKET', value: ticketName },
        { label: 'CERT #', value: `#T3N-${certificateNumber}` },
    ];

    labels.forEach((item, i) => {
        const y = startY + (i * 38);

        // Label
        ctx.textAlign = 'right';
        ctx.font = 'bold 12px Cairo, Arial';
        ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.fillText(item.label, leftCol, y);

        // Value
        ctx.textAlign = 'left';
        ctx.font = 'bold 16px Cairo, Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(item.value, rightCol, y);

        // Dots between
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillText('·····················', leftCol + 10, y);
    });

    // === VERIFIED BADGE ===
    const badgeY = startY + (labels.length * 38) + 15;
    const badgeX = WIDTH / 2;

    // Badge background
    ctx.beginPath();
    ctx.arc(badgeX, badgeY + 8, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#27AE60';
    ctx.fill();

    // Checkmark
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(badgeX - 6, badgeY + 8);
    ctx.lineTo(badgeX - 1, badgeY + 13);
    ctx.lineTo(badgeX + 8, badgeY + 1);
    ctx.stroke();

    // Verified text
    ctx.font = 'bold 13px Cairo, Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#27AE60';
    ctx.fillText('VERIFIED & AUTHENTICATED', badgeX, badgeY + 35);

    // === STARS ===
    ctx.fillStyle = '#FFD700';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('★ ★ ★ ★ ★', badgeX, badgeY + 55);

    // === BOTTOM DIVIDER ===
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100, HEIGHT - 65);
    ctx.lineTo(WIDTH - 100, HEIGHT - 65);
    ctx.stroke();

    // === FOOTER ===
    ctx.font = 'bold 11px Cairo, Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillText('T3N Store | salla.sa/t3nn | Trusted Since 2024', WIDTH / 2, HEIGHT - 42);
    ctx.fillText(`ID: ${customerId} | Generated: ${new Date().toISOString().slice(0, 19)}`, WIDTH / 2, HEIGHT - 25);

    return canvas.toBuffer('image/png');
}

// === HELPER: Rounded Rectangle ===
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// === HELPER: Corner Decoration ===
function drawCornerDecoration(ctx, x, y, dirX, dirY) {
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 2;

    // L-shape
    ctx.beginPath();
    ctx.moveTo(x, y + (25 * dirY));
    ctx.lineTo(x, y);
    ctx.lineTo(x + (25 * dirX), y);
    ctx.stroke();

    // Small diamond
    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.beginPath();
    ctx.moveTo(x + (5 * dirX), y);
    ctx.lineTo(x + (10 * dirX), y + (5 * dirY));
    ctx.lineTo(x + (5 * dirX), y + (10 * dirY));
    ctx.lineTo(x, y + (5 * dirY));
    ctx.closePath();
    ctx.fill();
}

module.exports = { generateCertificate };
