const chromium = require('chrome-aws-lambda');
const { generateHTML } = require('../template.js');

// Your Shop Config - Keep it on the server for consistency
const SHOP_CONFIG = {
    name: "ม่านธารา ผ้าม่านและของตกแต่ง",
    address: "65/8 หมู่ 2 ต.ท่าศาลา อ.เมือง จ.ลพบุรี 15000",
    phone: "092-985-9395, 082-552-5595",
    taxId: "1234567890123",
    logoUrl: "https://i.imgur.com/l7y85nI.png", // Use your actual logo URL
    vatRate: 0.07
};

// The main function handler
module.exports = async (req, res) => {
    // Allow requests from your GitHub Pages URL
    res.setHeader('Access-Control-Allow-Origin', 'https://grobmak.github.io');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    let browser = null;
    try {
        const payload = req.body;

        const today = new Date();
        const dateThai = today.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const quoteNumber = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

        // Generate the full HTML for the quotation
        const html = generateHTML({ payload, shopConfig: SHOP_CONFIG, quoteNumber, dateThai });

        // Launch Puppeteer
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();

        // Set content to our generated HTML
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Generate the PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', right: '5mm', bottom: '15mm', left: '5mm' }
        });

        // Send the PDF back to the client
        res.setHeader('Content-Type', 'application/pdf');
        res.status(200).send(pdfBuffer);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: `PDF generation failed: ${error.message}` });
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
};